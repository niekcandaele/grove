import { defineCommand } from "citty";
import { basename, join } from "node:path";
import { existsSync } from "node:fs";
import { findProjectRoot, loadProjectConfig } from "../config/project.js";
import { getPortRegistryPath } from "../utils/paths.js";
import { listWorktrees, getMainWorktreePath } from "../services/git.js";
import { readRegistry, getAllocationsForProject } from "../services/ports.js";

export const statusCommand = defineCommand({
  meta: {
    name: "status",
    description: "Show project status and port usage",
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

    const config = loadProjectConfig(projectRoot);
    const projectName = basename(projectRoot);
    const configPath = join(projectRoot, ".grove.json");

    if (verbose) {
      console.log(`[verbose] Project root: ${projectRoot}`);
      console.log(`[verbose] Config file: ${existsSync(configPath) ? configPath : "(using defaults)"}`);
      console.log(`[verbose] Port registry: ${getPortRegistryPath()}`);
    }

    console.log("");
    console.log(`Project: ${projectName}`);
    console.log(`Base branch: ${config.baseBranch}`);
    console.log(`Worktree directory: ${config.worktreeDir}`);

    if (verbose) {
      console.log(`[verbose] Port range: ${config.portRange[0]}-${config.portRange[1]}`);
      console.log(`[verbose] Port var patterns: ${config.portVarPatterns.join(", ")}`);
    }

    console.log("");

    // Environment count
    const worktrees = listWorktrees(projectRoot);
    const mainWorktreePath = getMainWorktreePath(projectRoot);
    const environments = worktrees.filter((wt) => wt.path !== mainWorktreePath);

    console.log(`Environments: ${environments.length} active`);

    // Project port usage
    const projectAllocations = getAllocationsForProject(projectRoot);
    if (projectAllocations.length > 0) {
      const ports = projectAllocations.map((a) => a.port).sort((a, b) => a - b);
      const minPort = ports[0];
      const maxPort = ports[ports.length - 1];
      console.log(
        `Ports in use: ${minPort}-${maxPort} (${ports.length} ports)`
      );

      if (verbose) {
        console.log(`[verbose] Port allocations:`);
        for (const alloc of projectAllocations) {
          console.log(`[verbose]   ${alloc.envName}: ${alloc.varName}=${alloc.port}`);
        }
      }
    } else {
      console.log("Ports in use: none");
    }

    console.log("");

    // Global registry stats
    const registry = readRegistry();
    const totalAllocations = Object.keys(registry.allocations).length;

    // Count unique projects
    const uniqueProjects = new Set(
      Object.values(registry.allocations).map((a) => a.project)
    );

    console.log(
      `Global registry: ${totalAllocations} ports in use across ${uniqueProjects.size} projects`
    );

    if (verbose && uniqueProjects.size > 1) {
      console.log(`[verbose] Other projects with allocations:`);
      for (const project of uniqueProjects) {
        if (project !== projectRoot) {
          const count = Object.values(registry.allocations).filter(
            (a) => a.project === project
          ).length;
          console.log(`[verbose]   ${basename(project)}: ${count} ports`);
        }
      }
    }

    console.log("");
  },
});
