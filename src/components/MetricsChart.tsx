"use client";

import { useMetrics } from "@/hooks/useMetrics";

export default function MetricsChart() {
  const { data, isLoading, error } = useMetrics(30);

  const metrics = data?.metrics || [];
  const summary = data?.summary || {
    totalOrders: 0,
    totalRevenue: 0,
    totalShipping: 0,
    averageOrderValue: 0,
  };
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const maxValue =
    metrics.length > 0
      ? Math.max(
          ...metrics.map((m) =>
            Math.max(m.revenue, m.shippingCost, m.orderCount * 100)
          )
        )
      : 1;

  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* Summary Cards Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 animate-pulse"
            >
              <div className="h-4 bg-gray-200 rounded w-24 mb-3"></div>
              <div className="h-8 bg-gray-200 rounded w-32"></div>
            </div>
          ))}
        </div>

        {/* Charts Skeleton */}
        {Array.from({ length: 3 }).map((_, chartIndex) => {
          const widths = [45, 60, 35, 75, 50, 40, 65]; // Fixed widths for consistency
          return (
            <div
              key={chartIndex}
              className="bg-white p-6 rounded-lg shadow-sm border border-gray-200"
            >
              <div className="h-6 bg-gray-200 rounded w-48 mb-4 animate-pulse"></div>
              <div className="space-y-2">
                {Array.from({ length: 7 }).map((_, rowIndex) => (
                  <div
                    key={rowIndex}
                    className="flex items-center gap-4 animate-pulse"
                  >
                    <div className="w-24 h-4 bg-gray-200 rounded"></div>
                    <div className="flex-1">
                      <div
                        className="h-6 bg-gray-200 rounded"
                        style={{
                          width: `${widths[rowIndex % widths.length]}%`,
                        }}
                      ></div>
                    </div>
                    <div className="w-24 h-4 bg-gray-200 rounded"></div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200 text-center text-red-500">
          Error loading metrics: {error.message}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="text-sm text-gray-600 mb-1">Total Orders</div>
          <div className="text-2xl font-semibold text-gray-900">
            {summary.totalOrders}
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="text-sm text-gray-600 mb-1">Total Revenue</div>
          <div className="text-2xl font-semibold text-gray-900">
            {formatCurrency(summary.totalRevenue)}
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="text-sm text-gray-600 mb-1">Total Shipping</div>
          <div className="text-2xl font-semibold text-gray-900">
            {formatCurrency(summary.totalShipping)}
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="text-sm text-gray-600 mb-1">Avg Order Value</div>
          <div className="text-2xl font-semibold text-gray-900">
            {formatCurrency(summary.averageOrderValue)}
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Order Volume Over Time
        </h3>
        <div className="space-y-2">
          {metrics.map((metric) => (
            <div key={metric.date} className="flex items-center gap-4">
              <div className="w-24 text-sm text-gray-600">
                {new Date(metric.date).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <div
                    className="h-6 bg-blue-500 rounded"
                    style={{
                      width: `${
                        metrics.length > 0
                          ? (metric.orderCount /
                              Math.max(...metrics.map((m) => m.orderCount))) *
                            100
                          : 0
                      }%`,
                    }}
                  />
                  <span className="text-sm font-medium text-gray-700 min-w-12">
                    {metric.orderCount} orders
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Revenue Over Time
        </h3>
        <div className="space-y-2">
          {metrics.map((metric) => (
            <div key={metric.date} className="flex items-center gap-4">
              <div className="w-24 text-sm text-gray-600">
                {new Date(metric.date).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <div
                    className="h-6 bg-green-500 rounded"
                    style={{
                      width: `${(metric.revenue / maxValue) * 100}%`,
                    }}
                  />
                  <span className="text-sm font-medium text-gray-700 min-w-24">
                    {formatCurrency(metric.revenue)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Shipping Costs Over Time
        </h3>
        <div className="space-y-2">
          {metrics.map((metric) => (
            <div key={metric.date} className="flex items-center gap-4">
              <div className="w-24 text-sm text-gray-600">
                {new Date(metric.date).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <div
                    className="h-6 bg-purple-500 rounded"
                    style={{
                      width: `${(metric.shippingCost / maxValue) * 100}%`,
                    }}
                  />
                  <span className="text-sm font-medium text-gray-700 min-w-24">
                    {formatCurrency(metric.shippingCost)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
