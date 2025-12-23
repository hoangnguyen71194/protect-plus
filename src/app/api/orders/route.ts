import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getOrdersFromDb } from "@/lib/orders";
import { Order } from "@/types/order";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
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
      // Use bulk operations for efficient syncing
      const { syncOrdersBulk } = await import("@/lib/shopify");
      const allOrders = await syncOrdersBulk();

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

      return NextResponse.json({
        success: true,
        synced: allOrders.length,
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
