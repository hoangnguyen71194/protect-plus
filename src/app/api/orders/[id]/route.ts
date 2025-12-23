import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { serializeOrder } from "@/lib/orders";
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
