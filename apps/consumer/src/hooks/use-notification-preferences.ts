import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client } from "../lib/api-client";
import type { NotificationPreferences } from "../lib/api-types";

const KEY = ["me", "notification-preferences"] as const;

export function useNotificationPreferences() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () =>
      (await client.account.notificationPreferences.get()) as unknown as NotificationPreferences,
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
    }) =>
      (await client.account.notificationPreferences.update(
        patch,
      )) as unknown as NotificationPreferences,
    onSuccess: (updated) => {
      queryClient.setQueryData(KEY, updated);
    },
  });
}
