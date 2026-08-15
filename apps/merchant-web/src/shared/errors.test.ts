import { describe, expect, it } from "vitest";
import { KurtarApiError } from "@kurtar/api-client";
import i18n from "../i18n";
import { errorCodeOf, getErrorMessage, isMerchantNotApproved } from "./errors";

describe("getErrorMessage — branches on errorCode, never on message text", () => {
  it("maps a known backend errorCode to its Turkish, actionable text", () => {
    const err = new KurtarApiError({
      statusCode: 400,
      errorCode: "BAG_PRICE_BELOW_FLOOR",
      message: "priceCents must be at least 5900.", // deliberately English/technical
      isBackendErrorCode: true,
    });
    expect(getErrorMessage(err, i18n.t)).toBe(
      "Fiyat platform tabanının altında olamaz.",
    );
  });

  it("falls back to a generic message for an errorCode with no specific mapping", () => {
    const err = new KurtarApiError({
      statusCode: 500,
      errorCode: "SOME_UNMAPPED_CODE",
      message: "boom",
      isBackendErrorCode: true,
    });
    expect(getErrorMessage(err, i18n.t)).toBe(
      "Bir şeyler ters gitti. Lütfen tekrar deneyin.",
    );
  });

  it("maps a network failure to the offline message, not the generic one", () => {
    const err = new KurtarApiError({
      statusCode: 0,
      errorCode: "NETWORK_ERROR",
      message: "Failed to fetch",
      isBackendErrorCode: false,
    });
    expect(getErrorMessage(err, i18n.t)).toBe(
      "İnternet bağlantınızı kontrol edip tekrar deneyin.",
    );
  });

  it("never crashes and stays generic for a non-KurtarApiError value", () => {
    expect(getErrorMessage(new Error("plain JS error"), i18n.t)).toBe(
      "Bir şeyler ters gitti. Lütfen tekrar deneyin.",
    );
  });
});

describe("isMerchantNotApproved / errorCodeOf", () => {
  it("identifies the approval-gate error specifically", () => {
    const err = new KurtarApiError({
      statusCode: 403,
      errorCode: "MERCHANT_NOT_APPROVED",
      message: "x",
      isBackendErrorCode: true,
    });
    expect(isMerchantNotApproved(err)).toBe(true);
    expect(errorCodeOf(err)).toBe("MERCHANT_NOT_APPROVED");
  });

  it("is false for any other error", () => {
    const err = new KurtarApiError({
      statusCode: 401,
      errorCode: "UNAUTHORIZED",
      message: "x",
      isBackendErrorCode: false,
    });
    expect(isMerchantNotApproved(err)).toBe(false);
  });
});
