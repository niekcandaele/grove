/**
 * Lifecycle Scenario: Create → List → Activate → Delete → Recreate
 * Migrated from 01-sunny-day.sh
 *
 * Tests the basic CRUD workflow and verifies state transitions work correctly.
 */

import { describe, it, beforeAll, afterAll } from "vitest";
import { join } from "node:path";
import {
  setupTestEnvironment,
  createGroveRunner,
  assertions,
  type TestEnvironment,
  type GroveRunner,
} from "../helpers/index.js";

describe.sequential("Lifecycle: Basic CRUD Flow", () => {
  let testEnv: TestEnvironment;
  let grove: GroveRunner;

  beforeAll(() => {
    testEnv = setupTestEnvironment();
    grove = createGroveRunner(testEnv);
  });

  afterAll(() => {
    testEnv.cleanup();
  });

  it("creates an environment", () => {
    const result = grove.create("test-env");
    assertions.exitCode(result, 0);
  });

  it("worktree directory exists after creation", () => {
    const worktreeDir = join(testEnv.worktreeBaseDir, "test-env");
    assertions.dirExists(worktreeDir);
  });

  it("list shows the created environment", () => {
    const result = grove.list();
    assertions.exitCode(result, 0);
    assertions.outputContains(result, "test-env");
  });

  it("activate outputs activation command", () => {
    const result = grove.activate("test-env");
    assertions.exitCode(result, 0);
    // Output could be either:
    // - "cd <path>/test-env" (when Zellij not available)
    // - "zellij attach ... " with comment mentioning test-env (when Zellij available)
    assertions.outputContains(result, "test-env");
  });

  it("deletes the environment", () => {
    const result = grove.delete("test-env", ["--force", "--delete-branch"]);
    assertions.exitCode(result, 0);
  });

  it("worktree directory is removed after deletion", () => {
    const worktreeDir = join(testEnv.worktreeBaseDir, "test-env");
    assertions.dirNotExists(worktreeDir);
  });

  it("list shows no environments after deletion", () => {
    const result = grove.list();
    assertions.outputContains(result, "No environments found");
  });
});

describe.sequential("Lifecycle: Create → Delete → Recreate", () => {
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
    testEnv.cleanup();
  });

  it("creates first environment with ports", () => {
    const result = grove.create("feature-a");
    assertions.exitCode(result, 0);

    const envPath = join(testEnv.worktreeBaseDir, "feature-a", ".env");
    assertions.fileExists(envPath);
    assertions.envFileHasVar(envPath, "HTTP_PORT", 30000);
    assertions.envFileHasVar(envPath, "DB_PORT", 30001);
  });

  it("deletes the first environment", () => {
    const result = grove.delete("feature-a", ["--force", "--delete-branch"]);
    assertions.exitCode(result, 0);
    assertions.dirNotExists(join(testEnv.worktreeBaseDir, "feature-a"));
  });

  it("recreates environment with same name and reuses ports", () => {
    const result = grove.create("feature-a");
    assertions.exitCode(result, 0);

    // Port should be 30000 again (first available after release)
    const envPath = join(testEnv.worktreeBaseDir, "feature-a", ".env");
    assertions.fileExists(envPath);
    assertions.envFileHasVar(envPath, "HTTP_PORT", 30000);
    assertions.envFileHasVar(envPath, "DB_PORT", 30001);
  });

  it("cleans up recreated environment", () => {
    const result = grove.delete("feature-a", ["--force", "--delete-branch"]);
    assertions.exitCode(result, 0);
  });
});

describe.sequential("Lifecycle: No Port Configuration", () => {
  let testEnv: TestEnvironment;
  let grove: GroveRunner;

  beforeAll(() => {
    // Minimal project - no .grove.json, no .env.example
    testEnv = setupTestEnvironment();
    grove = createGroveRunner(testEnv);
  });

  afterAll(() => {
    testEnv.cleanup();
  });

  it("creates environment without port config", () => {
    const result = grove.create("simple-env");
    assertions.exitCode(result, 0);
  });

  it("worktree directory exists", () => {
    const worktreeDir = join(testEnv.worktreeBaseDir, "simple-env");
    assertions.dirExists(worktreeDir);
  });

  it("list shows environment", () => {
    const result = grove.list();
    assertions.outputContains(result, "simple-env");
  });

  it("status works without ports", () => {
    const result = grove.status();
    assertions.exitCode(result, 0);
  });

  it("deletes environment", () => {
    const result = grove.delete("simple-env", ["--force"]);
    assertions.exitCode(result, 0);
  });

  it("worktree directory is removed", () => {
    const worktreeDir = join(testEnv.worktreeBaseDir, "simple-env");
    assertions.dirNotExists(worktreeDir);
  });
});
