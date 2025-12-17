import { defineCommand } from "citty";
import { findProjectRoot } from "../config/project.js";
import { getPortRegistryPath } from "../utils/paths.js";
import { listWorktrees, getMainWorktreePath } from "../services/git.js";
import { getPortsForEnvironment } from "../services/ports.js";

export const listCommand = defineCommand({
  meta: {
    name: "list",
    description: "List all environments for the current project",
  },
  args: {
    verbose: {
      type: "boolean",
      alias: "V",
      description: "Show detailed output",
      default: false,
    },
  },
  run({ args }) {
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
    }

    const worktrees = listWorktrees(projectRoot);
    const mainWorktreePath = getMainWorktreePath(projectRoot);

    if (verbose) {
      console.log(`[verbose] Main worktree: ${mainWorktreePath}`);
      console.log(`[verbose] Total worktrees found: ${worktrees.length}`);
    }

    // Filter out the main worktree - only show environments
    const environments = worktrees.filter((wt) => wt.path !== mainWorktreePath);

    if (environments.length === 0) {
      console.log("No environments found.");
      console.log("");
      console.log("Create one with:");
      console.log("  grove create <name>");
      return;
    }

    console.log("");
    console.log(`Environments (${environments.length}):`);
    console.log("");

    // Calculate column widths
    const nameWidth = Math.max(
      6,
      ...environments.map((e) => (e.branch?.length || 10))
    );
    const pathWidth = Math.max(4, ...environments.map((e) => e.path.length));

    // Print header
    console.log(
      `  ${"NAME".padEnd(nameWidth)}  ${"PATH".padEnd(pathWidth)}  PORTS`
    );
    console.log(
      `  ${"─".repeat(nameWidth)}  ${"─".repeat(pathWidth)}  ${"─".repeat(20)}`
    );

    // Print each environment
    for (const env of environments) {
      const name = (env.branch || "(detached)").padEnd(nameWidth);
      const path = env.path.padEnd(pathWidth);

      // Get ports for this environment
      const ports = getPortsForEnvironment(projectRoot, env.branch || "");
      const portStr = Object.entries(ports)
        .map(([varName, port]) => {
          // Shorten variable name: HTTP_PORT -> HTTP
          const shortName = varName.replace(/_PORT$/i, "");
          return `${shortName}:${port}`;
        })
        .join(" ");

      console.log(`  ${name}  ${path}  ${portStr || "-"}`);

      if (verbose) {
        console.log(`[verbose]   HEAD: ${env.head}`);
      }
    }

    console.log("");
  },
});
