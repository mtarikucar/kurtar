import type { RequestEngine } from "../engine";
import type { RequestBody } from "../core-types";

/** Cross-actor "me" settings: notification preferences, live location (consumer), and push-token registration. Used by apps/consumer primarily; notification preferences apply to all three authenticated actors. */
export function createAccountDomain(engine: RequestEngine) {
  return {
    notificationPreferences: {
      /** GET /me/notification-preferences */
      get: () => engine.request("get", "/api/me/notification-preferences"),
      /** PATCH /me/notification-preferences */
      update: (
        body: RequestBody<"/api/me/notification-preferences", "patch">,
      ) =>
        engine.request("patch", "/api/me/notification-preferences", { body }),
    },

    /** POST /me/location — consumer's current location, for distance-sorted discovery. */
    updateLocation: (body: RequestBody<"/api/me/location", "post">) =>
      engine.request("post", "/api/me/location", { body }),

    pushTokens: {
      /** POST /me/push-tokens — registers an Expo push token for the current device. */
      register: (body: RequestBody<"/api/me/push-tokens", "post">) =>
        engine.request("post", "/api/me/push-tokens", { body }),
      /** DELETE /me/push-tokens/{token} — deregisters a device (e.g. on logout). */
      remove: (token: string) =>
        engine.request("delete", "/api/me/push-tokens/{token}", {
          path: { token },
        }),
    },
  };
}

export type AccountDomain = ReturnType<typeof createAccountDomain>;
