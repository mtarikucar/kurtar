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
});
