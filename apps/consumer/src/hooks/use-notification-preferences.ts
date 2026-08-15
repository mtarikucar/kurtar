import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client } from "../lib/api-client";

const KEY = ["me", "notification-preferences"] as const;

export function useNotificationPreferences() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => client.account.notificationPreferences.get(),
    staleTime: 60_000,
  });
}

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: {
      favoritesEnabled?: boolean;
      nearbyEnabled?: boolean;
      nearbyRadiusM?: number;
      marketingEnabled?: boolean;
      quietHoursStart?: number;
      quietHoursEnd?: number;
    }) => client.account.notificationPreferences.update(patch),
    onSuccess: (updated) => {
      queryClient.setQueryData(KEY, updated);
    },
  });
}
