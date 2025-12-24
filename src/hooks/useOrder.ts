import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Order } from "@/types/order";

interface OrderResponse {
  order: Order;
}

export function useOrder(id: string) {
  return useQuery<OrderResponse>({
    queryKey: ["order", id],
    queryFn: async () => {
      const response = await fetch(`/api/orders/${id}`);
      if (!response.ok) {
        throw new Error("Failed to fetch order");
      }
      return response.json();
    },
    enabled: !!id,
  });
}

export function useResyncOrder() {
  const queryClient = useQueryClient();

  return useMutation<
    { success: boolean; order?: Order; error?: string },
    Error,
    string
  >({
    mutationFn: async (orderId: string) => {
      const response = await fetch(`/api/orders/${orderId}`, {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to sync order");
      }

      return data;
    },
    onSuccess: (data, orderId) => {
      if (data.success) {
        // Invalidate queries to refresh data
        queryClient.invalidateQueries({ queryKey: ["order", orderId] });
        queryClient.invalidateQueries({ queryKey: ["orders"] });
        queryClient.invalidateQueries({ queryKey: ["metrics"] });
        toast.success("Order synced successfully");
      } else {
        toast.error(data.error || "Failed to sync order");
      }
    },
    onError: (error) => {
      toast.error(error.message || "Failed to sync order");
    },
  });
}
