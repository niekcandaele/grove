/**
 * Vitest global setup for e2e tests.
 * Validates that the grove binary exists before running tests.
 */

import { existsSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { platform, arch } from "node:os";

export default async function globalSetup(): Promise<void> {
  const binaryPath = getBinaryPath();

  console.log(`\n  Grove binary: ${binaryPath}`);

  // Ensure binary is executable (no-op on Windows)
  if (platform() !== "win32") {
    try {
      chmodSync(binaryPath, 0o755);
    } catch {
      // Ignore chmod errors (might already be executable)
    }
  }

  // Store in environment for tests to access
  process.env.GROVE_BIN = binaryPath;
}

export function getBinaryPath(): string {
  // Check GROVE_BIN environment variable first
  if (process.env.GROVE_BIN) {
    if (!existsSync(process.env.GROVE_BIN)) {
      throw new Error(`GROVE_BIN set but file not found: ${process.env.GROVE_BIN}`);
    }
    return process.env.GROVE_BIN;
  }

  // Auto-detect based on platform
  const os = platform();
  const architecture = arch();

  const archMap: Record<string, string> = {
    x64: "x64",
    arm64: "arm64",
  };

  const osName = os === "darwin" ? "darwin" : os === "win32" ? "windows" : "linux";
  const archName = archMap[architecture] ?? architecture;

  const binaryName =
    osName === "windows" ? `grove-${osName}-${archName}.exe` : `grove-${osName}-${archName}`;

  // Look in dist/ relative to project root
  const projectRoot = join(import.meta.dirname, "../..");
  const distPath = join(projectRoot, "dist", binaryName);

  if (!existsSync(distPath)) {
    throw new Error(
      `Grove binary not found at ${distPath}.\n` +
        `Either:\n` +
        `  1. Set GROVE_BIN environment variable to the binary path\n` +
        `  2. Build the binary with: bun run build:binary\n`
    );
  }

  return distPath;
}
