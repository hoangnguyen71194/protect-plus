import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { serializeOrder } from "@/lib/orders";
import { fetchOrderById } from "@/lib/shopify";
import { Order } from "@/types/order";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = await getDb();
    const ordersCollection = db.collection<Order>("orders");

    const order = await ordersCollection.findOne({ id });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json({ order: serializeOrder(order) });
  } catch (error) {
    console.error("Error fetching order:", error);
    return NextResponse.json(
      { error: "Failed to fetch order" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = await getDb();
    const ordersCollection = db.collection<Order>("orders");

    // First, mark as pending
    await ordersCollection.updateOne(
      { id },
      {
        $set: {
          syncStatus: "pending" as const,
          syncError: undefined,
        },
      }
    );

    try {
      // Fetch order from Shopify
      const order = await fetchOrderById(id);
      const now = new Date().toISOString();

      // Save to database with success status
      await ordersCollection.updateOne(
        { id },
        {
          $set: {
            ...order,
            updated_at: now,
            syncStatus: "success" as const,
            syncedAt: now,
            syncError: undefined,
          },
        },
        { upsert: true }
      );

      return NextResponse.json({
        success: true,
        order: serializeOrder(order),
      });
    } catch (error) {
      // Mark as failed with error message
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      await ordersCollection.updateOne(
        { id },
        {
          $set: {
            syncStatus: "failed" as const,
            syncError: errorMessage,
          },
        }
      );

      return NextResponse.json(
        { success: false, error: errorMessage },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Error syncing order:", error);
    return NextResponse.json(
      { error: "Failed to sync order" },
      { status: 500 }
    );
  }
}
