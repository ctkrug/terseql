import { describe, expect, it, vi } from "vitest";
import { createLeaderboardClient, UNAVAILABLE } from "../src/remote-leaderboard.js";

const ENDPOINT = "https://scores.example/api";

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: () => Promise.resolve(body) };
}

function client(fetchImpl, options = {}) {
  return createLeaderboardClient({ endpoint: ENDPOINT, fetchImpl, ...options });
}

describe("configuration", () => {
  it("is disabled with no endpoint", () => {
    expect(createLeaderboardClient({ fetchImpl: vi.fn() }).isEnabled()).toBe(false);
  });

  it("is disabled where fetch is unavailable", () => {
    expect(createLeaderboardClient({ endpoint: ENDPOINT, fetchImpl: null }).isEnabled()).toBe(
      false,
    );
  });

  it("is enabled with both an endpoint and a fetch", () => {
    expect(client(vi.fn()).isEnabled()).toBe(true);
  });

  it("reports not-configured instead of calling out when disabled", async () => {
    const fetchImpl = vi.fn();
    const disabled = createLeaderboardClient({ fetchImpl });

    expect(await disabled.submit({ puzzleId: "2026-07-16", bytes: 61 })).toEqual({
      ok: false,
      reason: UNAVAILABLE.NOT_CONFIGURED,
    });
    expect(await disabled.fetchTop("2026-07-16")).toEqual({
      ok: false,
      reason: UNAVAILABLE.NOT_CONFIGURED,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("submit", () => {
  it("posts the puzzle, byte count, and timestamp as JSON", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(jsonResponse({})));
    const result = await client(fetchImpl).submit({
      puzzleId: "2026-07-16",
      bytes: 61,
      timestamp: "2026-07-16T10:00:00Z",
    });

    expect(result).toEqual({ ok: true });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`${ENDPOINT}/submit`);
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({
      puzzleId: "2026-07-16",
      bytes: 61,
      timestamp: "2026-07-16T10:00:00Z",
    });
  });

  it("never sends the query text — the leaderboard must not be scrapeable", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(jsonResponse({})));
    await client(fetchImpl).submit({
      puzzleId: "2026-07-16",
      bytes: 61,
      query: "SELECT name,SUM(amount)FROM customers c JOIN orders ON customer_id=c.id GROUP BY 1",
    });

    const body = fetchImpl.mock.calls[0][1].body;
    expect(body).not.toContain("SELECT");
    expect(body).not.toContain("query");
    expect(Object.keys(JSON.parse(body)).sort()).toEqual(["bytes", "puzzleId", "timestamp"]);
  });

  it("stamps a timestamp when the caller omits one", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(jsonResponse({})));
    await client(fetchImpl).submit({ puzzleId: "2026-07-16", bytes: 61 });

    const { timestamp } = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(Number.isNaN(Date.parse(timestamp))).toBe(false);
  });

  it("reports a server error rather than throwing", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(jsonResponse({}, { ok: false, status: 500 })));
    expect(await client(fetchImpl).submit({ puzzleId: "2026-07-16", bytes: 61 })).toEqual({
      ok: false,
      reason: UNAVAILABLE.SERVER,
    });
  });

  it("reports a network failure rather than rejecting", async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new TypeError("Failed to fetch")));
    expect(await client(fetchImpl).submit({ puzzleId: "2026-07-16", bytes: 61 })).toEqual({
      ok: false,
      reason: UNAVAILABLE.NETWORK,
    });
  });
});

describe("fetchTop", () => {
  it("requests the day's scores and returns them sorted by bytes ascending", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          entries: [
            { bytes: 74, name: "ada" },
            { bytes: 49, name: "grace" },
            { bytes: 61, name: "alan" },
          ],
        }),
      ),
    );

    const result = await client(fetchImpl).fetchTop("2026-07-16");
    expect(result.ok).toBe(true);
    expect(result.entries.map((e) => e.bytes)).toEqual([49, 61, 74]);
    expect(fetchImpl.mock.calls[0][0]).toContain("puzzleId=2026-07-16");
  });

  it("accepts a bare array payload as well as an {entries} envelope", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(jsonResponse([{ bytes: 61 }])));
    const result = await client(fetchImpl).fetchTop("2026-07-16");
    expect(result.entries).toHaveLength(1);
  });

  it("honors the limit", async () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({ bytes: i + 1 }));
    const fetchImpl = vi.fn(() => Promise.resolve(jsonResponse({ entries: rows })));

    const result = await client(fetchImpl).fetchTop("2026-07-16", 3);
    expect(result.entries).toHaveLength(3);
    expect(fetchImpl.mock.calls[0][0]).toContain("limit=3");
  });

  it("url-encodes the puzzle id", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(jsonResponse([])));
    await client(fetchImpl).fetchTop("a b&c=d");
    expect(fetchImpl.mock.calls[0][0]).toContain("puzzleId=a%20b%26c%3Dd");
  });

  it("drops rows with an unusable byte count", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          entries: [{ bytes: 61 }, { bytes: "nonsense" }, { bytes: null }, {}, null],
        }),
      ),
    );
    const result = await client(fetchImpl).fetchTop("2026-07-16");
    expect(result.entries).toEqual([{ bytes: 61, name: "anon", timestamp: null }]);
  });

  it("drops impossible scores that would otherwise top the board forever", async () => {
    // Number(null) and Number("") are both 0 — the best possible score. A
    // backend bug must not be able to plant an unbeatable row.
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        jsonResponse([
          { bytes: null },
          { bytes: "" },
          { bytes: false },
          { bytes: [] },
          { bytes: 0 },
          { bytes: -10 },
          { bytes: Infinity },
          { bytes: 61 },
        ]),
      ),
    );
    const result = await client(fetchImpl).fetchTop("2026-07-16");
    expect(result.entries.map((e) => e.bytes)).toEqual([61]);
  });

  it("coerces a numeric string byte count", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(jsonResponse([{ bytes: "61" }])));
    const result = await client(fetchImpl).fetchTop("2026-07-16");
    expect(result.entries[0].bytes).toBe(61);
  });

  it("truncates an absurdly long name from an untrusted backend", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(jsonResponse([{ bytes: 61, name: "x".repeat(500) }])),
    );
    const result = await client(fetchImpl).fetchTop("2026-07-16");
    expect(result.entries[0].name.length).toBe(24);
  });

  it("reports malformed for a payload that is not a list of scores", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(jsonResponse({ unexpected: "shape" })));
    expect(await client(fetchImpl).fetchTop("2026-07-16")).toEqual({
      ok: false,
      reason: UNAVAILABLE.MALFORMED,
    });
  });

  it("reports malformed when the body is not JSON", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new Error("<html>")) }),
    );
    expect(await client(fetchImpl).fetchTop("2026-07-16")).toEqual({
      ok: false,
      reason: UNAVAILABLE.MALFORMED,
    });
  });

  it("returns an empty list — not an error — when nobody has solved yet", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(jsonResponse({ entries: [] })));
    expect(await client(fetchImpl).fetchTop("2026-07-16")).toEqual({ ok: true, entries: [] });
  });

  it("times out a hanging backend instead of leaving the panel spinning", async () => {
    const fetchImpl = vi.fn(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        }),
    );

    const result = await client(fetchImpl, { timeoutMs: 10 }).fetchTop("2026-07-16");
    expect(result).toEqual({ ok: false, reason: UNAVAILABLE.TIMEOUT });
  });
});
