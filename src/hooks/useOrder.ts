import { useQuery } from "@tanstack/react-query";
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

