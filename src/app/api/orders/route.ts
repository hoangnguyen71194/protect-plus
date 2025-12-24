import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import {
  getOrdersFromDb,
  getLastSyncTimestamp,
  updateLastSyncTimestamp,
  getBulkSyncState,
  updateBulkSyncState,
  getUnfulfilledOrders,
} from "@/lib/orders";
import {
  countOrdersSinceDate,
  fetchOrdersIncremental,
  startOrdersBulk,
  getCurrentBulkOperation,
  downloadBulkData,
  fetchOrdersByIds,
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
              const now = new Date().toISOString();
              for (let i = 0; i < orders.length; i += batchSize) {
                const batch = orders.slice(i, i + batchSize);
                const operations = batch.map((order) => ({
                  updateOne: {
                    filter: { id: order.id },
                    update: {
                      $set: {
                        ...order,
                        syncStatus: "success" as const,
                        syncedAt: now,
                        syncError: undefined,
                      },
                    },
                    upsert: true,
                  },
                }));

                await ordersCollection.bulkWrite(operations);
              }

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
        // Incremental sync: check how many orders have been updated since last sync
        console.log(
          `Incremental sync: Checking orders updated since ${lastSyncAt}`
        );
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

      // Also fetch unfulfilled orders to re-sync them (to track fulfillment status changes)
      console.log("Fetching unfulfilled orders for re-sync...");
      const unfulfilledOrders = await getUnfulfilledOrders();
      const unfulfilledOrderIds = unfulfilledOrders.map((o) => o.id);

      if (unfulfilledOrderIds.length > 0) {
        console.log(
          `Found ${unfulfilledOrderIds.length} unfulfilled orders to re-sync`
        );
        try {
          const reSyncedOrders = await fetchOrdersByIds(unfulfilledOrderIds);
          // Add re-synced orders to the main list (will be deduplicated by ID when saving)
          allOrders.push(...reSyncedOrders);
        } catch (error) {
          console.error("Error re-syncing unfulfilled orders:", error);
          // Continue with the main sync even if re-sync fails
        }
      }

      // Save orders to database
      const db = await getDb();
      const ordersCollection = db.collection<Order>("orders");

      // Batch write operations for better performance
      const batchSize = 1000;
      const now = new Date().toISOString();

      // Deduplicate orders by ID (in case unfulfilled orders overlap with updated orders)
      const orderMap = new Map<string, Order>();
      allOrders.forEach((order) => {
        orderMap.set(order.id, order);
      });
      const uniqueOrders = Array.from(orderMap.values());

      // Check which orders already exist and compare to detect actual changes
      const orderIds = uniqueOrders.map((o) => o.id);
      const existingOrders = await ordersCollection
        .find({ id: { $in: orderIds } })
        .toArray();
      const existingOrdersMap = new Map(
        existingOrders.map((o) => [String(o.id), o])
      );

      // Helper function to check if an order has actual changes
      const hasOrderChanged = (
        newOrder: Order,
        existingOrder: Order
      ): boolean => {
        // Compare key fields that might change
        const fieldsToCompare: (keyof Order)[] = [
          "updated_at",
          "financial_status",
          "fulfillment_status",
          "total_price",
          "subtotal_price",
          "total_tax",
          "email",
        ];

        for (const field of fieldsToCompare) {
          if (newOrder[field] !== existingOrder[field]) {
            return true;
          }
        }

        // Compare shipping address
        const newShipping = newOrder.shipping_address;
        const existingShipping = existingOrder.shipping_address;
        if (
          JSON.stringify(newShipping || {}) !==
          JSON.stringify(existingShipping || {})
        ) {
          return true;
        }

        // Compare line items (check if count or items changed)
        if (
          newOrder.line_items.length !== existingOrder.line_items.length ||
          JSON.stringify(newOrder.line_items) !==
            JSON.stringify(existingOrder.line_items)
        ) {
          return true;
        }

        // Compare customer
        const newCustomer = newOrder.customer;
        const existingCustomer = existingOrder.customer;
        if (
          JSON.stringify(newCustomer || {}) !==
          JSON.stringify(existingCustomer || {})
        ) {
          return true;
        }

        return false;
      };

      let newCount = 0;
      let updatedCount = 0;

      // Count new vs updated before writing
      uniqueOrders.forEach((order) => {
        const orderIdStr = String(order.id);
        const existingOrder = existingOrdersMap.get(orderIdStr);

        if (!existingOrder) {
          // Order doesn't exist - it's new
          newCount++;
        } else {
          // Order exists - check if it has actual changes
          if (hasOrderChanged(order, existingOrder)) {
            updatedCount++;
          }
          // If no changes, don't count it (it's unchanged)
        }
      });

      console.log(
        `Sync stats: ${newCount} new, ${updatedCount} updated, ${
          uniqueOrders.length - newCount - updatedCount
        } unchanged out of ${uniqueOrders.length} total`
      );

      for (let i = 0; i < uniqueOrders.length; i += batchSize) {
        const batch = uniqueOrders.slice(i, i + batchSize);
        const operations = batch.map((order) => ({
          updateOne: {
            filter: { id: order.id },
            update: {
              $set: {
                ...order,
                syncStatus: "success" as const,
                syncedAt: now,
                syncError: undefined,
              },
            },
            upsert: true,
          },
        }));

        await ordersCollection.bulkWrite(operations);
      }

      // Update last sync timestamp
      await updateLastSyncTimestamp(now);

      // Ensure we always return both counts (even if 0)
      const response = {
        success: true,
        synced: uniqueOrders.length,
        new: newCount || 0,
        updated: updatedCount || 0,
        method: syncMethod,
        isFirstSync,
      };

      console.log("Sync response:", JSON.stringify(response, null, 2));

      return NextResponse.json(response);
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
