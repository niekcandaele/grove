import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

export interface WorktreeInfo {
  path: string;
  branch: string;
  head: string;
  bare: boolean;
}

export type CreateWorktreeResult =
  | { success: true; path: string; branch: string }
  | { success: false; existingWorktreePath: string };

function exec(command: string, cwd: string): string {
  return execSync(command, { cwd, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}

/**
 * Parse git error for "already checked out" message.
 * Returns the existing worktree path if found, null otherwise.
 */
export function parseAlreadyCheckedOutError(stderr: string): string | null {
  // Pattern: fatal: 'branchname' is already checked out at '/path/to/worktree'
  const match = stderr.match(/is already checked out at '([^']+)'/);
  return match ? match[1] : null;
}

/**
 * Prune stale worktree references.
 */
export function pruneWorktrees(cwd: string): void {
  exec("git worktree prune", cwd);
}

export function getMainWorktreePath(cwd: string = process.cwd()): string {
  const output = exec("git worktree list --porcelain", cwd);
  const lines = output.split("\n");

  for (const line of lines) {
    if (line.startsWith("worktree ")) {
      return line.slice("worktree ".length);
    }
  }

  throw new Error("Could not find main worktree");
}

export function branchExists(branchName: string, cwd: string): boolean {
  try {
    exec(`git rev-parse --verify refs/heads/${branchName}`, cwd);
    return true;
  } catch {
    return false;
  }
}

export function createWorktree(
  name: string,
  baseBranch: string,
  worktreeDir: string,
  projectRoot: string
): CreateWorktreeResult {
  const worktreePath = resolve(projectRoot, worktreeDir, name);

  if (existsSync(worktreePath)) {
    throw new Error(`Worktree path already exists: ${worktreePath}`);
  }

  try {
    if (branchExists(name, projectRoot)) {
      // Branch exists, create worktree from existing branch
      exec(`git worktree add "${worktreePath}" "${name}"`, projectRoot);
    } else {
      // Create new branch and worktree
      exec(`git worktree add -b "${name}" "${worktreePath}" "${baseBranch}"`, projectRoot);
    }
  } catch (err) {
    const stderr = err instanceof Error ? err.message : String(err);
    const existingPath = parseAlreadyCheckedOutError(stderr);
    if (existingPath) {
      return { success: false, existingWorktreePath: existingPath };
    }
    throw err;
  }

  return { success: true, path: worktreePath, branch: name };
}

export function listWorktrees(projectRoot: string): WorktreeInfo[] {
  const output = exec("git worktree list --porcelain", projectRoot);
  const worktrees: WorktreeInfo[] = [];
  let current: Partial<WorktreeInfo> = {};

  for (const line of output.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (current.path) {
        worktrees.push(current as WorktreeInfo);
      }
      current = { path: line.slice("worktree ".length), bare: false };
    } else if (line.startsWith("HEAD ")) {
      current.head = line.slice("HEAD ".length);
    } else if (line.startsWith("branch ")) {
      // branch refs/heads/branch-name -> branch-name
      current.branch = line.slice("branch refs/heads/".length);
    } else if (line === "bare") {
      current.bare = true;
    } else if (line === "detached") {
      current.branch = "(detached)";
    }
  }

  if (current.path) {
    worktrees.push(current as WorktreeInfo);
  }

  return worktrees;
}

export function getWorktreeByName(
  name: string,
  projectRoot: string
): WorktreeInfo | null {
  const worktrees = listWorktrees(projectRoot);

  // Match by branch name
  return worktrees.find((wt) => wt.branch === name) || null;
}

export function removeWorktree(
  worktreePath: string,
  deleteBranch: boolean,
  projectRoot: string
): { branchDeleted: boolean } {
  const worktrees = listWorktrees(projectRoot);
  const worktree = worktrees.find((wt) => wt.path === worktreePath);

  if (!worktree) {
    throw new Error(`Worktree not found: ${worktreePath}`);
  }

  const branchName = worktree.branch;

  // Remove worktree
  exec(`git worktree remove "${worktreePath}" --force`, projectRoot);

  // Optionally delete branch
  let branchDeleted = false;
  if (deleteBranch && branchName && branchName !== "(detached)") {
    try {
      exec(`git branch -d "${branchName}"`, projectRoot);
      branchDeleted = true;
    } catch {
      // Branch may have unmerged changes, try force delete
      try {
        exec(`git branch -D "${branchName}"`, projectRoot);
        branchDeleted = true;
      } catch {
        // Couldn't delete branch, that's okay
      }
    }
  }

  return { branchDeleted };
}

export function getCurrentBranch(cwd: string): string {
  return exec("git branch --show-current", cwd);
}

export function getLastCommitDate(worktreePath: string): Date | null {
  try {
    const output = exec("git log -1 --format=%aI", worktreePath);
    return new Date(output);
  } catch {
    return null;
  }
}

export function isGitRepository(path: string): boolean {
  return existsSync(join(path, ".git"));
}
