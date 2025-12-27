import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineCommand } from "citty";
import { sanitizeName } from "../utils/naming.js";
import { getPortRegistryPath } from "../utils/paths.js";
import { loadProjectConfig, findProjectRoot } from "../config/project.js";
import { createWorktree, getMainWorktreePath, pruneWorktrees, getWorktreeByName } from "../services/git.js";
import {
  copyEnvFile,
  copyConfiguredFiles,
  configureEnvFile,
  getPortVariablesFromProject,
} from "../services/env.js";
import { allocatePorts } from "../services/ports.js";
import { isInsideZellij, generateNewTabCommand } from "../services/zellij.js";

export const createCommand = defineCommand({
  meta: {
    name: "create",
    description: "Create a new environment with git worktree and port allocation",
  },
  args: {
    name: {
      type: "positional",
      description: "Name for the new environment",
      required: true,
    },
    verbose: {
      type: "boolean",
      alias: "V",
      description: "Show detailed output",
      default: false,
    },
  },
  async run({ args }) {
    const rawName = args.name as string;
    const verbose = args.verbose as boolean;

    // Find project root
    const projectRoot = findProjectRoot();
    if (!projectRoot) {
      console.error("Error: Not in a git repository");
      console.error("  Run this command from within a git repository");
      process.exit(1);
    }

    if (verbose) {
      console.log(`[verbose] Project root: ${projectRoot}`);
    }

    // Sanitize name
    let envName: string;
    try {
      envName = sanitizeName(rawName);
    } catch (err) {
      console.error(`Error: Invalid environment name "${rawName}"`);
      console.error("  Names must contain at least one alphanumeric character");
      process.exit(1);
    }

    if (envName !== rawName) {
      console.log(`Using sanitized name: ${envName}`);
    }

    // Load config
    const config = loadProjectConfig(projectRoot);

    if (verbose) {
      console.log(`[verbose] Config:`);
      console.log(`[verbose]   baseBranch: ${config.baseBranch}`);
      console.log(`[verbose]   worktreeDir: ${config.worktreeDir}`);
      console.log(`[verbose]   portRange: ${config.portRange[0]}-${config.portRange[1]}`);
      console.log(`[verbose]   portVarPatterns: ${config.portVarPatterns.join(", ")}`);
      console.log(`[verbose] Port registry: ${getPortRegistryPath()}`);
    }

    // Check if environment already exists in this project
    const existingWorktree = getWorktreeByName(envName, projectRoot);
    if (existingWorktree) {
      console.error(`Environment "${envName}" already exists. Activating...`);
      console.log(`cd "${existingWorktree.path}"`);
      process.exit(0);
    }

    const mainWorktreePath = getMainWorktreePath(projectRoot);

    // Create worktree
    console.log(`Creating worktree...`);
    let worktreePath: string;
    try {
      let result = createWorktree(
        envName,
        config.baseBranch,
        config.worktreeDir,
        projectRoot
      );

      // Handle "already checked out" scenario
      if (!result.success) {
        const existingPath = result.existingWorktreePath;
        const expectedWorktreeBase = resolve(projectRoot, config.worktreeDir);

        if (existsSync(existingPath)) {
          // Path exists - check if it's in the same project
          if (existingPath.startsWith(expectedWorktreeBase)) {
            // Same project - auto-activate
            console.error(`Environment "${envName}" already exists. Activating...`);
            console.log(`cd "${existingPath}"`);
            process.exit(0);
          } else {
            // Different project - inform user
            console.error(`Branch "${envName}" is already checked out in a different project:`);
            console.error(`  ${existingPath}`);
            console.error("");
            console.error("To work there:");
            console.error(`  cd ${existingPath}`);
            process.exit(1);
          }
        } else {
          // Path doesn't exist - prune stale reference and retry
          console.error("Cleaning up stale worktree reference...");
          pruneWorktrees(projectRoot);
          result = createWorktree(
            envName,
            config.baseBranch,
            config.worktreeDir,
            projectRoot
          );
          if (!result.success) {
            console.error(`Error: Branch "${envName}" is still checked out elsewhere`);
            process.exit(1);
          }
        }
      }

      worktreePath = result.path;
      console.log(`  Branch: ${result.branch}`);
      console.log(`  Path: ${worktreePath}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Error creating worktree: ${message}`);
      process.exit(1);
    }

    if (verbose) {
      console.log(`[verbose] Main worktree: ${mainWorktreePath}`);
    }

    // Copy .env file
    const envCopied = copyEnvFile(worktreePath, mainWorktreePath);
    if (envCopied) {
      console.log(`  Copied .env file`);
      if (verbose) {
        console.log(`[verbose]   Source: ${mainWorktreePath}/.env.example or .env`);
        console.log(`[verbose]   Destination: ${worktreePath}/.env`);
      }
    }

    // Copy configured files
    if (config.copyFiles.length > 0) {
      const copiedFiles = copyConfiguredFiles(worktreePath, mainWorktreePath, config.copyFiles);
      if (copiedFiles.length > 0) {
        console.log(`  Copied ${copiedFiles.length} configured file(s)`);
        if (verbose) {
          for (const file of copiedFiles) {
            console.log(`[verbose]   ${file}`);
          }
        }
      }
    }

    // Scan for port variables
    const portVars = getPortVariablesFromProject(projectRoot, config.portVarPatterns);

    if (verbose && portVars.length > 0) {
      console.log(`[verbose] Found port variables: ${portVars.join(", ")}`);
    }

    let allocatedPorts: Record<string, number> = {};

    if (portVars.length > 0) {
      // Allocate ports
      console.log(`Allocating ports...`);
      allocatedPorts = allocatePorts(
        projectRoot,
        envName,
        portVars,
        config.portRange
      );

      // Configure .env with allocated ports
      configureEnvFile(worktreePath, allocatedPorts);

      console.log(`  Ports allocated:`);
      for (const [varName, port] of Object.entries(allocatedPorts)) {
        console.log(`    ${varName}=${port}`);
      }
    } else {
      console.log(`  No port variables found`);
    }

    // Zellij integration - create tab when inside session
    if (isInsideZellij()) {
      console.log("Creating Zellij tab...");
      try {
        execSync(generateNewTabCommand(envName, worktreePath), {
          stdio: "inherit",
        });
        console.log(`  Tab "${envName}" created`);
      } catch {
        console.warn("  Warning: Could not create Zellij tab");
      }
    }

    // Output activation command
    console.log("");
    console.log(`Environment "${envName}" created successfully!`);
    console.log("");
    console.log("To activate:");
    console.log(`  eval "$(grove activate ${envName})"`);
  },
});
