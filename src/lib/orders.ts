import { getDb } from "./mongodb";
import { Order, OrderMetrics } from "@/types/order";

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

  // const startDate = new Date();
  // startDate.setDate(startDate.getDate() - days);
  // startDate.setHours(0, 0, 0, 0); // Start of day
  // const startDateISO = startDate.toISOString();
  // console.log("startDateISO", startDateISO);
  // Query orders from the last N days
  // Since created_at is stored as ISO string, we can use string comparison
  const orders = await ordersCollection
    .find({
      // created_at: { $gte: startDateISO },
    })
    .sort({ created_at: 1 })
    .toArray();
  console.log("getMetricsFromDb", orders);

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
