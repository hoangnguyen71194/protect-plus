import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import {
  getOrdersFromDb,
  getLastSyncTimestamp,
  updateLastSyncTimestamp,
  getBulkSyncState,
  updateBulkSyncState,
} from "@/lib/orders";
import {
  countOrdersSinceDate,
  fetchOrdersIncremental,
  startOrdersBulk,
  getCurrentBulkOperation,
  downloadBulkData,
} from "@/lib/shopify";
import { Order } from "@/types/order";

function normalizeStatus(
  status?: string
): "idle" | "pending" | "completed" | "failed" | "canceled" {
  if (!status) return "idle";
  const s = status.toLowerCase();
  if (s === "completed") return "completed";
  if (s === "failed") return "failed";
  if (s === "canceled") return "canceled";
  if (s === "created" || s === "running") return "pending";
  return "idle";
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const statusCheck = searchParams.get("status");

    // Bulk status endpoint
    if (statusCheck === "bulk") {
      const db = await getDb();
      const ordersCollection = db.collection<Order>("orders");

      // Fast path: read cached state
      const state = await getBulkSyncState();

      // If state is pending, check Shopify to see current status
      if (state.status === "pending") {
        const operation = await getCurrentBulkOperation();

        if (!operation) {
          await updateBulkSyncState({ status: "idle", operationId: undefined });
          return NextResponse.json({ status: "idle" });
        }

        const normalizedStatus = normalizeStatus(operation.status);

        // If operation is completed and we have a URL, start finalization in background
        if (normalizedStatus === "completed" && operation.url) {
          // Check if we already have synced count (finalization completed)
          if (state.synced !== undefined) {
            return NextResponse.json({
              status: "idle",
              synced: state.synced,
            });
          }

          // Start finalization in background (don't await)
          (async () => {
            try {
              // Set status to pending during finalization
              await updateBulkSyncState({
                status: "pending",
                operationId: operation.id,
              });

              // Download and parse the data
              const orders = await downloadBulkData(operation.url!);

              // Save to database in batches
              const batchSize = 1000;
              for (let i = 0; i < orders.length; i += batchSize) {
                const batch = orders.slice(i, i + batchSize);
                const operations = batch.map((order) => ({
                  updateOne: {
                    filter: { id: order.id },
                    update: { $set: order },
                    upsert: true,
                  },
                }));

                await ordersCollection.bulkWrite(operations);
              }

              const now = new Date().toISOString();
              await updateLastSyncTimestamp(now);

              // Mark as completed with synced count
              await updateBulkSyncState({
                status: "idle",
                operationId: undefined,
                synced: orders.length,
              });
            } catch (error) {
              console.error("Error finalizing bulk sync:", error);
              await updateBulkSyncState({
                status: "failed",
                operationId: operation.id,
              });
            }
          })();

          // Return pending status immediately
          return NextResponse.json({
            status: "pending",
            operationId: operation.id,
          });
        }

        // Update cached state with current status
        await updateBulkSyncState({
          status: normalizedStatus,
          operationId: operation.id,
        });

        return NextResponse.json({
          status: normalizedStatus,
          operationId: operation.id,
          url: operation.url,
        });
      }

      // If not pending, return cached state
      return NextResponse.json({
        status: state.status,
        operationId: state.operationId,
        synced: state.synced,
      });
    }

    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    const data = await getOrdersFromDb(page, limit);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching orders:", error);
    return NextResponse.json(
      { error: "Failed to fetch orders" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sync = false } = body;

    if (sync) {
      // Check if a bulk operation is already in progress
      const currentOperation = await getCurrentBulkOperation();
      if (currentOperation) {
        const status = currentOperation.status?.toUpperCase();
        if (status === "RUNNING" || status === "CREATED") {
          return NextResponse.json(
            {
              success: false,
              error:
                "A bulk sync is already in progress. Please wait for it to complete.",
              status: "pending",
              operationId: currentOperation.id,
            },
            { status: 409 } // Conflict status
          );
        }
      }

      // Get last sync timestamp
      const lastSyncAt = await getLastSyncTimestamp();
      const isFirstSync = !lastSyncAt;

      let allOrders: Order[];
      let syncMethod: "bulk" | "incremental";

      if (isFirstSync) {
        // First sync: start bulk operation asynchronously, return pending state
        console.log("First sync: starting bulk operation (async)");
        const { operationId } = await startOrdersBulk();
        // Update bulk sync state to pending
        await updateBulkSyncState({
          status: "pending",
          operationId,
        });
        return NextResponse.json(
          {
            success: true,
            status: "pending",
            method: "bulk",
            operationId,
            isFirstSync: true,
          },
          { status: 202 }
        );
      } else {
        // Incremental sync: check how many orders need to be synced
        console.log(`Incremental sync: Checking orders since ${lastSyncAt}`);
        const orderCount = await countOrdersSinceDate(lastSyncAt);

        // Threshold: if more than 100 orders, use bulk; otherwise use regular GraphQL
        const BULK_THRESHOLD = 100;

        if (orderCount > BULK_THRESHOLD) {
          console.log(
            `Found ${orderCount} orders (threshold: ${BULK_THRESHOLD}). Using bulk operations.`
          );
          const { operationId } = await startOrdersBulk(lastSyncAt);
          // Update bulk sync state to pending
          await updateBulkSyncState({
            status: "pending",
            operationId,
          });
          return NextResponse.json(
            {
              success: true,
              status: "pending",
              method: "bulk",
              operationId,
              isFirstSync: false,
            },
            { status: 202 }
          );
        } else {
          console.log(
            `Found ${orderCount} orders (threshold: ${BULK_THRESHOLD}). Using regular GraphQL queries.`
          );
          allOrders = await fetchOrdersIncremental(lastSyncAt);
          syncMethod = "incremental";
        }
      }

      // Save orders to database
      const db = await getDb();
      const ordersCollection = db.collection<Order>("orders");

      // Batch write operations for better performance
      const batchSize = 1000;
      for (let i = 0; i < allOrders.length; i += batchSize) {
        const batch = allOrders.slice(i, i + batchSize);
        const operations = batch.map((order) => ({
          updateOne: {
            filter: { id: order.id },
            update: { $set: order },
            upsert: true,
          },
        }));

        await ordersCollection.bulkWrite(operations);
      }

      // Update last sync timestamp
      const now = new Date().toISOString();
      await updateLastSyncTimestamp(now);

      return NextResponse.json({
        success: true,
        synced: allOrders.length,
        method: syncMethod,
        isFirstSync,
      });
    }

    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  } catch (error) {
    console.error("Error syncing orders:", error);
    return NextResponse.json(
      { error: "Failed to sync orders" },
      { status: 500 }
    );
  }
}
