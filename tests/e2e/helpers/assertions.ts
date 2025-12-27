/**
 * Custom assertion helpers for e2e tests.
 * Mirrors the bash helpers from lib/helpers.sh
 */

import { existsSync, readFileSync } from "node:fs";
import { expect } from "vitest";
import type { RunResult } from "./grove-runner.js";

/**
 * Escape special regex characters in a string.
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Assert that a command result has the expected exit code.
 */
export function assertExitCode(result: RunResult, expected: number): void {
  expect(result.exitCode, `Expected exit code ${expected}, got ${result.exitCode}`).toBe(expected);
}

/**
 * Assert that command output contains a pattern.
 * Checks combined stdout + stderr.
 */
export function assertOutputContains(result: RunResult, pattern: string | RegExp): void {
  if (typeof pattern === "string") {
    expect(
      result.combined,
      `Output should contain "${pattern}"\nActual output: ${result.combined}`
    ).toContain(pattern);
  } else {
    expect(
      result.combined,
      `Output should match ${pattern}\nActual output: ${result.combined}`
    ).toMatch(pattern);
  }
}

/**
 * Assert that command output does NOT contain a pattern.
 */
export function assertOutputNotContains(result: RunResult, pattern: string | RegExp): void {
  if (typeof pattern === "string") {
    expect(
      result.combined,
      `Output should not contain "${pattern}"\nActual output: ${result.combined}`
    ).not.toContain(pattern);
  } else {
    expect(
      result.combined,
      `Output should not match ${pattern}\nActual output: ${result.combined}`
    ).not.toMatch(pattern);
  }
}

/**
 * Assert that a file exists at the given path.
 */
export function assertFileExists(path: string): void {
  expect(existsSync(path), `File should exist: ${path}`).toBe(true);
}

/**
 * Assert that a file does NOT exist at the given path.
 */
export function assertFileNotExists(path: string): void {
  expect(existsSync(path), `File should not exist: ${path}`).toBe(false);
}

/**
 * Assert that a directory exists at the given path.
 */
export function assertDirExists(path: string): void {
  expect(existsSync(path), `Directory should exist: ${path}`).toBe(true);
}

/**
 * Assert that a directory does NOT exist at the given path.
 */
export function assertDirNotExists(path: string): void {
  expect(existsSync(path), `Directory should not exist: ${path}`).toBe(false);
}

/**
 * Assert that a file contains a pattern.
 */
export function assertFileContains(path: string, pattern: string | RegExp): void {
  expect(existsSync(path), `File should exist: ${path}`).toBe(true);
  const content = readFileSync(path, "utf-8");

  if (typeof pattern === "string") {
    expect(content, `File ${path} should contain "${pattern}"`).toContain(pattern);
  } else {
    expect(content, `File ${path} should match ${pattern}`).toMatch(pattern);
  }
}

/**
 * Assert that a file does NOT contain a pattern.
 */
export function assertFileNotContains(path: string, pattern: string | RegExp): void {
  if (!existsSync(path)) {
    return; // File doesn't exist, so it can't contain the pattern
  }
  const content = readFileSync(path, "utf-8");

  if (typeof pattern === "string") {
    expect(content, `File ${path} should not contain "${pattern}"`).not.toContain(pattern);
  } else {
    expect(content, `File ${path} should not match ${pattern}`).not.toMatch(pattern);
  }
}

/**
 * Assert that an .env file has a specific variable set to a value.
 * Handles both quoted and unquoted values.
 */
export function assertEnvFileHasVar(
  envPath: string,
  varName: string,
  expectedValue: string | number
): void {
  expect(existsSync(envPath), `Env file should exist: ${envPath}`).toBe(true);
  const content = readFileSync(envPath, "utf-8");

  // Match VAR=value, VAR="value", or VAR='value'
  const pattern = new RegExp(
    `^${escapeRegExp(varName)}=["']?${escapeRegExp(String(expectedValue))}["']?$`,
    "m"
  );
  expect(
    content,
    `Env file ${envPath} should have ${varName}=${expectedValue}\nActual content:\n${content}`
  ).toMatch(pattern);
}

/**
 * Get the value of an env variable from a file.
 * Returns undefined if not found.
 */
export function getEnvVar(envPath: string, varName: string): string | undefined {
  if (!existsSync(envPath)) {
    return undefined;
  }
  const content = readFileSync(envPath, "utf-8");
  const match = content.match(
    new RegExp(`^${escapeRegExp(varName)}=["']?(.+?)["']?$`, "m")
  );
  return match?.[1];
}

// Convenience object for all assertions
export const assertions = {
  exitCode: assertExitCode,
  outputContains: assertOutputContains,
  outputNotContains: assertOutputNotContains,
  fileExists: assertFileExists,
  fileNotExists: assertFileNotExists,
  dirExists: assertDirExists,
  dirNotExists: assertDirNotExists,
  fileContains: assertFileContains,
  fileNotContains: assertFileNotContains,
  envFileHasVar: assertEnvFileHasVar,
};
