"use client";

import { useState } from "react";
import Link from "next/link";
import { useOrders, useSyncOrders, useBulkSyncStatus } from "@/hooks/useOrders";
import {
  ClockIcon,
  SearchIcon,
  SpinnerIcon,
  SyncIcon,
} from "@/components/icons";

interface OrderListProps {
  initialPage?: number;
  initialLimit?: number;
}

export default function OrderList({
  initialPage = 1,
  initialLimit = 10,
}: OrderListProps) {
  const [page, setPage] = useState(initialPage);
  const [limit, setLimit] = useState(initialLimit);
  const [searchQuery, setSearchQuery] = useState("");
  const { data, isLoading, error } = useOrders(page, limit);
  const syncMutation = useSyncOrders();
  const {
    data: bulkStatusData,
    isFetching: isFetchingBulkStatus,
    isFinalizing,
  } = useBulkSyncStatus();

  const bulkStatus = bulkStatusData?.status || "idle";
  const isBulkPending = bulkStatus === "pending" || isFinalizing;
  const isBulkFailed = bulkStatus === "failed" || bulkStatus === "canceled";
  const isCheckingBulkStatus = isFetchingBulkStatus && !bulkStatusData;

  // Show loading overlay only for incremental sync (not bulk)
  const isIncrementalSyncing = syncMutation.isPending && !isBulkPending;

  const allOrders = data?.orders || [];
  const pagination = data?.pagination || {
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  };

  // Filter orders based on search query
  const filteredOrders = allOrders.filter((order) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      order.order_number.toString().includes(query) ||
      order.email?.toLowerCase().includes(query) ||
      order.customer?.first_name?.toLowerCase().includes(query) ||
      order.customer?.last_name?.toLowerCase().includes(query) ||
      order.id.toLowerCase().includes(query)
    );
  });

  const orders = filteredOrders;

  const handleSync = () => {
    if (syncMutation.isPending || isBulkPending) return;
    syncMutation.mutate();
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
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

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 relative">
      <div className="p-6 border-b border-gray-200">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative">
            <input
              type="text"
              placeholder="Search orders..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="w-full sm:w-64 pl-10 pr-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <SearchIcon className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
          </div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            {/* Search Input */}

            <div className="flex items-center gap-4">
              {!isBulkPending && !isCheckingBulkStatus && (
                <button
                  onClick={handleSync}
                  disabled={
                    syncMutation.isPending ||
                    isBulkPending ||
                    isCheckingBulkStatus
                  }
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {syncMutation.isPending ? (
                    <>
                      <SpinnerIcon className="animate-spin h-4 w-4" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <SyncIcon className="h-4 w-4" />
                      Sync from Shopify
                    </>
                  )}
                </button>
              )}
              {isCheckingBulkStatus && (
                <div className="px-4 py-2 text-sm font-medium text-gray-600 flex items-center gap-2">
                  <SpinnerIcon className="animate-spin h-4 w-4 text-blue-600" />
                  Checking status...
                </div>
              )}
              <label className="text-sm text-gray-600">Items per page:</label>
              <select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
                className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {isIncrementalSyncing && (
        <div className="px-6 py-3 bg-blue-50 border-b border-blue-100 text-sm text-blue-800 flex items-center gap-2">
          <SpinnerIcon className="h-4 w-4 text-blue-500 animate-spin" />
          <span>
            Syncing orders from Shopify... You can still view existing orders
            below.
          </span>
        </div>
      )}

      {isCheckingBulkStatus && (
        <div className="px-6 py-3 bg-blue-50 border-b border-blue-100 text-sm text-blue-800 flex items-center gap-2">
          <SpinnerIcon className="h-4 w-4 text-blue-500 animate-spin" />
          <span>Checking bulk sync status...</span>
        </div>
      )}

      {isFinalizing && !isCheckingBulkStatus && (
        <div className="px-6 py-3 bg-blue-50 border-b border-blue-100 text-sm text-blue-800 flex items-center gap-2">
          <SpinnerIcon className="h-4 w-4 text-blue-500 animate-spin" />
          <span>
            Finalizing bulk sync (downloading and saving data)... You can still
            view existing orders below.
          </span>
        </div>
      )}

      {isBulkPending && !isCheckingBulkStatus && !isFinalizing && (
        <div className="px-6 py-3 bg-blue-50 border-b border-blue-100 text-sm text-blue-800 flex items-center gap-2">
          <ClockIcon className="h-4 w-4 text-blue-500 animate-spin" />
          <span>
            Bulk sync in progress. This may take a few minutes. You can still
            view existing orders below.
          </span>
        </div>
      )}

      {isBulkFailed && !isCheckingBulkStatus && (
        <div className="px-6 py-3 bg-red-50 border-b border-red-100 text-sm text-red-800 flex items-center gap-2">
          <span>Bulk sync {bulkStatus}. Please try syncing again.</span>
        </div>
      )}

      {isLoading ? (
        <div className="overflow-x-auto">
          <table className="w-full table-fixed min-w-[1000px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[120px]">
                  Order #
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[180px]">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[250px]">
                  Customer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[100px]">
                  Items
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[130px]">
                  Total
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[120px]">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {Array.from({ length: limit }).map((_, index) => (
                <tr key={index} className="animate-pulse">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="h-4 bg-gray-200 rounded w-16"></div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="h-4 bg-gray-200 rounded w-32"></div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="h-4 bg-gray-200 rounded w-40"></div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="h-4 bg-gray-200 rounded w-20"></div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="h-4 bg-gray-200 rounded w-24"></div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="h-6 bg-gray-200 rounded-full w-16"></div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : error ? (
        <div className="p-8 text-center text-red-500">
          Error loading orders: {error.message}
        </div>
      ) : orders.length === 0 ? (
        <div className="p-8 text-center text-gray-500 space-y-3">
          {isCheckingBulkStatus ? (
            <div className="flex flex-col items-center gap-3">
              <div className="px-6 py-3 bg-blue-50 border border-blue-100 rounded-md text-sm text-blue-800 flex items-center gap-2">
                <SpinnerIcon className="h-4 w-4 text-blue-500 animate-spin" />
                <span>Checking bulk sync status...</span>
              </div>
            </div>
          ) : isBulkPending || isFinalizing ? (
            <div className="flex flex-col items-center gap-3"></div>
          ) : isBulkFailed ? (
            <div className="flex flex-col items-center gap-3">
              <div className="px-6 py-3 bg-red-50 border border-red-100 rounded-md text-sm text-red-800 flex items-center gap-2">
                <span>Bulk sync {bulkStatus}. Please try again.</span>
              </div>
              <button
                onClick={handleSync}
                disabled={syncMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <SyncIcon className="h-4 w-4" />
                Retry Sync
              </button>
            </div>
          ) : searchQuery ? (
            <div>No orders found matching your search.</div>
          ) : (
            <>
              <div>No orders yet. Sync from Shopify to get started.</div>
              <button
                onClick={handleSync}
                disabled={syncMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
              >
                {syncMutation.isPending ? (
                  <>
                    <SpinnerIcon className="animate-spin h-4 w-4" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <SyncIcon className="h-4 w-4" />
                    Sync from Shopify
                  </>
                )}
              </button>
            </>
          )}
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full table-fixed min-w-[1000px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[120px]">
                    Order #
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[180px]">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[250px]">
                    Customer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[100px]">
                    Items
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[130px]">
                    Total
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[120px]">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      <Link
                        href={`/orders/${order.id}`}
                        className="text-blue-600 hover:text-blue-700 hover:underline"
                      >
                        #{order.order_number}
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(order.created_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {order.customer
                        ? `${order.customer.first_name || ""} ${
                            order.customer.last_name || ""
                          }`.trim() || order.email
                        : order.email || "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {order.line_items.length} item
                      {order.line_items.length !== 1 ? "s" : ""}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {formatCurrency(order.total_price, order.currency)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${
                          order.financial_status === "paid"
                            ? "bg-green-100 text-green-800"
                            : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {order.financial_status || "pending"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-4 p-4">
            {orders.map((order) => (
              <div
                key={order.id}
                className="bg-gray-50 rounded-lg p-4 border border-gray-200"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <Link
                      href={`/orders/${order.id}`}
                      className="text-sm font-semibold text-blue-600 hover:text-blue-700 hover:underline"
                    >
                      Order #{order.order_number}
                    </Link>
                    <div className="text-xs text-gray-500 mt-1">
                      {formatDate(order.created_at)}
                    </div>
                  </div>
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded-full ${
                      order.financial_status === "paid"
                        ? "bg-green-100 text-green-800"
                        : "bg-yellow-100 text-yellow-800"
                    }`}
                  >
                    {order.financial_status || "pending"}
                  </span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Customer:</span>
                    <span className="text-gray-900">
                      {order.customer
                        ? `${order.customer.first_name || ""} ${
                            order.customer.last_name || ""
                          }`.trim() || order.email
                        : order.email || "N/A"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Items:</span>
                    <span className="text-gray-900">
                      {order.line_items.length} item
                      {order.line_items.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total:</span>
                    <span className="text-gray-900 font-semibold">
                      {formatCurrency(order.total_price, order.currency)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="px-6 py-4 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-sm text-gray-600">
              Showing{" "}
              {searchQuery ? filteredOrders.length : (page - 1) * limit + 1} to{" "}
              {searchQuery
                ? filteredOrders.length
                : Math.min(page * limit, pagination.total)}{" "}
              of {searchQuery ? filteredOrders.length : pagination.total} orders
            </div>
            {!searchQuery && (
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(page - 1)}
                  disabled={page === 1}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={page >= pagination.totalPages}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
