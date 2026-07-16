import { defineConfig } from "vite";

// Relative `base` so the built site works when hosted under any subpath
// (e.g. apps.charliekrug.com/terseql), not just at a domain root.
export default defineConfig({
  base: "./",
  build: {
    // dist/ belongs to the assembled site (scripts/build-site.mjs puts the
    // landing page there); the app is one directory inside it. Naming that
    // here keeps a bare `vite build` from emptying dist/ and taking the
    // landing page with it.
    outDir: "dist/app",
  },
});
