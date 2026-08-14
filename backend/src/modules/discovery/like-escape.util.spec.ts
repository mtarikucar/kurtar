import { escapeLikePattern } from "./like-escape.util";

describe("escapeLikePattern", () => {
  it("leaves ordinary text untouched", () => {
    expect(escapeLikePattern("simit")).toBe("simit");
  });

  it("escapes a bare % so it stops meaning 'match everything'", () => {
    expect(escapeLikePattern("%")).toBe("\\%");
  });

  it("escapes % embedded in a genuine search term", () => {
    expect(escapeLikePattern("50% İndirim")).toBe("50\\% İndirim");
  });

  it("escapes underscore (LIKE's single-char wildcard)", () => {
    expect(escapeLikePattern("under_score")).toBe("under\\_score");
  });

  it("escapes a literal backslash first, so it isn't double-unescaped", () => {
    expect(escapeLikePattern("a\\b")).toBe("a\\\\b");
  });

  it("escapes a mix of backslash, percent, and underscore correctly", () => {
    expect(escapeLikePattern("50%\\_off")).toBe("50\\%\\\\\\_off");
  });

  it("is a no-op on an empty string", () => {
    expect(escapeLikePattern("")).toBe("");
  });
});
