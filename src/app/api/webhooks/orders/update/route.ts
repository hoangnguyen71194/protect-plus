import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import {
  verifyWebhookSignature,
  transformWebhookOrderToOrder,
} from "@/lib/shopify";
import { Order } from "@/types/order";

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get("x-shopify-hmac-sha256");

    if (!signature) {
      return NextResponse.json(
        { error: "Missing webhook signature" },
        { status: 401 }
      );
    }

    const webhookSecret = process.env.SHOPIFY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return NextResponse.json(
        { error: "Webhook secret not configured" },
        { status: 500 }
      );
    }

    const isValid = verifyWebhookSignature(body, signature, webhookSecret);
    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid webhook signature" },
        { status: 401 }
      );
    }

    const webhookOrder = JSON.parse(body);
    const order = transformWebhookOrderToOrder(webhookOrder);

    const db = await getDb();
    const ordersCollection = db.collection<Order>("orders");

    const now = new Date().toISOString();
    await ordersCollection.updateOne(
      { id: order.id },
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

    return NextResponse.json({ success: true, orderId: order.id });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: "Failed to process webhook" },
      { status: 500 }
    );
  }
}
