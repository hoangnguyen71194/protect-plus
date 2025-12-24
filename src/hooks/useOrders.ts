import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
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
  synced?: number;
  status?: string;
  method?: "bulk" | "incremental";
  operationId?: string;
  isFirstSync?: boolean;
}

interface BulkStatusResponse {
  status: "idle" | "pending" | "completed" | "failed" | "canceled";
  operationId?: string;
  synced?: number;
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

export function useBulkSyncStatus() {
  const queryClient = useQueryClient();
  const BULK_TOAST_ID = "bulk-sync-status";
  const isFinalizingRef = useRef(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const lastProcessedStateRef = useRef<string>("");
  const previousStatusRef = useRef<string | undefined>(undefined);

  const query = useQuery<BulkStatusResponse>({
    queryKey: ["bulkSyncStatus"],
    queryFn: async () => {
      const response = await fetch("/api/orders?status=bulk");
      if (!response.ok) {
        throw new Error("Failed to fetch bulk sync status");
      }
      return response.json();
    },
    refetchInterval: (query) => {
      const data = query.state.data;
      // Poll every 5 seconds if status is pending, otherwise don't poll
      return data?.status === "pending" ? 5000 : false;
    },
    refetchOnMount: true,
  });

  // Derive isFinalizing from query data
  const derivedIsFinalizing =
    query.data?.status === "pending" &&
    query.data?.operationId !== undefined &&
    query.data?.synced === undefined;

  // Update state when derived value changes
  useEffect(() => {
    setIsFinalizing(derivedIsFinalizing);
  }, [derivedIsFinalizing]);

  // Watch for status changes and handle notifications
  useEffect(() => {
    const status = query.data?.status;
    const synced = query.data?.synced;
    const operationId = query.data?.operationId;

    if (!status) return;

    // Create a unique key for this state to track if we've already processed it
    const stateKey = `${status}-${operationId || ""}-${synced ?? ""}`;

    // Skip if we've already processed this exact state
    if (lastProcessedStateRef.current === stateKey) {
      return;
    }

    const previousStatus = previousStatusRef.current;
    const isTransitionFromPending =
      previousStatus === "pending" && status === "idle";

    if (status === "pending") {
      // Show loading toast for pending status (updates existing toast if present)
      toast.loading("Bulk sync in progress. This may take a few minutes.", {
        id: BULK_TOAST_ID,
      });
      lastProcessedStateRef.current = stateKey;
      previousStatusRef.current = status;
    } else if (status === "idle" && synced !== undefined && synced > 0) {
      // Only show success toast when transitioning from pending to idle
      // This prevents showing the message on every page reload
      if (isTransitionFromPending) {
        // Finalization completed successfully with orders
        isFinalizingRef.current = false;

        // Invalidate queries to refresh data
        queryClient.invalidateQueries({ queryKey: ["orders"] });
        queryClient.invalidateQueries({ queryKey: ["metrics"] });

        const message = `Successfully synced ${synced} orders from Shopify`;
        toast.success(message, { id: BULK_TOAST_ID });
      } else {
        // Just refresh data without showing toast (page reload scenario)
        queryClient.invalidateQueries({ queryKey: ["orders"] });
        queryClient.invalidateQueries({ queryKey: ["metrics"] });
      }
      lastProcessedStateRef.current = stateKey;
      previousStatusRef.current = status;
    } else if (status === "idle" && synced === 0) {
      // Only show success if transitioning from pending
      if (isTransitionFromPending) {
        // Finalization completed but no new orders
        isFinalizingRef.current = false;
        queryClient.invalidateQueries({ queryKey: ["orders"] });
        queryClient.invalidateQueries({ queryKey: ["metrics"] });
        toast.success("You're up to date. No new orders.", {
          id: BULK_TOAST_ID,
        });
      } else {
        // Just refresh data without showing toast
        queryClient.invalidateQueries({ queryKey: ["orders"] });
        queryClient.invalidateQueries({ queryKey: ["metrics"] });
      }
      lastProcessedStateRef.current = stateKey;
      previousStatusRef.current = status;
    } else if (status === "failed" || status === "canceled") {
      // Show error toast
      isFinalizingRef.current = false;
      toast.error(`Bulk sync ${status}. Please try again.`, {
        id: BULK_TOAST_ID,
      });
      // Reset status after showing error
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["bulkSyncStatus"] });
      }, 2000);
      lastProcessedStateRef.current = stateKey;
      previousStatusRef.current = status;
    } else if (status === "idle") {
      // Just track the state, no action needed
      lastProcessedStateRef.current = stateKey;
      previousStatusRef.current = status;
    }
  }, [
    query.data?.status,
    query.data?.synced,
    query.data?.operationId,
    queryClient,
  ]);

  return {
    ...query,
    isFinalizing,
  };
}

export function useSyncOrders() {
  const queryClient = useQueryClient();
  const BULK_TOAST_ID = "bulk-sync-status";

  const successMessage = (count?: number) =>
    count && count > 0
      ? `Successfully synced ${count} orders from Shopify`
      : "You're up to date. No new orders.";

  return useMutation<SyncResponse, Error>({
    mutationFn: async () => {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sync: true }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle 409 conflict - bulk sync already in progress
        if (response.status === 409 && data.status === "pending") {
          // Invalidate bulk sync status to get the latest status
          queryClient.invalidateQueries({ queryKey: ["bulkSyncStatus"] });
          toast(
            data.error || "A bulk sync is already in progress. Please wait.",
            { icon: "ℹ️", id: BULK_TOAST_ID }
          );
          return data as SyncResponse;
        }
        throw new Error(data.error || "Failed to sync orders");
      }

      return data as SyncResponse;
    },
    onSuccess: (data) => {
      if (data.status === "pending") {
        // Bulk sync started - invalidate status query to start polling
        queryClient.invalidateQueries({ queryKey: ["bulkSyncStatus"] });
        toast.loading("Bulk sync started. This may take a few minutes.", {
          id: BULK_TOAST_ID,
        });
        return;
      }

      // Incremental sync completed immediately
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["metrics"] });
      toast.success(successMessage(data.synced));
    },
    onError: (error) => {
      toast.error(error.message || "Failed to sync orders");
    },
  });
}
