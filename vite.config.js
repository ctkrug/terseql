import { defineConfig } from "vite";

// Relative `base` so the built site works when hosted under any subpath
// (e.g. apps.charliekrug.com/terseql), not just at a domain root.
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
  },
});
