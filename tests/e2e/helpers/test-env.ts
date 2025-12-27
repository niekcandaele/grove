/**
 * Test environment setup and isolation for e2e tests.
 * Creates isolated temp directories with proper HOME/XDG isolation.
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

export interface TestEnvironment {
  /** Root temp directory containing all test artifacts */
  rootDir: string;
  /** Git repository path */
  repoDir: string;
  /** Isolated HOME directory */
  homeDir: string;
  /** Where worktrees will be created (sibling to repo) */
  worktreeBaseDir: string;
  /** Environment variables for running grove commands */
  env: Record<string, string>;
  /** Cleanup function - removes all test artifacts */
  cleanup(): void;
}

export interface TestEnvOptions {
  /** Create .grove.json with port configuration */
  withPorts?: boolean;
  /** Custom port variable patterns (default: ["*_PORT"]) */
  portVarPatterns?: string[];
  /** Content for .env.example file */
  envExampleContent?: string;
  /** Custom .grove.json configuration */
  groveConfig?: Record<string, unknown>;
  /** Number of initial commits to create (default: 1) */
  initialCommits?: number;
}

/**
 * Creates an isolated test environment with its own HOME, git repo, and config.
 * Call cleanup() in afterEach/afterAll to remove test artifacts.
 */
export function setupTestEnvironment(options: TestEnvOptions = {}): TestEnvironment {
  const rootDir = mkdtempSync(join(tmpdir(), "grove-e2e-"));
  const repoDir = join(rootDir, "repo");
  const homeDir = join(rootDir, "home");
  const worktreeBaseDir = join(rootDir, "repo-worktrees");

  // Create directory structure
  mkdirSync(repoDir, { recursive: true });
  mkdirSync(homeDir, { recursive: true });
  mkdirSync(join(homeDir, ".config", "grove"), { recursive: true });
  mkdirSync(join(homeDir, ".local", "state", "grove"), { recursive: true });

  // Environment variables for complete isolation
  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    HOME: homeDir,
    XDG_CONFIG_HOME: join(homeDir, ".config"),
    XDG_STATE_HOME: join(homeDir, ".local", "state"),
    // Disable interactive prompts
    CI: "true",
    TERM: "dumb",
    // Ensure git doesn't prompt
    GIT_TERMINAL_PROMPT: "0",
  };

  // Remove Zellij session detection to prevent hanging on zellij commands
  delete (env as Record<string, string | undefined>).ZELLIJ;

  // Initialize git repo with 'main' branch
  execSync("git init -b main --quiet", { cwd: repoDir, env, stdio: "pipe" });
  execSync('git config user.email "test@grove.local"', { cwd: repoDir, env, stdio: "pipe" });
  execSync('git config user.name "Grove Test"', { cwd: repoDir, env, stdio: "pipe" });

  // Create initial commit
  writeFileSync(join(repoDir, "README.md"), "# Test Project\n");
  execSync("git add README.md", { cwd: repoDir, env, stdio: "pipe" });
  execSync('git commit --quiet -m "Initial commit"', { cwd: repoDir, env, stdio: "pipe" });

  // Create additional commits if requested
  const additionalCommits = (options.initialCommits ?? 1) - 1;
  for (let i = 0; i < additionalCommits; i++) {
    writeFileSync(join(repoDir, `file-${i}.txt`), `Content ${i}\n`);
    execSync(`git add file-${i}.txt`, { cwd: repoDir, env, stdio: "pipe" });
    execSync(`git commit --quiet -m "Commit ${i + 2}"`, { cwd: repoDir, env, stdio: "pipe" });
  }

  // Add .grove.json if requested
  if (options.withPorts || options.groveConfig) {
    const config = {
      portVarPatterns: options.portVarPatterns ?? ["*_PORT"],
      ...options.groveConfig,
    };
    writeFileSync(join(repoDir, ".grove.json"), JSON.stringify(config, null, 2));
    execSync("git add .grove.json", { cwd: repoDir, env, stdio: "pipe" });
    execSync('git commit --quiet -m "Add grove config"', { cwd: repoDir, env, stdio: "pipe" });
  }

  // Add .env.example if provided
  if (options.envExampleContent) {
    writeFileSync(join(repoDir, ".env.example"), options.envExampleContent);
    execSync("git add .env.example", { cwd: repoDir, env, stdio: "pipe" });
    execSync('git commit --quiet -m "Add .env.example"', { cwd: repoDir, env, stdio: "pipe" });
  }

  return {
    rootDir,
    repoDir,
    homeDir,
    worktreeBaseDir,
    env,
    cleanup() {
      rmSync(rootDir, { recursive: true, force: true });
    },
  };
}
