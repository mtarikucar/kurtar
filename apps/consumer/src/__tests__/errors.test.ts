import { KurtarApiError } from "@kurtar/api-client";
import { classifyOtpRequestError, getErrorMessage } from "../lib/errors";
import "../i18n";
import i18n from "../i18n";

describe("classifyOtpRequestError — OTP resend cooldown vs lockout vs throttle", () => {
  // backend/src/modules/otp/otp.service.ts's requestOtp() has no declared
  // errorCode of its own — every rejection is a plain BadRequestException
  // (or a 429 from the route's @Throttle tier). Message-text matching is
  // the ONLY signal available; these fixtures are the real strings that
  // service throws.
  it("classifies the 60s resend-cooldown message", () => {
    const err = new KurtarApiError({
      statusCode: 400,
      errorCode: "BAD_REQUEST",
      message: "Please wait before requesting another code.",
      isBackendErrorCode: false,
    });
    expect(classifyOtpRequestError(err)).toBe("cooldown");
  });

  it("classifies the 24h failure-lockout message", () => {
    const err = new KurtarApiError({
      statusCode: 400,
      errorCode: "BAD_REQUEST",
      message:
        "Too many failed verification attempts on this phone. Please try again later.",
      isBackendErrorCode: false,
    });
    expect(classifyOtpRequestError(err)).toBe("lockout");
  });

  it("classifies a 429 as throttled regardless of message", () => {
    const err = new KurtarApiError({
      statusCode: 429,
      errorCode: "THROTTLER_EXCEPTION",
      message: "ThrottlerException: Too Many Requests",
      isBackendErrorCode: false,
    });
    expect(classifyOtpRequestError(err)).toBe("throttled");
  });

  it("falls back to 'other' for an unrecognized 400 message", () => {
    const err = new KurtarApiError({
      statusCode: 400,
      errorCode: "BAD_REQUEST",
      message: "Please enter a valid phone number.",
      isBackendErrorCode: false,
    });
    expect(classifyOtpRequestError(err)).toBe("other");
  });

  it("falls back to 'other' for a non-KurtarApiError", () => {
    expect(classifyOtpRequestError(new Error("boom"))).toBe("other");
  });
});

describe("getErrorMessage — Turkish copy per error class", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("tr");
  });

  it("maps a real backend errorCode to its Turkish copy", () => {
    const err = new KurtarApiError({
      statusCode: 409,
      errorCode: "OFFER_UNAVAILABLE",
      message: "This offer is no longer available.",
      isBackendErrorCode: true,
    });
    expect(getErrorMessage(err, i18n.t)).toBe("Bu paket az önce tükendi.");
  });

  it("falls back to the network-error copy for a network failure", () => {
    const err = new KurtarApiError({
      statusCode: 0,
      errorCode: "NETWORK_ERROR",
      message: "Network request failed.",
      isBackendErrorCode: false,
    });
    expect(getErrorMessage(err, i18n.t)).toBe(
      "İnternet bağlantını kontrol et ve tekrar dene.",
    );
  });

  it("falls back to the generic copy for an unrecognized backend errorCode", () => {
    const err = new KurtarApiError({
      statusCode: 400,
      errorCode: "SOME_FUTURE_CODE_NOT_YET_TRANSLATED",
      message: "Something new.",
      isBackendErrorCode: true,
    });
    expect(getErrorMessage(err, i18n.t)).toBe("Bir şeyler ters gitti. Lütfen tekrar dene.");
  });

  it("falls back to the generic copy for a non-KurtarApiError", () => {
    expect(getErrorMessage(new Error("boom"), i18n.t)).toBe(
      "Bir şeyler ters gitti. Lütfen tekrar dene.",
    );
  });
});
