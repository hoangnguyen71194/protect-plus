import { useQuery } from "@tanstack/react-query";
import { OrderMetrics } from "@/types/order";

interface MetricsResponse {
  metrics: OrderMetrics[];
  summary: {
    totalOrders: number;
    totalRevenue: number;
    totalShipping: number;
    averageOrderValue: number;
  };
}

export function useMetrics(days: number = 30) {
  return useQuery<MetricsResponse>({
    queryKey: ["metrics", days],
    queryFn: async () => {
      const response = await fetch(`/api/metrics?days=${days}`);
      if (!response.ok) {
        throw new Error("Failed to fetch metrics");
      }
      return response.json();
    },
  });
}

