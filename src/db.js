import initSqlJs from "sql.js";
import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url";

let sqlJsPromise;

// sql.js ships its engine as a WASM binary; Vite resolves the `?url` import
// to a hashed, fingerprinted asset URL so the WASM loads correctly whether
// we're in dev or a subpath production build.
function loadSqlJs() {
  if (!sqlJsPromise) {
    sqlJsPromise = initSqlJs({ locateFile: () => sqlWasmUrl });
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
