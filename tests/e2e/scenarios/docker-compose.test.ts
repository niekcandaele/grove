/**
 * Docker Compose Port Allocation: Verify allocated ports work with real containers
 *
 * Tests that:
 * - Two worktrees can run docker compose simultaneously without port conflicts
 * - Allocated ports are correctly passed to containers
 */

import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { execSync, spawnSync } from "node:child_process";
import { join } from "node:path";
import {
  setupTestEnvironment,
  createGroveRunner,
  assertions,
  type TestEnvironment,
  type GroveRunner,
} from "../helpers/index.js";

const DOCKER_COMPOSE_CONTENT = `services:
  app:
    image: busybox:latest
    command: sh -c "echo 'Listening on port' && httpd -f -p \${HTTP_PORT:-3000}"
    ports:
      - "\${HTTP_PORT:-3000}:\${HTTP_PORT:-3000}"
`;

function runDockerCompose(
  cwd: string,
  args: string[],
  env: Record<string, string>
): { exitCode: number; stdout: string; stderr: string } {
  const result = spawnSync("docker", ["compose", ...args], {
    cwd,
    env,
    encoding: "utf-8",
    timeout: 60000,
  });

  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function getContainerStatus(
  cwd: string,
  env: Record<string, string>
): string {
  const result = runDockerCompose(cwd, ["ps", "--format", "json"], env);
  return result.stdout;
}

function isDockerAvailable(): boolean {
  try {
    execSync("docker info", { stdio: "pipe", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

describe.sequential("Docker Compose Port Allocation", () => {
  let testEnv: TestEnvironment;
  let grove: GroveRunner;
  let envOneDir: string;
  let envTwoDir: string;
  let envOneComposeEnv: Record<string, string>;
  let envTwoComposeEnv: Record<string, string>;

  beforeAll(() => {
    if (!isDockerAvailable()) {
      console.log("Docker not available, skipping test");
      return;
    }

    testEnv = setupTestEnvironment({
      withPorts: true,
      envExampleContent: "HTTP_PORT=3000",
      dockerComposeContent: DOCKER_COMPOSE_CONTENT,
    });
    grove = createGroveRunner(testEnv);

    envOneDir = join(testEnv.worktreeBaseDir, "env-one");
    envTwoDir = join(testEnv.worktreeBaseDir, "env-two");

    // Unique project names to avoid compose conflicts
    envOneComposeEnv = {
      ...testEnv.env,
      COMPOSE_PROJECT_NAME: "grove-test-env-one",
    };
    envTwoComposeEnv = {
      ...testEnv.env,
      COMPOSE_PROJECT_NAME: "grove-test-env-two",
    };
  });

  afterAll(() => {
    if (!testEnv) return;

    // Stop and remove containers
    runDockerCompose(envOneDir, ["down", "--remove-orphans"], envOneComposeEnv);
    runDockerCompose(envTwoDir, ["down", "--remove-orphans"], envTwoComposeEnv);

    // Delete worktrees
    grove.delete("env-one", ["--force", "--delete-branch"]);
    grove.delete("env-two", ["--force", "--delete-branch"]);

    testEnv.cleanup();
  });

  it("skips if Docker is not available", () => {
    if (!isDockerAvailable()) {
      console.log("Docker not available - test skipped");
      return;
    }
    expect(true).toBe(true);
  });

  it("creates first worktree with allocated port", function () {
    if (!isDockerAvailable()) return this.skip?.();

    const result = grove.create("env-one");
    assertions.exitCode(result, 0);

    const envPath = join(envOneDir, ".env");
    assertions.fileExists(envPath);
    assertions.envFileHasVar(envPath, "HTTP_PORT", 30000);
  });

  it("creates second worktree with different port", function () {
    if (!isDockerAvailable()) return this.skip?.();

    const result = grove.create("env-two");
    assertions.exitCode(result, 0);

    const envPath = join(envTwoDir, ".env");
    assertions.fileExists(envPath);
    assertions.envFileHasVar(envPath, "HTTP_PORT", 30001);
  });

  it("starts docker compose in first worktree", function () {
    if (!isDockerAvailable()) return this.skip?.();

    const result = runDockerCompose(envOneDir, ["up", "-d"], envOneComposeEnv);
    expect(result.exitCode).toBe(0);
  });

  it("starts docker compose in second worktree simultaneously", function () {
    if (!isDockerAvailable()) return this.skip?.();

    const result = runDockerCompose(envTwoDir, ["up", "-d"], envTwoComposeEnv);
    expect(result.exitCode).toBe(0);
  });

  it("both containers are running without port conflicts", async function () {
    if (!isDockerAvailable()) return this.skip?.();

    // Wait a moment for containers to stabilize
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Check first container
    const statusOne = runDockerCompose(envOneDir, ["ps", "-q"], envOneComposeEnv);
    expect(statusOne.stdout.trim()).not.toBe("");

    // Check second container
    const statusTwo = runDockerCompose(envTwoDir, ["ps", "-q"], envTwoComposeEnv);
    expect(statusTwo.stdout.trim()).not.toBe("");

    // Verify containers are actually running (not exited due to port conflict)
    const logsOne = runDockerCompose(envOneDir, ["logs"], envOneComposeEnv);
    expect(logsOne.stderr).not.toContain("address already in use");

    const logsTwo = runDockerCompose(envTwoDir, ["logs"], envTwoComposeEnv);
    expect(logsTwo.stderr).not.toContain("address already in use");
  });

  it("cleans up containers", function () {
    if (!isDockerAvailable()) return this.skip?.();

    const resultOne = runDockerCompose(envOneDir, ["down"], envOneComposeEnv);
    expect(resultOne.exitCode).toBe(0);

    const resultTwo = runDockerCompose(envTwoDir, ["down"], envTwoComposeEnv);
    expect(resultTwo.exitCode).toBe(0);
  });
});
