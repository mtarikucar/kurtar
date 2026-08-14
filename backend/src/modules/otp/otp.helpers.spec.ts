import { constantTimeEquals, generateOtp, hashOtp } from "./otp.helpers";

describe("generateOtp", () => {
  it("produces a 6-digit numeric string", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateOtp();
      expect(code).toMatch(/^\d{6}$/);
      expect(Number(code)).toBeGreaterThanOrEqual(100_000);
      expect(Number(code)).toBeLessThanOrEqual(999_999);
    }
  });

  it("is not visibly constant across calls", () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateOtp()));
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe("hashOtp", () => {
  const original = process.env.JWT_SECRET;
  afterEach(() => {
    process.env.JWT_SECRET = original;
  });

  it("is deterministic for the same code + secret", () => {
    process.env.JWT_SECRET = "test-secret";
    expect(hashOtp("123456")).toBe(hashOtp("123456"));
  });

  it("differs when the secret differs (secret is mixed in)", () => {
    process.env.JWT_SECRET = "secret-a";
    const a = hashOtp("123456");
    process.env.JWT_SECRET = "secret-b";
    const b = hashOtp("123456");
    expect(a).not.toBe(b);
  });

  it("differs for different codes", () => {
    process.env.JWT_SECRET = "test-secret";
    expect(hashOtp("111111")).not.toBe(hashOtp("222222"));
  });

  it("never returns the raw code", () => {
    process.env.JWT_SECRET = "test-secret";
    expect(hashOtp("123456")).not.toContain("123456");
  });
});

describe("constantTimeEquals", () => {
  it("returns true for identical strings", () => {
    expect(constantTimeEquals("abc123", "abc123")).toBe(true);
  });

  it("returns false for different strings of the same length", () => {
    expect(constantTimeEquals("abc123", "abc124")).toBe(false);
  });

  it("returns false for different-length strings", () => {
    expect(constantTimeEquals("abc", "abcd")).toBe(false);
  });
});
