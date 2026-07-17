import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import viteConfig from "../vite.config.js";

const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

/**
 * `vite build` writes the app to `dist/app`, but the *site* is `dist` — the
 * landing page sits at its root and links the app as `./app/`. That split is
 * the trap: every vite command defaults to the app's outDir, so anything that
 * serves the site has to be told the parent explicitly, or it serves the app
 * at `/` and the landing page becomes unreachable.
 */
describe("the preview script serves the assembled site, not just the app", () => {
  const APP_OUT_DIR = viteConfig.build.outDir;
  const SITE_OUT_DIR = APP_OUT_DIR.split("/")[0];

  it("builds the app one directory inside the site root", () => {
    expect(APP_OUT_DIR).toBe("dist/app");
    expect(SITE_OUT_DIR).toBe("dist");
  });

  it("points preview at the site root, so the landing page is reachable at /", () => {
    // Without this, `vite preview` inherits outDir `dist/app`: the app is
    // served at `/`, `/app/` falls back to the app's own index.html, and its
    // relative `./assets/*` resolve under `/app/` where nothing exists.
    expect(pkg.scripts.preview).toContain(`--outDir ${SITE_OUT_DIR}`);
  });

  it("assembles the site with build-site.mjs, which owns dist/ as a whole", () => {
    // A bare `vite build` only empties its own outDir, so the landing page has
    // to come from the assembler rather than from vite.
    expect(pkg.scripts.build).toBe("node scripts/build-site.mjs");
    expect(pkg.scripts["build:app"]).toBe("vite build");
  });
});
