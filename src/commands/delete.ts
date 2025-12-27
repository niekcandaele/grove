import { defineCommand } from "citty";
import { findProjectRoot } from "../config/project.js";
import { getPortRegistryPath, getOverridesDir } from "../utils/paths.js";
import { getWorktreeByName, removeWorktree } from "../services/git.js";
import { releasePorts, getPortsForEnvironment } from "../services/ports.js";
import { removeDockerOverride, getOverridePath } from "../services/env.js";
import { isInsideZellij, closeTabByName } from "../services/zellij.js";
import { confirm } from "../utils/prompt.js";

export const deleteCommand = defineCommand({
  meta: {
    name: "delete",
    description: "Delete an environment and release its ports",
  },
  args: {
    name: {
      type: "positional",
      description: "Name of the environment to delete",
      required: true,
    },
    force: {
      type: "boolean",
      description: "Skip confirmation prompt",
      default: false,
    },
    "delete-branch": {
      type: "boolean",
      description: "Also delete the git branch",
      default: false,
    },
    verbose: {
      type: "boolean",
      alias: "V",
      description: "Show detailed output",
      default: false,
    },
  },
  async run({ args }) {
    const envName = args.name as string;
    const force = args.force as boolean;
    const deleteBranch = args["delete-branch"] as boolean;
    const verbose = args.verbose as boolean;

    const projectRoot = findProjectRoot();
    if (!projectRoot) {
      console.error("Error: Not in a git repository");
      console.error("  Run this command from within a git repository");
      process.exit(1);
    }

    if (verbose) {
      console.log(`[verbose] Project root: ${projectRoot}`);
      console.log(`[verbose] Port registry: ${getPortRegistryPath()}`);
      console.log(`[verbose] Overrides dir: ${getOverridesDir()}`);
    }

    // Find the worktree
    const worktree = getWorktreeByName(envName, projectRoot);
    if (!worktree) {
      console.error(`Error: Environment "${envName}" not found`);
      console.error("");
      console.error("Run 'grove list' to see available environments");
      process.exit(1);
    }

    if (verbose) {
      console.log(`[verbose] Found worktree:`);
      console.log(`[verbose]   Path: ${worktree.path}`);
      console.log(`[verbose]   Branch: ${worktree.branch}`);
      console.log(`[verbose]   HEAD: ${worktree.head}`);
    }

    // Show what will be deleted
    const ports = getPortsForEnvironment(projectRoot, envName);
    const portCount = Object.keys(ports).length;

    console.log("");
    console.log(`Environment: ${envName}`);
    console.log(`  Path: ${worktree.path}`);
    console.log(`  Branch: ${worktree.branch}`);
    if (portCount > 0) {
      console.log(`  Ports: ${portCount} allocated`);
      if (verbose) {
        for (const [varName, port] of Object.entries(ports)) {
          console.log(`[verbose]     ${varName}=${port}`);
        }
      }
    }
    console.log("");

    // Confirm deletion
    if (!force) {
      const deleteWhat = deleteBranch
        ? "Delete worktree and branch?"
        : "Delete worktree? (branch will be kept)";
      const confirmed = await confirm(deleteWhat);
      if (!confirmed) {
        console.log("Cancelled");
        return;
      }
    }

    // Remove worktree
    console.log("Removing worktree...");
    if (verbose) {
      console.log(`[verbose] Running: git worktree remove "${worktree.path}" --force`);
    }
    try {
      const result = removeWorktree(worktree.path, deleteBranch, projectRoot);
      if (result.branchDeleted) {
        console.log(`  Deleted branch: ${worktree.branch}`);
        if (verbose) {
          console.log(`[verbose] Ran: git branch -D "${worktree.branch}"`);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Error removing worktree: ${message}`);
      process.exit(1);
    }

    // Release ports
    if (verbose) {
      console.log(`[verbose] Releasing ports from registry...`);
    }
    const releasedCount = releasePorts(projectRoot, envName);
    if (releasedCount > 0) {
      console.log(`  Released ${releasedCount} port(s)`);
    }

    // Remove Docker override if it exists
    const overridePath = getOverridePath(projectRoot, envName);
    if (verbose) {
      console.log(`[verbose] Checking for Docker override at: ${overridePath}`);
    }
    const overrideRemoved = removeDockerOverride(projectRoot, envName);
    if (overrideRemoved) {
      console.log(`  Removed Docker override`);
    }

    // Close Zellij tab if inside Zellij session
    if (isInsideZellij()) {
      if (verbose) {
        console.log(`[verbose] Closing Zellij tab for environment...`);
      }
      const tabClosed = closeTabByName(envName);
      if (tabClosed) {
        console.log(`  Closed Zellij tab`);
      } else if (verbose) {
        console.log(`[verbose] No Zellij tab found for "${envName}"`);
      }
    }

    console.log("");
    console.log(`Environment "${envName}" deleted`);
  },
});
