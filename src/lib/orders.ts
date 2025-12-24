import { getDb } from "./mongodb";
import { Order, OrderMetrics } from "@/types/order";

interface SyncMetadata {
  _id: string;
  lastSyncAt: string;
  updatedAt: string;
}

interface BulkSyncState {
  _id: string;
  status: "idle" | "pending" | "completed" | "failed" | "canceled";
  operationId?: string;
  updatedAt: string;
  synced?: number;
}

const SYNC_METADATA_KEY = "sync_metadata";
const BULK_STATE_KEY = "bulk_state";
const BULK_STATE_TTL_MS = 60_000;

let cachedBulkState: BulkSyncState | null = null;
let cachedBulkStateAt = 0;

export function serializeOrder(order: Order): Order {
  return {
    ...order,
    id: order.id,
    order_number: order.order_number,
    email: order.email,
    created_at: order.created_at,
    updated_at: order.updated_at,
    total_price: order.total_price,
    subtotal_price: order.subtotal_price,
    total_tax: order.total_tax,
    total_shipping_price_set: order.total_shipping_price_set,
    shipping_address: order.shipping_address
      ? {
          first_name: order.shipping_address.first_name,
          last_name: order.shipping_address.last_name,
          address1: order.shipping_address.address1,
          address2: order.shipping_address.address2,
          city: order.shipping_address.city,
          province: order.shipping_address.province,
          country: order.shipping_address.country,
          zip: order.shipping_address.zip,
        }
      : undefined,
    line_items: order.line_items.map((item) => ({
      id: item.id,
      title: item.title,
      quantity: item.quantity,
      price: item.price,
      sku: item.sku,
    })),
    financial_status: order.financial_status,
    fulfillment_status: order.fulfillment_status,
    currency: order.currency,
    customer: order.customer
      ? {
          id: order.customer.id,
          email: order.customer.email,
          first_name: order.customer.first_name,
          last_name: order.customer.last_name,
        }
      : undefined,
    syncStatus: order.syncStatus,
    syncError: order.syncError,
    syncedAt: order.syncedAt,
  };
}

export async function getOrdersFromDb(page: number = 1, limit: number = 20) {
  const db = await getDb();
  const ordersCollection = db.collection<Order>("orders");

  const total = await ordersCollection.countDocuments();
  const orders = await ordersCollection
    .find({})
    .sort({ created_at: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .toArray();
  return {
    orders: orders.map((order) => serializeOrder(order)),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getMetricsFromDb(days: number = 30) {
  const db = await getDb();
  const ordersCollection = db.collection<Order>("orders");

  // Query orders from the last N days
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0); // Start of day
  const startDateISO = startDate.toISOString();

  // Since created_at is stored as ISO string, we can use string comparison
  const orders = await ordersCollection
    .find({
      created_at: { $gte: startDateISO },
    })
    .sort({ created_at: 1 })
    .toArray();

  const metricsByDate = new Map<string, OrderMetrics>();

  orders.forEach((order) => {
    if (!order.created_at) {
      return; // Skip orders without created_at
    }

    try {
      const orderDate = new Date(order.created_at);
      if (isNaN(orderDate.getTime())) {
        return; // Skip invalid dates
      }

      const date = orderDate.toISOString().split("T")[0];
      const existing = metricsByDate.get(date) || {
        date,
        orderCount: 0,
        revenue: 0,
        shippingCost: 0,
      };

      existing.orderCount += 1;
      existing.revenue += parseFloat(order.total_price || "0");
      const shippingAmount =
        parseFloat(order.total_shipping_price_set?.shop_money?.amount || "0") ||
        0;
      existing.shippingCost += shippingAmount;

      metricsByDate.set(date, existing);
    } catch (error) {
      console.error("Error processing order date:", error, order);
    }
  });

  const metrics = Array.from(metricsByDate.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  const totalRevenue = metrics.reduce((sum, m) => sum + m.revenue, 0);
  const totalShipping = metrics.reduce((sum, m) => sum + m.shippingCost, 0);
  const totalOrders = metrics.reduce((sum, m) => sum + m.orderCount, 0);

  return {
    metrics,
    summary: {
      totalOrders,
      totalRevenue,
      totalShipping,
      averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
    },
  };
}

/**
 * Get the last sync timestamp from the database
 */
export async function getLastSyncTimestamp(): Promise<string | null> {
  const db = await getDb();
  const metadataCollection = db.collection<SyncMetadata>("sync_metadata");

  const metadata = await metadataCollection.findOne({
    _id: SYNC_METADATA_KEY,
  });
  return metadata?.lastSyncAt || null;
}

/**
 * Update the last sync timestamp
 */
export async function updateLastSyncTimestamp(
  timestamp: string
): Promise<void> {
  const db = await getDb();
  const metadataCollection = db.collection<SyncMetadata>("sync_metadata");

  await metadataCollection.updateOne(
    { _id: SYNC_METADATA_KEY },
    {
      $set: {
        lastSyncAt: timestamp,
        updatedAt: new Date().toISOString(),
      },
    },
    { upsert: true }
  );
}

/**
 * Get the cached bulk sync state to avoid frequent Shopify checks
 */
export async function getBulkSyncState(): Promise<BulkSyncState> {
  const now = Date.now();
  if (cachedBulkState && now - cachedBulkStateAt < BULK_STATE_TTL_MS) {
    return cachedBulkState;
  }

  const db = await getDb();
  const stateCollection = db.collection<BulkSyncState>("sync_state");
  const state =
    (await stateCollection.findOne({ _id: BULK_STATE_KEY })) ||
    ({
      _id: BULK_STATE_KEY,
      status: "idle",
      updatedAt: new Date(0).toISOString(),
    } as BulkSyncState);

  cachedBulkState = state;
  cachedBulkStateAt = now;
  return state;
}

/**
 * Update bulk sync state and refresh the in-memory cache
 */
export async function updateBulkSyncState(
  partial: Partial<BulkSyncState>
): Promise<void> {
  const db = await getDb();
  const stateCollection = db.collection<BulkSyncState>("sync_state");

  const newState: BulkSyncState = {
    _id: BULK_STATE_KEY,
    status: "idle",
    updatedAt: new Date().toISOString(),
    ...partial,
  } as BulkSyncState;

  await stateCollection.updateOne(
    { _id: BULK_STATE_KEY },
    { $set: { ...newState, updatedAt: newState.updatedAt } },
    { upsert: true }
  );

  cachedBulkState = newState;
  cachedBulkStateAt = Date.now();
}

/**
 * Get unfulfilled orders from the database that need to be re-synced
 */
export async function getUnfulfilledOrders(): Promise<Order[]> {
  const db = await getDb();
  const ordersCollection = db.collection<Order>("orders");

  // Get orders that are not fulfilled (null, undefined, or not "fulfilled")
  // $ne: "fulfilled" will match null, undefined, and any other value that's not "fulfilled"
  const orders = await ordersCollection
    .find({
      $or: [
        { fulfillment_status: { $exists: false } },
        { fulfillment_status: { $ne: "fulfilled" } },
      ],
    })
    .limit(1000) // Limit to prevent too many re-syncs
    .toArray();

  return orders.map((order) => serializeOrder(order));
}
