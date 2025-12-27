/**
 * Port Allocation Scenario: Test port allocation, sequential numbering, and reuse
 * Migrated from 02-with-ports.sh
 *
 * Tests that:
 * - Ports are allocated sequentially from 30000
 * - Each environment gets unique ports
 * - Deleted environment ports are reused
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

describe.sequential("Port Allocation: Sequential Assignment", () => {
  let testEnv: TestEnvironment;
  let grove: GroveRunner;

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
    // Clean up any remaining environments
    grove.delete("env-one", ["--force", "--delete-branch"]);
    grove.delete("env-two", ["--force", "--delete-branch"]);
    grove.delete("env-three", ["--force", "--delete-branch"]);
    testEnv.cleanup();
  });

  it("creates first environment with ports starting at 30000", () => {
    const result = grove.create("env-one");
    assertions.exitCode(result, 0);
  });

  it("first environment .env file exists", () => {
    const envPath = join(testEnv.worktreeBaseDir, "env-one", ".env");
    assertions.fileExists(envPath);
  });

  it("first environment gets HTTP_PORT=30000", () => {
    const envPath = join(testEnv.worktreeBaseDir, "env-one", ".env");
    assertions.envFileHasVar(envPath, "HTTP_PORT", 30000);
  });

  it("first environment gets DB_PORT=30001", () => {
    const envPath = join(testEnv.worktreeBaseDir, "env-one", ".env");
    assertions.envFileHasVar(envPath, "DB_PORT", 30001);
  });

  it("first environment gets REDIS_PORT=30002", () => {
    const envPath = join(testEnv.worktreeBaseDir, "env-one", ".env");
    assertions.envFileHasVar(envPath, "REDIS_PORT", 30002);
  });

  it("status shows port allocations", () => {
    const result = grove.status();
    assertions.exitCode(result, 0);
    assertions.outputContains(result, "30000");
  });

  it("creates second environment with different ports", () => {
    const result = grove.create("env-two");
    assertions.exitCode(result, 0);
  });

  it("second environment gets HTTP_PORT=30003", () => {
    const envPath = join(testEnv.worktreeBaseDir, "env-two", ".env");
    assertions.envFileHasVar(envPath, "HTTP_PORT", 30003);
  });

  it("second environment gets sequential ports", () => {
    const envPath = join(testEnv.worktreeBaseDir, "env-two", ".env");
    assertions.envFileHasVar(envPath, "DB_PORT", 30004);
    assertions.envFileHasVar(envPath, "REDIS_PORT", 30005);
  });
});

describe.sequential("Port Allocation: Port Reuse After Deletion", () => {
  let testEnv: TestEnvironment;
  let grove: GroveRunner;

  beforeAll(() => {
    testEnv = setupTestEnvironment({
      withPorts: true,
      envExampleContent: `HTTP_PORT=3000
DB_PORT=5432`,
    });
    grove = createGroveRunner(testEnv);
  });

  afterAll(() => {
    grove.delete("env-alpha", ["--force", "--delete-branch"]);
    grove.delete("env-beta", ["--force", "--delete-branch"]);
    grove.delete("env-gamma", ["--force", "--delete-branch"]);
    testEnv.cleanup();
  });

  it("creates first environment (env-alpha) with ports 30000-30001", () => {
    const result = grove.create("env-alpha");
    assertions.exitCode(result, 0);

    const envPath = join(testEnv.worktreeBaseDir, "env-alpha", ".env");
    assertions.envFileHasVar(envPath, "HTTP_PORT", 30000);
    assertions.envFileHasVar(envPath, "DB_PORT", 30001);
  });

  it("creates second environment (env-beta) with ports 30002-30003", () => {
    const result = grove.create("env-beta");
    assertions.exitCode(result, 0);

    const envPath = join(testEnv.worktreeBaseDir, "env-beta", ".env");
    assertions.envFileHasVar(envPath, "HTTP_PORT", 30002);
    assertions.envFileHasVar(envPath, "DB_PORT", 30003);
  });

  it("deletes first environment (env-alpha)", () => {
    const result = grove.delete("env-alpha", ["--force", "--delete-branch"]);
    assertions.exitCode(result, 0);
  });

  it("creates third environment (env-gamma) reusing released ports", () => {
    const result = grove.create("env-gamma");
    assertions.exitCode(result, 0);

    // Should reuse ports 30000-30001 from deleted env-alpha
    const envPath = join(testEnv.worktreeBaseDir, "env-gamma", ".env");
    assertions.envFileHasVar(envPath, "HTTP_PORT", 30000);
    assertions.envFileHasVar(envPath, "DB_PORT", 30001);
  });
});

describe.sequential("Port Allocation: Custom Patterns", () => {
  let testEnv: TestEnvironment;
  let grove: GroveRunner;

  beforeAll(() => {
    testEnv = setupTestEnvironment({
      groveConfig: {
        portVarPatterns: ["*_PORT", "PORT_*"],
      },
      envExampleContent: `API_PORT=3000
PORT_WEB=8080
SOME_OTHER_VAR=hello`,
    });
    grove = createGroveRunner(testEnv);
  });

  afterAll(() => {
    grove.delete("custom-pattern", ["--force", "--delete-branch"]);
    testEnv.cleanup();
  });

  it("creates environment with custom port patterns", () => {
    const result = grove.create("custom-pattern");
    assertions.exitCode(result, 0);
  });

  it("allocates ports for variables matching *_PORT", () => {
    const envPath = join(testEnv.worktreeBaseDir, "custom-pattern", ".env");
    assertions.envFileHasVar(envPath, "API_PORT", 30000);
  });

  it("allocates ports for variables matching PORT_*", () => {
    const envPath = join(testEnv.worktreeBaseDir, "custom-pattern", ".env");
    assertions.envFileHasVar(envPath, "PORT_WEB", 30001);
  });

  it("preserves non-port variables unchanged", () => {
    const envPath = join(testEnv.worktreeBaseDir, "custom-pattern", ".env");
    assertions.fileContains(envPath, "SOME_OTHER_VAR=hello");
  });
});
