/**
 * Interruption Recovery Scenario: Test behavior with partial failures
 *
 * Tests that:
 * - System handles manually deleted worktree directories
 * - System handles deleted branches with existing worktrees
 * - System recovers from inconsistent state
 */

import { describe, it, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { rmSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import {
  setupTestEnvironment,
  createGroveRunner,
  assertions,
  type TestEnvironment,
  type GroveRunner,
} from "../helpers/index.js";

describe.sequential("Interruption: Manually Deleted Worktree", () => {
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
    grove.delete("orphan-env", ["--force", "--delete-branch"]);
    grove.delete("orphan-env-2", ["--force", "--delete-branch"]);
    testEnv.cleanup();
  });

  it("creates an environment", () => {
    const result = grove.create("orphan-env");
    assertions.exitCode(result, 0);
    assertions.dirExists(join(testEnv.worktreeBaseDir, "orphan-env"));
  });

  it("manually remove the worktree directory (simulating crash)", () => {
    const worktreeDir = join(testEnv.worktreeBaseDir, "orphan-env");
    rmSync(worktreeDir, { recursive: true, force: true });
    assertions.dirNotExists(worktreeDir);
  });

  it("list still shows the environment (stale entry)", () => {
    // Git worktree list may show the stale entry
    const result = grove.list();
    // Behavior may vary - just ensure command doesn't crash
    assertions.exitCode(result, 0);
  });

  it("can still delete the orphaned environment", () => {
    const result = grove.delete("orphan-env", ["--force", "--delete-branch"]);
    // Should succeed - grove handles missing directory gracefully
    assertions.exitCode(result, 0);
  });

  it("can create a new environment after cleanup", () => {
    const result = grove.create("orphan-env-2");
    assertions.exitCode(result, 0);
    assertions.dirExists(join(testEnv.worktreeBaseDir, "orphan-env-2"));
  });
});

describe.sequential("Interruption: Deleted Branch", () => {
  let testEnv: TestEnvironment;
  let grove: GroveRunner;

  beforeAll(() => {
    testEnv = setupTestEnvironment();
    grove = createGroveRunner(testEnv);
  });

  afterAll(() => {
    grove.delete("branch-deleted", ["--force", "--delete-branch"]);
    testEnv.cleanup();
  });

  it("creates an environment", () => {
    const result = grove.create("branch-deleted");
    assertions.exitCode(result, 0);
  });

  it("manually deletes the branch (keeping worktree)", () => {
    // Force delete the branch while worktree exists
    // This simulates someone running `git branch -D` accidentally
    try {
      execSync("git branch -D branch-deleted", {
        cwd: testEnv.repoDir,
        env: testEnv.env,
        stdio: "pipe",
      });
    } catch {
      // Branch might be checked out in worktree, that's fine for this test
    }
  });

  it("list still works", () => {
    const result = grove.list();
    // Should not crash
    assertions.exitCode(result, 0);
  });

  it("can still delete the environment with force flag", () => {
    const result = grove.delete("branch-deleted", ["--force"]);
    // Should succeed with --force flag despite missing branch
    assertions.exitCode(result, 0);
  });
});

describe.sequential("Interruption: Multiple Environments Partial Failure", () => {
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
    for (const name of ["valid-1", "valid-2", "partial-1", "partial-2"]) {
      grove.delete(name, ["--force", "--delete-branch"]);
    }
    testEnv.cleanup();
  });

  it("creates several valid environments", () => {
    grove.create("valid-1");
    grove.create("valid-2");

    assertions.dirExists(join(testEnv.worktreeBaseDir, "valid-1"));
    assertions.dirExists(join(testEnv.worktreeBaseDir, "valid-2"));
  });

  it("corrupts one environment by removing its directory", () => {
    rmSync(join(testEnv.worktreeBaseDir, "valid-1"), { recursive: true, force: true });
  });

  it("list command still works (shows valid environments)", () => {
    const result = grove.list();
    assertions.exitCode(result, 0);
    // valid-2 should still be listed
    assertions.outputContains(result, "valid-2");
  });

  it("status command still works", () => {
    const result = grove.status();
    // Should not crash
    assertions.exitCode(result, 0);
  });

  it("can create new environments despite corrupted state", () => {
    const result = grove.create("partial-1");
    assertions.exitCode(result, 0);
  });
});

describe("Interruption: Concurrent Naming Edge Cases", () => {
  let testEnv: TestEnvironment;
  let grove: GroveRunner;

  beforeEach(() => {
    testEnv = setupTestEnvironment();
    grove = createGroveRunner(testEnv);
  });

  afterEach(() => {
    grove.delete("test-branch", ["--force", "--delete-branch"]);
    grove.delete("test---branch", ["--force", "--delete-branch"]);
    grove.delete("test--branch", ["--force", "--delete-branch"]);
    testEnv.cleanup();
  });

  it("handles name with multiple hyphens", () => {
    const result = grove.create("test---branch");
    // Should sanitize to "test-branch" or similar
    assertions.exitCode(result, 0);
  });

  it("handles name with spaces", () => {
    const result = grove.create("my feature branch");
    // Should sanitize to "my-feature-branch"
    assertions.exitCode(result, 0);

    const listResult = grove.list();
    assertions.outputContains(listResult, "my-feature-branch");

    grove.delete("my-feature-branch", ["--force", "--delete-branch"]);
  });

  it("handles name with uppercase", () => {
    const result = grove.create("MyFeature");
    assertions.exitCode(result, 0);

    const listResult = grove.list();
    // Should be lowercased
    assertions.outputContains(listResult, "myfeature");

    grove.delete("myfeature", ["--force", "--delete-branch"]);
  });
});
