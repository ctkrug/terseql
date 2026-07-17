const DEFAULT_TIMEOUT_MS = 4000;
const DEFAULT_LIMIT = 10;

/**
 * Reasons a leaderboard call can come back empty. The UI maps these to a
 * designed state rather than a blank panel, so they're part of the contract.
 */
export const UNAVAILABLE = {
  NOT_CONFIGURED: "not-configured",
  NETWORK: "network",
  TIMEOUT: "timeout",
  SERVER: "server",
  MALFORMED: "malformed",
};

/**
 * Read a byte count from an untrusted row.
 *
 * Deliberately stricter than `Number()`, which maps null, "", false and []
 * all to 0 — and 0 is both an impossible score and the best one, so a sloppy
 * coercion would park garbage at the top of the board permanently. Only a
 * real number or a numeric string counts, and it must be a positive integer:
 * a query is a whole number of bytes, so 0.5 is as impossible as 0 and sorts
 * just as unbeatably.
 *
 * @returns {number|null}
 */
function toBytes(value) {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Keep only what a leaderboard row needs, and coerce it. A backend is an
 * untrusted input boundary: a bad payload should degrade to "unavailable",
 * never inject junk (or markup) into the page.
 */
function parseEntries(payload) {
  const rows = Array.isArray(payload) ? payload : payload?.entries;
  if (!Array.isArray(rows)) return null;

  return rows
    .map((row) => ({ row, bytes: toBytes(row?.bytes) }))
    .filter(({ bytes }) => bytes !== null)
    .map(({ row, bytes }) => ({
      bytes,
      name: typeof row.name === "string" ? row.name.slice(0, 24) : "anon",
      timestamp: typeof row.timestamp === "string" ? row.timestamp : null,
    }))
    .sort((a, b) => a.bytes - b.bytes);
}

/**
 * Client for the shared daily leaderboard.
 *
 * Solving is entirely client-side; this is the one place the app talks to a
 * server, and it is deliberately optional — with no endpoint configured (the
 * current default) every call reports `not-configured` and the app falls back
 * to local personal bests. Nothing here can block or break a solve.
 *
 * @param {Object} [options]
 * @param {string} [options.endpoint] - base URL; omit to disable
 * @param {typeof fetch} [options.fetchImpl]
 * @param {number} [options.timeoutMs]
 */
export function createLeaderboardClient({
  endpoint,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const enabled = Boolean(endpoint) && typeof fetchImpl === "function";

  // `readBody`, when given, runs under the same abort timer as the request
  // itself — a server that sends headers and then stalls the body must abort
  // too, not just one that never answers at all. Its errors are reported as
  // MALFORMED rather than NETWORK, since the request itself succeeded.
  async function call(path, init, { readBody } = {}) {
    // AbortController isn't universal; without it we just don't time out.
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      let response;
      try {
        response = await fetchImpl(`${endpoint}${path}`, { ...init, signal: controller?.signal });
      } catch (err) {
        const reason = err?.name === "AbortError" ? UNAVAILABLE.TIMEOUT : UNAVAILABLE.NETWORK;
        return { ok: false, reason };
      }
      if (!response.ok) return { ok: false, reason: UNAVAILABLE.SERVER, status: response.status };
      if (!readBody) return { ok: true, response };
      try {
        return { ok: true, response, body: await readBody(response) };
      } catch (err) {
        const reason = err?.name === "AbortError" ? UNAVAILABLE.TIMEOUT : UNAVAILABLE.MALFORMED;
        return { ok: false, reason };
      }
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return {
    isEnabled: () => enabled,

    /**
     * Submit a passing solve.
     *
     * The payload carries the byte count and nothing else that matters — no
     * query text, ever. The leaderboard is public, so shipping the query
     * would let anyone scrape the day's answers straight off it.
     *
     * @param {{puzzleId: string, bytes: number, timestamp?: string, name?: string}} entry
     * @returns {Promise<{ok: boolean, reason?: string}>}
     */
    async submit({ puzzleId, bytes, timestamp, name }) {
      if (!enabled) return { ok: false, reason: UNAVAILABLE.NOT_CONFIGURED };

      const body = JSON.stringify({
        puzzleId,
        bytes,
        timestamp: timestamp ?? new Date().toISOString(),
        ...(name ? { name } : {}),
      });

      const result = await call("/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      return result.ok ? { ok: true } : { ok: false, reason: result.reason };
    },

    /**
     * Fetch the day's lowest byte counts.
     * @param {string} puzzleId
     * @param {number} [limit]
     * @returns {Promise<{ok: true, entries: Array} | {ok: false, reason: string}>}
     */
    async fetchTop(puzzleId, limit = DEFAULT_LIMIT) {
      if (!enabled) return { ok: false, reason: UNAVAILABLE.NOT_CONFIGURED };

      const query = `?puzzleId=${encodeURIComponent(puzzleId)}&limit=${encodeURIComponent(limit)}`;
      const result = await call(
        `/top${query}`,
        { method: "GET" },
        {
          readBody: (response) => response.json(),
        },
      );
      if (!result.ok) return { ok: false, reason: result.reason };

      const entries = parseEntries(result.body);
      if (!entries) return { ok: false, reason: UNAVAILABLE.MALFORMED };
      return { ok: true, entries: entries.slice(0, limit) };
    },
  };
}

/**
 * The app's client. Configured at build time via VITE_LEADERBOARD_URL; with
 * no endpoint set the app runs standalone on local personal bests.
 */
export const leaderboardClient = createLeaderboardClient({
  endpoint: import.meta.env?.VITE_LEADERBOARD_URL,
});
