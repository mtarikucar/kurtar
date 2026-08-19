import { Response } from "express";
import { setRefreshCookie } from "./refresh-cookie-transport.util";

/**
 * [M1] The refresh cookie is the long-lived session credential. It used
 * to be `secure` only when NODE_ENV was exactly "production", so on
 * staging — a validated NODE_ENV and a real deployment target
 * (ops/docker-compose.staging.yml) — it was written WITHOUT Secure and
 * travelled in cleartext on any plain-HTTP hop.
 *
 * Hard-coding Secure for staging would have been the wrong fix in the
 * other direction: that compose file terminates no TLS, so it would have
 * broken staging sign-in outright. The flag is therefore an explicit
 * opt-in the deployment turns on when it is actually behind TLS.
 */
function makeRes(): Response & { cookie: jest.Mock; clearCookie: jest.Mock } {
  return {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  } as unknown as Response & { cookie: jest.Mock; clearCookie: jest.Mock };
}

function secureFlag(res: ReturnType<typeof makeRes>): boolean {
  const [, , options] = res.cookie.mock.calls[0] as [
    string,
    string,
    { secure: boolean },
  ];
  return options.secure;
}

function yaz(): ReturnType<typeof makeRes> {
  const res = makeRes();
  setRefreshCookie(res, "CONSUMER", "tok", new Date(Date.now() + 60_000));
  return res;
}

describe("setRefreshCookie — the Secure flag", () => {
  const onceki = { ...process.env };

  afterEach(() => {
    process.env = { ...onceki };
  });

  function ayarla(env: { NODE_ENV?: string; REFRESH_COOKIE_SECURE?: string }) {
    delete process.env.NODE_ENV;
    delete process.env.REFRESH_COOKIE_SECURE;
    Object.assign(process.env, env);
  }

  it("is off locally, where there is no TLS to require", () => {
    ayarla({ NODE_ENV: "development" });
    expect(secureFlag(yaz())).toBe(false);
  });

  it("is always on in production", () => {
    ayarla({ NODE_ENV: "production" });
    expect(secureFlag(yaz())).toBe(true);
  });

  it("can be turned on for any deployed environment that has TLS", () => {
    ayarla({ NODE_ENV: "staging", REFRESH_COOKIE_SECURE: "true" });
    expect(secureFlag(yaz())).toBe(true);
  });

  it("stays off on a staging box that terminates no TLS, so sign-in still works", () => {
    ayarla({ NODE_ENV: "staging" });
    expect(secureFlag(yaz())).toBe(false);
  });

  it("does not treat production as opt-out-able", () => {
    ayarla({ NODE_ENV: "production", REFRESH_COOKIE_SECURE: "false" });
    expect(secureFlag(yaz())).toBe(true);
  });
});
