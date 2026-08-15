import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { KurtarApiError, type KurtarClient } from "@kurtar/api-client";
import type { BagTemplate } from "../api/response-types";
import { QuickPublishCard } from "./QuickPublishCard";

const createOffer = vi.fn();
const publishOffer = vi.fn();

vi.mock("../api/client", () => ({
  client: {
    offers: {
      create: (...args: unknown[]) => createOffer(...args),
      publish: (...args: unknown[]) => publishOffer(...args),
    },
  } as unknown as KurtarClient,
  KurtarApiError,
}));

const TEMPLATE: BagTemplate = {
  id: "tpl-1",
  storeId: "store-1",
  title: "Sürpriz Fırın Paketi",
  category: "BAKERY",
  dietFlags: [],
  allergenDisclaimer: "Gluten içerir.",
  originalValueCentsMin: 15000,
  originalValueCentsMax: 20000,
  priceCents: 6500,
  description: null,
  active: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function renderCard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <QuickPublishCard
        merchantId="merchant-1"
        dateKey="2026-08-15"
        templates={[TEMPLATE]}
      />
    </QueryClientProvider>,
  );
}

describe("QuickPublishCard — one-tap publish (the product's single most important interaction)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    createOffer.mockReset();
    publishOffer.mockReset();
    createOffer.mockResolvedValue({ id: "offer-1" });
    publishOffer.mockResolvedValue({
      offerId: "offer-1",
      status: "PUBLISHED",
      publishedAt: "2026-08-15T16:00:00.000Z",
    });
  });

  it("shows a single ready-to-tap publish button with the smart default already filled in — no form stands in the way", () => {
    renderCard();
    expect(screen.getByText(/Sürpriz Fırın Paketi/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yayınla" })).toBeInTheDocument();
    // The edit panel (quantity stepper, time inputs) is collapsed by
    // default — genuinely one tap, not "open a form, then tap".
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  });

  it("one tap runs create-then-publish, in order, with the template's defaulted quantity and pickup window", async () => {
    renderCard();

    await userEvent.click(screen.getByRole("button", { name: "Yayınla" }));

    await waitFor(() => expect(publishOffer).toHaveBeenCalledWith("offer-1"));

    expect(createOffer).toHaveBeenCalledWith({
      bagTemplateId: "tpl-1",
      offerDate: "2026-08-15",
      qtyTotal: 5,
      pickupStartAt: "2026-08-15T16:00:00.000Z", // 19:00 Istanbul local
      pickupEndAt: "2026-08-15T18:00:00.000Z", // 21:00 Istanbul local
    });
    // create() must resolve before publish() is called with ITS id —
    // asserts the two calls run in sequence, not fired in parallel with a
    // guessed id.
    expect(createOffer.mock.invocationCallOrder[0]).toBeLessThan(
      publishOffer.mock.invocationCallOrder[0],
    );
  });

  it("never fires publish before create has actually resolved (no optimistic publish on a money/publish action)", async () => {
    let resolveCreate: (value: unknown) => void = () => {};
    createOffer.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );

    renderCard();
    await userEvent.click(screen.getByRole("button", { name: "Yayınla" }));

    expect(publishOffer).not.toHaveBeenCalled();

    resolveCreate({ id: "offer-1" });
    await waitFor(() => expect(publishOffer).toHaveBeenCalled());
  });

  it("remembers the quantity/window it just published with, for next time", async () => {
    renderCard();
    await userEvent.click(screen.getByRole("button", { name: "Yayınla" }));
    await waitFor(() => expect(publishOffer).toHaveBeenCalled());

    const stored = window.localStorage.getItem(
      "kurtar:merchant-web:quick-publish-defaults:v1:merchant-1",
    );
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored as string)).toMatchObject({
      lastTemplateId: "tpl-1",
      perTemplate: {
        "tpl-1": { qtyTotal: 5, startTime: "19:00", endTime: "21:00" },
      },
    });
  });

  it("surfaces a publish failure with a real Turkish message rather than failing silently", async () => {
    createOffer.mockRejectedValue(
      new KurtarApiError({
        statusCode: 409,
        errorCode: "BAG_TEMPLATE_INACTIVE",
        message: "inactive",
        isBackendErrorCode: true,
      }),
    );

    renderCard();
    await userEvent.click(screen.getByRole("button", { name: "Yayınla" }));

    await waitFor(() =>
      expect(
        screen.getByText(
          "Bu paket şablonu pasif durumda — yeni teklif oluşturmak için önce aktif hale getirin.",
        ),
      ).toBeInTheDocument(),
    );
  });
});
