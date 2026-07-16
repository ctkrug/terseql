import initSqlJs from "sql.js";
import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url";

const isNode = typeof process !== "undefined" && process.release?.name === "node";

let sqlJsPromise;

/**
 * Absolute on-disk path to one of sql.js's shipped files, for the Node/vitest
 * side only — the browser gets `sqlWasmUrl` instead.
 *
 * Built by string concatenation on purpose. The obvious spelling,
 * `new URL("../node_modules/...", import.meta.url)`, does not survive: Vite
 * statically rewrites that exact pattern at transform time into a
 * webroot-relative asset URL ("/node_modules/..."), which is not a filesystem
 * path, so sql.js reads it as root-absolute and fails with ENOENT. Keeping
 * the path out of that pattern is what makes it a real path.
 */
function nodeWasmPath(file) {
  return `${process.cwd()}/node_modules/sql.js/dist/${file}`;
}

// sql.js ships its engine as a WASM binary. In the browser, Vite's `?url`
// import resolves it to a hashed, fingerprinted asset URL. Under Node
// (vitest), that same URL is webroot-relative and not a real filesystem
// path, so we resolve straight to the package's on-disk file instead.
function loadSqlJs() {
  if (!sqlJsPromise) {
    sqlJsPromise = initSqlJs({
      locateFile: (file) => (isNode ? nodeWasmPath(file) : sqlWasmUrl),
    });
  }
  return sqlJsPromise;
}

/**
 * Create a fresh, empty in-memory SQLite database.
 * @returns {Promise<import("sql.js").Database>}
 */
export async function createDatabase() {
  const SQL = await loadSqlJs();
  return new SQL.Database();
}

/**
 * Create a database seeded from one or more setup SQL statements
 * (schema + fixture rows).
 * @param {string} setupSql
 * @returns {Promise<import("sql.js").Database>}
 */
export async function createSeededDatabase(setupSql) {
  const db = await createDatabase();
  db.run(setupSql);
  return db;
}
