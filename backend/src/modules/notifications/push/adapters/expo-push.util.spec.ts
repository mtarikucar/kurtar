import {
  chunkMessages,
  classifyExpoTicket,
  EXPO_CHUNK_SIZE,
  toExpoRequestBody,
} from "./expo-push.util";

describe("chunkMessages", () => {
  it("returns a single chunk when under the size limit", () => {
    const items = Array.from({ length: 5 }, (_, i) => i);
    expect(chunkMessages(items, 100)).toEqual([items]);
  });

  it("splits exactly at the boundary — 100 items -> one chunk of 100, no trailing empty chunk", () => {
    const items = Array.from({ length: 100 }, (_, i) => i);
    const chunks = chunkMessages(items, 100);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(100);
  });

  it("101 items -> a 100-chunk and a 1-chunk", () => {
    const items = Array.from({ length: 101 }, (_, i) => i);
    const chunks = chunkMessages(items, 100);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(100);
    expect(chunks[1]).toHaveLength(1);
  });

  it("250 items -> three chunks of 100/100/50, preserving order", () => {
    const items = Array.from({ length: 250 }, (_, i) => i);
    const chunks = chunkMessages(items, 100);
    expect(chunks.map((c) => c.length)).toEqual([100, 100, 50]);
    expect(chunks.flat()).toEqual(items);
  });

  it("empty input -> no chunks", () => {
    expect(chunkMessages([], 100)).toEqual([]);
  });

  it("defaults to EXPO_CHUNK_SIZE (100) when no size is given", () => {
    const items = Array.from({ length: 150 }, (_, i) => i);
    expect(chunkMessages(items).map((c) => c.length)).toEqual([
      EXPO_CHUNK_SIZE,
      50,
    ]);
  });
});

describe("classifyExpoTicket", () => {
  it("status 'ok' -> outcome 'ok'", () => {
    expect(classifyExpoTicket("tok1", { status: "ok", id: "abc" })).toEqual({
      to: "tok1",
      outcome: "ok",
    });
  });

  it("status 'error' with details.error === 'DeviceNotRegistered' -> outcome 'token_invalid'", () => {
    expect(
      classifyExpoTicket("tok1", {
        status: "error",
        message:
          '"ExponentPushToken[tok1]" is not a registered push notification recipient',
        details: { error: "DeviceNotRegistered" },
      }),
    ).toEqual({
      to: "tok1",
      outcome: "token_invalid",
      error:
        '"ExponentPushToken[tok1]" is not a registered push notification recipient',
    });
  });

  it("status 'error' with a different details.error -> outcome 'error', never token_invalid", () => {
    expect(
      classifyExpoTicket("tok1", {
        status: "error",
        message: "Message too big",
        details: { error: "MessageTooBig" },
      }),
    ).toEqual({ to: "tok1", outcome: "error", error: "Message too big" });
  });

  it("status 'error' with no details at all -> outcome 'error'", () => {
    expect(
      classifyExpoTicket("tok1", { status: "error", message: "boom" }),
    ).toEqual({ to: "tok1", outcome: "error", error: "boom" });
  });
});

describe("toExpoRequestBody", () => {
  it("maps PushMessage[] to Expo's {to,title,body,data} shape, dropping nothing else", () => {
    expect(
      toExpoRequestBody([
        { to: "tok1", title: "Hi", body: "There", data: { offerId: "o1" } },
        { to: "tok2", title: "Hi2", body: "There2" },
      ]),
    ).toEqual([
      { to: "tok1", title: "Hi", body: "There", data: { offerId: "o1" } },
      { to: "tok2", title: "Hi2", body: "There2", data: undefined },
    ]);
  });
});
