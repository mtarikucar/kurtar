import { PushMessage, PushSendResult } from "../push-provider.interface";

/** Expo's push API accepts at most 100 messages per request. */
export const EXPO_CHUNK_SIZE = 100;

/** Splits `messages` into fixed-size chunks, preserving order — the last
 * chunk may be smaller than `size`. */
export function chunkMessages<T>(
  messages: T[],
  size: number = EXPO_CHUNK_SIZE,
): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < messages.length; i += size) {
    chunks.push(messages.slice(i, i + size));
  }
  return chunks;
}

/** One element of Expo's `POST /--/api/v2/push/send` response `data` array
 * — one ticket per message, in the SAME order the messages were sent
 * (Expo's documented guarantee within a single request). */
export interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

/**
 * Classifies one Expo ticket against the message it answers. `token_invalid`
 * is reserved for Expo's `DeviceNotRegistered` error — the one case a
 * caller should react to by permanently disabling the token (see
 * PushDispatchService); every other error is transient/unknown and
 * classified `error` (eligible for the outbox worker's normal retry, not a
 * token-disable).
 */
export function classifyExpoTicket(
  to: string,
  ticket: ExpoPushTicket,
): PushSendResult {
  if (ticket.status === "ok") return { to, outcome: "ok" };
  if (ticket.details?.error === "DeviceNotRegistered") {
    return { to, outcome: "token_invalid", error: ticket.message };
  }
  return {
    to,
    outcome: "error",
    error: ticket.message ?? ticket.details?.error,
  };
}

/** Builds the [{to,title,body,data}] Expo expects for one HTTP request. */
export function toExpoRequestBody(messages: PushMessage[]) {
  return messages.map((m) => ({
    to: m.to,
    title: m.title,
    body: m.body,
    data: m.data,
  }));
}
