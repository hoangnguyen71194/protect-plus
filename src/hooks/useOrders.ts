import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Order } from "@/types/order";

interface OrdersResponse {
  orders: Order[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface SyncResponse {
  success: boolean;
  synced: number;
}

export function useOrders(page: number = 1, limit: number = 20) {
  return useQuery<OrdersResponse>({
    queryKey: ["orders", page, limit],
    queryFn: async () => {
      const response = await fetch(`/api/orders?page=${page}&limit=${limit}`);
      if (!response.ok) {
        throw new Error("Failed to fetch orders");
      }
      return response.json();
    },
  });
}

export function useSyncOrders() {
  const queryClient = useQueryClient();

  return useMutation<SyncResponse, Error>({
    mutationFn: async () => {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sync: true }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to sync orders");
      }

      return response.json();
    },
    onSuccess: (data) => {
      // Invalidate and refetch orders queries
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      // Invalidate and refetch metrics
      queryClient.invalidateQueries({ queryKey: ["metrics"] });
      // Show success toast
      toast.success(`Successfully synced ${data.synced} orders from Shopify`);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to sync orders");
    },
  });
}
