#!/usr/bin/env node
/**
 * Assemble the full deployable site into one directory.
 *
 *   dist/            the landing page (site/)
 *   dist/app/        the puzzle app (vite build)
 *
 * Everything is referenced relatively — the landing page links "./app/" and
 * vite builds with base "./" — so the whole thing works unchanged whether
 * it's served from a domain root or from a subpath like
 * apps.charliekrug.com/terseql/.
 */
import { execFileSync } from "node:child_process";
import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const appDir = join(dist, "app");

// Clear the whole output dir first: vite only empties its own outDir, so a
// stale landing asset would otherwise survive forever.
await rm(dist, { recursive: true, force: true });
await mkdir(appDir, { recursive: true });

console.log("building the app → dist/app");
execFileSync("npx", ["vite", "build", "--outDir", "dist/app", "--emptyOutDir"], {
  cwd: root,
  stdio: "inherit",
});

console.log("copying the landing page → dist");
await cp(join(root, "site"), dist, { recursive: true });

const entries = await readdir(dist);
console.log(`\ndist/ contains: ${entries.sort().join(", ")}`);
