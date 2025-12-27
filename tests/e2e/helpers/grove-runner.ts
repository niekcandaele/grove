/**
 * Grove CLI binary execution wrapper for e2e tests.
 * Provides typed interface for running grove commands and capturing output.
 */

import { spawnSync } from "node:child_process";
import type { TestEnvironment } from "./test-env.js";
import { getBinaryPath } from "../setup.js";

// Re-export for convenience
export { getBinaryPath };

export interface RunResult {
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** Combined stdout + stderr (interleaved) */
  combined: string;
  /** Process exit code */
  exitCode: number;
}

export interface GroveRunnerOptions {
  /** Working directory for commands */
  cwd: string;
  /** Environment variables */
  env: Record<string, string>;
  /** Command timeout in milliseconds (default: 30000) */
  timeout?: number;
}

export class GroveRunner {
  private binaryPath: string;
  private options: GroveRunnerOptions;

  constructor(binaryPath: string, options: GroveRunnerOptions) {
    this.binaryPath = binaryPath;
    this.options = options;
  }

  /**
   * Execute a grove command with arguments.
   * Returns structured result with stdout, stderr, and exit code.
   */
  run(args: string[]): RunResult {
    const result = spawnSync(this.binaryPath, args, {
      cwd: this.options.cwd,
      env: this.options.env,
      encoding: "utf-8",
      timeout: this.options.timeout ?? 30000,
    });

    return {
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      combined: `${result.stdout ?? ""}${result.stderr ?? ""}`,
      exitCode: result.status ?? 1,
    };
  }

  /**
   * Execute command and assert success (exit code 0).
   * Throws if command fails.
   */
  runSuccess(args: string[]): RunResult {
    const result = this.run(args);
    if (result.exitCode !== 0) {
      throw new Error(
        `Command failed with exit code ${result.exitCode}: grove ${args.join(" ")}\n` +
          `stdout: ${result.stdout}\n` +
          `stderr: ${result.stderr}`
      );
    }
    return result;
  }

  /**
   * Execute command and assert failure (non-zero exit code).
   * Throws if command succeeds.
   */
  runFailure(args: string[]): RunResult {
    const result = this.run(args);
    if (result.exitCode === 0) {
      throw new Error(
        `Command unexpectedly succeeded: grove ${args.join(" ")}\n` +
          `stdout: ${result.stdout}\n` +
          `stderr: ${result.stderr}`
      );
    }
    return result;
  }

  // Convenience methods for common commands

  create(name: string, options: string[] = []): RunResult {
    return this.run(["create", name, ...options]);
  }

  delete(name: string, options: string[] = []): RunResult {
    return this.run(["delete", name, ...options]);
  }

  deleteCurrent(options: string[] = []): RunResult {
    return this.run(["delete-current", ...options]);
  }

  list(): RunResult {
    return this.run(["list"]);
  }

  status(): RunResult {
    return this.run(["status"]);
  }

  activate(name: string): RunResult {
    return this.run(["activate", name]);
  }
}

/**
 * Create a GroveRunner tied to a test environment.
 */
export function createGroveRunner(testEnv: TestEnvironment): GroveRunner {
  const binaryPath = getBinaryPath();
  return new GroveRunner(binaryPath, {
    cwd: testEnv.repoDir,
    env: testEnv.env,
  });
}
