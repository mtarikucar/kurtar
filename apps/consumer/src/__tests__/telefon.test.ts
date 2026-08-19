import { telefonuBicimle } from "../lib/telefon";

describe("telefonuBicimle — the profile shows a phone number, not a column", () => {
  it("groups a Turkish mobile the way it is read aloud", () => {
    expect(telefonuBicimle("+905551110004")).toBe("+90 555 111 00 04");
  });

  it("leaves anything it cannot group untouched rather than guessing", () => {
    // A half-guessed grouping is worse than the raw digits: it implies a
    // structure the number may not have.
    expect(telefonuBicimle("+4915112345678")).toBe("+4915112345678");
    expect(telefonuBicimle("+9055511100")).toBe("+9055511100");
    expect(telefonuBicimle("")).toBe("");
  });

  it("tolerates surrounding whitespace from a stored value", () => {
    expect(telefonuBicimle("  +905551110004 ")).toBe("+90 555 111 00 04");
  });
});
