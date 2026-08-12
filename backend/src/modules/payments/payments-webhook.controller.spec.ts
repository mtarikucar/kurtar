import { PaymentsWebhookController } from "./payments-webhook.controller";

function buildDeps() {
  const facade = { parseWebhook: jest.fn() };
  const settle = { settle: jest.fn().mockResolvedValue("confirmed") };
  return { facade, settle };
}

function fakeReq(body: unknown = {}, rawBody?: Buffer) {
  return { body, rawBody, headers: { "x-webhook-secret": "s" } } as any;
}

describe("PaymentsWebhookController", () => {
  it("always ACKs with {received:true} on a successful settle", async () => {
    const { facade, settle } = buildDeps();
    facade.parseWebhook.mockResolvedValue({
      merchantOid: "KRVabc",
      status: "success",
      totalCents: 100,
      externalEventId: "e1",
    });
    const controller = new PaymentsWebhookController(
      facade as any,
      settle as any,
    );

    await expect(
      controller.handle(fakeReq({}, Buffer.from("{}"))),
    ).resolves.toEqual({
      received: true,
    });
    expect(settle.settle).toHaveBeenCalledTimes(1);
  });

  it("ACKs (does not throw) when parseWebhook rejects — verification failure never surfaces as a 4xx/5xx", async () => {
    const { facade, settle } = buildDeps();
    facade.parseWebhook.mockRejectedValue(new Error("bad signature"));
    const controller = new PaymentsWebhookController(
      facade as any,
      settle as any,
    );

    await expect(controller.handle(fakeReq())).resolves.toEqual({
      received: true,
    });
    expect(settle.settle).not.toHaveBeenCalled();
  });

  it("ACKs even when settle() itself throws — no retry-storm training", async () => {
    const { facade, settle } = buildDeps();
    facade.parseWebhook.mockResolvedValue({
      merchantOid: "KRVabc",
      status: "success",
      totalCents: 100,
      externalEventId: "e1",
    });
    settle.settle.mockRejectedValue(new Error("db blip"));
    const controller = new PaymentsWebhookController(
      facade as any,
      settle as any,
    );

    await expect(controller.handle(fakeReq())).resolves.toEqual({
      received: true,
    });
  });

  it("passes req.rawBody through to parseWebhook when present", async () => {
    const { facade, settle } = buildDeps();
    facade.parseWebhook.mockResolvedValue({
      merchantOid: "KRVabc",
      status: "success",
      totalCents: 100,
      externalEventId: "e1",
    });
    const controller = new PaymentsWebhookController(
      facade as any,
      settle as any,
    );
    const raw = Buffer.from('{"merchantOid":"KRVabc"}');

    await controller.handle(fakeReq({ ignored: true }, raw));
    expect(facade.parseWebhook).toHaveBeenCalledWith(raw, {
      "x-webhook-secret": "s",
    });
  });

  it("falls back to re-serializing req.body when rawBody is missing", async () => {
    const { facade, settle } = buildDeps();
    facade.parseWebhook.mockResolvedValue({
      merchantOid: "KRVabc",
      status: "success",
      totalCents: 100,
      externalEventId: "e1",
    });
    const controller = new PaymentsWebhookController(
      facade as any,
      settle as any,
    );

    await controller.handle(fakeReq({ merchantOid: "KRVabc" }, undefined));
    expect(facade.parseWebhook).toHaveBeenCalledWith(
      Buffer.from(JSON.stringify({ merchantOid: "KRVabc" })),
      { "x-webhook-secret": "s" },
    );
  });
});
