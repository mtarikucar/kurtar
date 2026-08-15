import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "../../i18n";
import { MerchantActionDialog } from "./MerchantActionDialog";

describe("MerchantActionDialog — suspend", () => {
  it("states the real blast radius (every active offer, every buyer refunded) with the merchant's name, before the click", () => {
    render(
      <MerchantActionDialog
        variant="suspend"
        tradeName="Ada Fırın"
        pending={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    // The merchant's real name is interpolated in, not a generic template.
    expect(screen.getByText(/Ada Fırın/)).toBeInTheDocument();
    // The two real, unconditional consequences from the product brief:
    // every active offer cancelled, every affected buyer refunded.
    expect(
      screen.getByText(/tüm aktif teklifleri iptal edilecek/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/her alıcıya tam iade yapılacaktır/i),
    ).toBeInTheDocument();
  });

  it("renders the confirm button in the dangerous/red styling for suspend", () => {
    render(
      <MerchantActionDialog
        variant="suspend"
        tradeName="Ada Fırın"
        pending={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const confirmButton = screen.getByRole("button", {
      name: /Askıya al, teklifleri iptal et/i,
    });
    expect(confirmButton.className).toMatch(/dangerButton/);
  });

  it("calls onConfirm with the entered note when confirmed", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <MerchantActionDialog
        variant="suspend"
        tradeName="Ada Fırın"
        pending={false}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    await user.type(
      screen.getByLabelText(/Not \(opsiyonel\)/i),
      "tekrar eden şikayetler",
    );
    await user.click(
      screen.getByRole("button", { name: /Askıya al, teklifleri iptal et/i }),
    );
    expect(onConfirm).toHaveBeenCalledWith("tekrar eden şikayetler");
  });
});

describe("MerchantActionDialog — reject", () => {
  it("requires a written reason before it will confirm", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <MerchantActionDialog
        variant="reject"
        tradeName="Ada Fırın"
        pending={false}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Reddet" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Reddetmek için bir gerekçe yazmalısınız/i),
    ).toBeInTheDocument();
  });

  it("confirms once a reason is entered", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <MerchantActionDialog
        variant="reject"
        tradeName="Ada Fırın"
        pending={false}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    await user.type(
      screen.getByLabelText(/Ret gerekçesi \(zorunlu\)/i),
      "VKN doğrulanamadı",
    );
    await user.click(screen.getByRole("button", { name: "Reddet" }));
    expect(onConfirm).toHaveBeenCalledWith("VKN doğrulanamadı");
  });
});
