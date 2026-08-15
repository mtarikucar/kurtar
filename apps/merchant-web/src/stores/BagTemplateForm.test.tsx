import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { KurtarClient } from "@kurtar/api-client";
import type { Store } from "../api/response-types";
import { BagTemplateForm } from "./BagTemplateForm";

const createBagTemplate = vi.fn();

vi.mock("../api/client", () => ({
  client: {
    merchant: {
      bagTemplates: {
        create: (...args: unknown[]) => createBagTemplate(...args),
      },
    },
  } as unknown as KurtarClient,
}));

const STORE: Store = {
  id: "store-1",
  merchantId: "m1",
  name: "Merkez Şube",
  address: "Bağdat Cd. 1",
  district: "Kadıköy",
  city: "İstanbul",
  latitude: 40.99,
  longitude: 29.03,
  coverImageUrl: null,
  categoryTags: [],
  openingHoursJson: null,
  active: true,
  avgStars: 0,
  ratingCount: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function renderForm(onSaved = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <BagTemplateForm stores={[STORE]} onSaved={onSaved} onCancel={vi.fn()} />
    </QueryClientProvider>,
  );
  return { onSaved };
}

describe("BagTemplateForm — allergen requirement", () => {
  beforeEach(() => createBagTemplate.mockReset());

  it("visibly marks the allergen disclaimer as a legal requirement, not a silent field", () => {
    renderForm();
    expect(screen.getByText(/Yasal olarak zorunludur/)).toBeInTheDocument();
    const field = screen.getByLabelText(/Alerjen bilgisi/);
    expect(field).toHaveAttribute("aria-required", "true");
  });

  it("blocks submit when the allergen disclaimer is left empty", async () => {
    renderForm();

    await userEvent.type(screen.getByLabelText(/Paket adı/), "Akşam Paketi");
    await userEvent.type(
      screen.getByLabelText(/Tahmini değer \(alt sınır\)/),
      "150",
    );
    await userEvent.type(
      screen.getByLabelText(/Tahmini değer \(üst sınır\)/),
      "200",
    );
    await userEvent.type(screen.getByLabelText(/Satış fiyatı/), "65");
    // Allergen disclaimer deliberately left blank.
    await userEvent.click(
      screen.getByRole("button", { name: /şablonu kaydet/i }),
    );

    expect(await screen.findByText("Bu alan zorunlu.")).toBeInTheDocument();
    expect(createBagTemplate).not.toHaveBeenCalled();
  });
});

describe("BagTemplateForm — price-floor validation", () => {
  beforeEach(() => createBagTemplate.mockReset());

  it("blocks submit and explains the ₺59 platform floor when priced below it", async () => {
    renderForm();

    await userEvent.type(screen.getByLabelText(/Paket adı/), "Akşam Paketi");
    await userEvent.type(
      screen.getByLabelText(/Alerjen bilgisi/),
      "Gluten, süt içerebilir.",
    );
    await userEvent.type(
      screen.getByLabelText(/Tahmini değer \(alt sınır\)/),
      "150",
    );
    await userEvent.type(
      screen.getByLabelText(/Tahmini değer \(üst sınır\)/),
      "200",
    );
    await userEvent.type(screen.getByLabelText(/Satış fiyatı/), "45");
    await userEvent.click(
      screen.getByRole("button", { name: /şablonu kaydet/i }),
    );

    // The price TextField's HINT already mentions ₺59,00 unconditionally
    // (it's shown before any error too) — assert on the distinct ERROR
    // text specifically, not a substring that also matches the hint.
    expect(
      await screen.findByText(
        "Platform kuralı gereği sürpriz paket fiyatı en az ₺59,00 olmalı.",
      ),
    ).toBeInTheDocument();
    expect(createBagTemplate).not.toHaveBeenCalled();
  });

  it("blocks submit when the price is not below the bag's own declared value", async () => {
    renderForm();

    await userEvent.type(screen.getByLabelText(/Paket adı/), "Akşam Paketi");
    await userEvent.type(
      screen.getByLabelText(/Alerjen bilgisi/),
      "Gluten, süt içerebilir.",
    );
    await userEvent.type(
      screen.getByLabelText(/Tahmini değer \(alt sınır\)/),
      "60",
    );
    await userEvent.type(
      screen.getByLabelText(/Tahmini değer \(üst sınır\)/),
      "90",
    );
    await userEvent.type(screen.getByLabelText(/Satış fiyatı/), "65");
    await userEvent.click(
      screen.getByRole("button", { name: /şablonu kaydet/i }),
    );

    expect(
      await screen.findByText(
        "Sürpriz paket fiyatı, içeriğin değerinden düşük olmalı.",
      ),
    ).toBeInTheDocument();
    expect(createBagTemplate).not.toHaveBeenCalled();
  });

  it("submits once the allergen disclaimer and every pricing rule are satisfied", async () => {
    createBagTemplate.mockResolvedValue({ id: "tpl-1" });
    const { onSaved } = renderForm();

    await userEvent.type(screen.getByLabelText(/Paket adı/), "Akşam Paketi");
    await userEvent.type(
      screen.getByLabelText(/Alerjen bilgisi/),
      "Gluten, süt içerebilir.",
    );
    await userEvent.type(
      screen.getByLabelText(/Tahmini değer \(alt sınır\)/),
      "150",
    );
    await userEvent.type(
      screen.getByLabelText(/Tahmini değer \(üst sınır\)/),
      "200",
    );
    await userEvent.type(screen.getByLabelText(/Satış fiyatı/), "65");
    await userEvent.click(
      screen.getByRole("button", { name: /şablonu kaydet/i }),
    );

    await waitFor(() =>
      expect(createBagTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          allergenDisclaimer: "Gluten, süt içerebilir.",
          priceCents: 6500,
          originalValueCentsMin: 15000,
          originalValueCentsMax: 20000,
        }),
      ),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });
});
