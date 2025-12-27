import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Only include e2e tests
    include: ["tests/e2e/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],

    // E2E tests need longer timeouts
    testTimeout: 30000,
    hookTimeout: 15000,

    // Run tests sequentially by default (scenarios depend on order)
    sequence: {
      shuffle: false,
    },

    // Run test files sequentially for e2e tests
    fileParallelism: false,

    // Global setup for binary validation
    globalSetup: ["./tests/e2e/setup.ts"],

    // Reporter configuration
    reporters: process.env.CI ? ["verbose", "github-actions"] : ["verbose"],

    // Pass through environment variables
    env: {
      NODE_ENV: "test",
    },
  },
});
