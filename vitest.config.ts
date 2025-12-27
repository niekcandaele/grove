import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Run unit tests only - exclude e2e tests
    include: ["src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "tests/e2e/**"],
  },
});
