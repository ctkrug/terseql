import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.js"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.js"],
      // Puzzle files are content, not logic: tests/puzzles.test.js is
      // parametrized over the registry and already holds every one of them to
      // the catalogue bar. main.js is the bootstrap — it exists to be the one
      // thing tests don't drive. Counting either dilutes the number that
      // matters: how well the code that can be *wrong* is covered.
      exclude: ["src/puzzles/day-*.js", "src/main.js"],
      reporter: ["text", "json-summary"],
    },
  },
});
