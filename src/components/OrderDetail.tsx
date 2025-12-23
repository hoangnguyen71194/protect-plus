"use client";

import { useOrder } from "@/hooks/useOrder";
import Link from "next/link";

interface OrderDetailProps {
  orderId: string;
}

export default function OrderDetail({ orderId }: OrderDetailProps) {
  const { data, isLoading, error } = useOrder(orderId);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatCurrency = (amount: string, currency = "USD") => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(parseFloat(amount));
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-48"></div>
          <div className="h-4 bg-gray-200 rounded w-32"></div>
          <div className="space-y-2">
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
        <div className="text-center text-red-500">
          <p className="mb-4">Error loading order: {error.message}</p>
          <Link
            href="/orders"
            className="text-blue-600 hover:text-blue-700 underline"
          >
            Back to Orders
          </Link>
        </div>
      </div>
    );
  }

  const order = data?.order;

  if (!order) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
        <div className="text-center text-gray-500">
          <p className="mb-4">Order not found</p>
          <Link
            href="/orders"
            className="text-blue-600 hover:text-blue-700 underline"
          >
            Back to Orders
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Order #{order.order_number}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {formatDate(order.created_at)}
            </p>
          </div>
          <div className="flex gap-2">
            <span
              className={`px-3 py-1 text-sm font-medium rounded-full ${
                order.financial_status === "paid"
                  ? "bg-green-100 text-green-800"
                  : "bg-yellow-100 text-yellow-800"
              }`}
            >
              {order.financial_status || "pending"}
            </span>
            {order.fulfillment_status && (
              <span className="px-3 py-1 text-sm font-medium rounded-full bg-blue-100 text-blue-800">
                {order.fulfillment_status}
              </span>
            )}
          </div>
        </div>
        <Link
          href="/orders"
          className="inline-flex items-center text-sm text-blue-600 hover:text-blue-700"
        >
          <svg
            className="w-4 h-4 mr-1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to Orders
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Line Items */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Order Items
            </h2>
            <div className="space-y-4">
              {order.line_items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start justify-between py-4 border-b border-gray-200 last:border-0"
                >
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-gray-900">
                      {item.title}
                    </h3>
                    {item.sku && (
                      <p className="text-sm text-gray-500 mt-1">
                        SKU: {item.sku}
                      </p>
                    )}
                    <p className="text-sm text-gray-500 mt-1">
                      Quantity: {item.quantity}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">
                      {formatCurrency(item.price, order.currency)}
                    </p>
                    <p className="text-sm text-gray-500">
                      {formatCurrency(
                        (parseFloat(item.price) * item.quantity).toString(),
                        order.currency
                      )}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Customer Info */}
          {order.customer && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Customer
              </h2>
              <div className="space-y-2 text-sm">
                <div>
                  <p className="text-gray-500">Name</p>
                  <p className="text-gray-900 font-medium">
                    {order.customer.first_name || ""}{" "}
                    {order.customer.last_name || ""}
                  </p>
                </div>
                {order.customer.email && (
                  <div>
                    <p className="text-gray-500">Email</p>
                    <p className="text-gray-900">{order.customer.email}</p>
                  </div>
                )}
                {order.email && order.email !== order.customer.email && (
                  <div>
                    <p className="text-gray-500">Order Email</p>
                    <p className="text-gray-900">{order.email}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Shipping Address */}
          {order.shipping_address && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Shipping Address
              </h2>
              <div className="text-sm text-gray-900 space-y-1">
                <p>
                  {order.shipping_address.first_name}{" "}
                  {order.shipping_address.last_name}
                </p>
                {order.shipping_address.address1 && (
                  <p>{order.shipping_address.address1}</p>
                )}
                {order.shipping_address.address2 && (
                  <p>{order.shipping_address.address2}</p>
                )}
                <p>
                  {order.shipping_address.city}
                  {order.shipping_address.province &&
                    `, ${order.shipping_address.province}`}
                </p>
                <p>
                  {order.shipping_address.country} {order.shipping_address.zip}
                </p>
              </div>
            </div>
          )}

          {/* Order Summary */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Order Summary
            </h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Subtotal</span>
                <span className="text-gray-900">
                  {formatCurrency(order.subtotal_price, order.currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Tax</span>
                <span className="text-gray-900">
                  {formatCurrency(order.total_tax, order.currency)}
                </span>
              </div>
              {order.total_shipping_price_set?.shop_money?.amount && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Shipping</span>
                  <span className="text-gray-900">
                    {formatCurrency(
                      order.total_shipping_price_set.shop_money.amount,
                      order.currency
                    )}
                  </span>
                </div>
              )}
              <div className="flex justify-between pt-3 border-t border-gray-200">
                <span className="text-base font-semibold text-gray-900">
                  Total
                </span>
                <span className="text-base font-semibold text-gray-900">
                  {formatCurrency(order.total_price, order.currency)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
