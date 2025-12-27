/**
 * State Accumulation Scenario: Test behavior with many worktrees over time
 *
 * Tests that:
 * - System handles many concurrent worktrees
 * - Port registry grows correctly
 * - List and status commands work with many entries
 * - Cleanup works after heavy usage
 */

import { describe, it, beforeAll, afterAll } from "vitest";
import { join } from "node:path";
import {
  setupTestEnvironment,
  createGroveRunner,
  assertions,
  getEnvVar,
  type TestEnvironment,
  type GroveRunner,
} from "../helpers/index.js";

describe.sequential("State Accumulation: Many Worktrees", () => {
  let testEnv: TestEnvironment;
  let grove: GroveRunner;
  const ENV_COUNT = 10;

  beforeAll(() => {
    testEnv = setupTestEnvironment({
      withPorts: true,
      envExampleContent: `HTTP_PORT=3000
DB_PORT=5432
REDIS_PORT=6379`,
    });
    grove = createGroveRunner(testEnv);
  });

  afterAll(() => {
    // Clean up all environments
    for (let i = 0; i < ENV_COUNT; i++) {
      grove.delete(`env-${i}`, ["--force", "--delete-branch"]);
    }
    testEnv.cleanup();
  });

  it("creates many environments sequentially", () => {
    for (let i = 0; i < ENV_COUNT; i++) {
      const result = grove.create(`env-${i}`);
      assertions.exitCode(result, 0);
    }
  });

  it("all worktree directories exist", () => {
    for (let i = 0; i < ENV_COUNT; i++) {
      const worktreeDir = join(testEnv.worktreeBaseDir, `env-${i}`);
      assertions.dirExists(worktreeDir);
    }
  });

  it("list shows all environments", () => {
    const result = grove.list();
    assertions.exitCode(result, 0);

    for (let i = 0; i < ENV_COUNT; i++) {
      assertions.outputContains(result, `env-${i}`);
    }
  });

  it("each environment has unique ports", () => {
    const usedPorts = new Set<string>();

    for (let i = 0; i < ENV_COUNT; i++) {
      const envPath = join(testEnv.worktreeBaseDir, `env-${i}`, ".env");
      const httpPort = getEnvVar(envPath, "HTTP_PORT");
      const dbPort = getEnvVar(envPath, "DB_PORT");
      const redisPort = getEnvVar(envPath, "REDIS_PORT");

      // Each port should be unique
      if (httpPort) {
        if (usedPorts.has(httpPort)) {
          throw new Error(`Duplicate port found: ${httpPort}`);
        }
        usedPorts.add(httpPort);
      }
      if (dbPort) {
        if (usedPorts.has(dbPort)) {
          throw new Error(`Duplicate port found: ${dbPort}`);
        }
        usedPorts.add(dbPort);
      }
      if (redisPort) {
        if (usedPorts.has(redisPort)) {
          throw new Error(`Duplicate port found: ${redisPort}`);
        }
        usedPorts.add(redisPort);
      }
    }

    // Should have 3 ports * 10 environments = 30 unique ports
    if (usedPorts.size !== ENV_COUNT * 3) {
      throw new Error(`Expected ${ENV_COUNT * 3} unique ports, got ${usedPorts.size}`);
    }
  });

  it("status shows port allocations", () => {
    const result = grove.status();
    assertions.exitCode(result, 0);

    // Last allocated port should be 30000 + (ENV_COUNT * 3) - 1 = 30029
    const lastPort = 30000 + ENV_COUNT * 3 - 1;
    assertions.outputContains(result, String(lastPort));
  });

  it("deletes all environments", () => {
    for (let i = 0; i < ENV_COUNT; i++) {
      const result = grove.delete(`env-${i}`, ["--force", "--delete-branch"]);
      assertions.exitCode(result, 0);
    }
  });

  it("list shows no environments after cleanup", () => {
    const result = grove.list();
    assertions.outputContains(result, "No environments found");
  });

  it("worktree directories are all removed", () => {
    for (let i = 0; i < ENV_COUNT; i++) {
      const worktreeDir = join(testEnv.worktreeBaseDir, `env-${i}`);
      assertions.dirNotExists(worktreeDir);
    }
  });
});

describe.sequential("State Accumulation: Mixed Create/Delete", () => {
  let testEnv: TestEnvironment;
  let grove: GroveRunner;

  beforeAll(() => {
    testEnv = setupTestEnvironment({
      withPorts: true,
      envExampleContent: `PORT=3000`,
    });
    grove = createGroveRunner(testEnv);
  });

  afterAll(() => {
    // Clean up any remaining
    for (let i = 0; i < 10; i++) {
      grove.delete(`env-${i}`, ["--force", "--delete-branch"]);
    }
    testEnv.cleanup();
  });

  it("handles interleaved create and delete operations", () => {
    // Create 5 environments
    for (let i = 0; i < 5; i++) {
      const result = grove.create(`env-${i}`);
      assertions.exitCode(result, 0);
    }

    // Delete odd-numbered ones
    for (let i = 1; i < 5; i += 2) {
      const result = grove.delete(`env-${i}`, ["--force", "--delete-branch"]);
      assertions.exitCode(result, 0);
    }

    // Create more environments - should reuse deleted ports
    for (let i = 5; i < 8; i++) {
      const result = grove.create(`env-${i}`);
      assertions.exitCode(result, 0);
    }

    // Verify remaining environments
    const listResult = grove.list();
    assertions.outputContains(listResult, "env-0");
    assertions.outputContains(listResult, "env-2");
    assertions.outputContains(listResult, "env-4");
    assertions.outputContains(listResult, "env-5");
    assertions.outputContains(listResult, "env-6");
    assertions.outputContains(listResult, "env-7");

    // Clean up
    for (const name of ["env-0", "env-2", "env-4", "env-5", "env-6", "env-7"]) {
      grove.delete(name, ["--force", "--delete-branch"]);
    }
  });
});
