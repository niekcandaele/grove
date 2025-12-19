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
  configureEnvFile,
  getPortVariablesFromProject,
  hasDockerCompose,
  generateDockerOverride,
  writeDockerOverride,
  setComposeFilePath,
  getComposeFilePath,
  detectHardcodedComposePorts,
  type HardcodedPort,
} from "../services/env.js";
import { allocatePorts } from "../services/ports.js";
import { isInsideZellij, generateNewTabCommand } from "../services/zellij.js";
import { confirm, isInteractive } from "../utils/prompt.js";

function printHardcodedPortsWarning(hardcoded: HardcodedPort[], projectRoot: string): void {
  console.log("");
  console.log("⚠️  Warning: Found hardcoded ports in docker-compose.yml");
  console.log("");
  console.log("These services have ports that won't be managed by grove:");
  for (const { service, ports } of hardcoded) {
    console.log(`  - ${service}: ${ports.join(", ")}`);
  }
  console.log("");
  console.log("To fix this, add port variables to .env.example and update docker-compose.yml.");
  console.log("");
  console.log("Copy this prompt to an AI assistant to fix it automatically:");
  console.log("");
  console.log("─".repeat(60));
  console.log(`Update this project to use environment variables for Docker Compose ports.

Hardcoded ports found:`);
  for (const { service, ports } of hardcoded) {
    console.log(`- Service "${service}": ${ports.join(", ")}`);
  }
  console.log(`
For each hardcoded port:
1. Add a variable to .env.example (e.g., WEB_PORT=3000)
2. Update docker-compose.yml to use the variable: \${WEB_PORT:-3000}:3000
3. Add portMapping to .grove.json for grove's Docker integration

Project root: ${projectRoot}`);
  console.log("─".repeat(60));
}

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
    force: {
      type: "boolean",
      alias: "f",
      description: "Skip confirmation prompt for hardcoded ports",
      default: false,
    },
  },
  async run({ args }) {
    const rawName = args.name as string;
    const verbose = args.verbose as boolean;
    const force = args.force as boolean;

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

    // Check for hardcoded ports BEFORE creating worktree
    const mainWorktreePath = getMainWorktreePath(projectRoot);
    const hasComposeInMain = hasDockerCompose(mainWorktreePath);

    if (hasComposeInMain && !force) {
      const composePath = getComposeFilePath(mainWorktreePath);
      if (composePath) {
        const hardcodedPorts = detectHardcodedComposePorts(composePath);
        if (hardcodedPorts.length > 0) {
          printHardcodedPortsWarning(hardcodedPorts, projectRoot);

          if (!isInteractive()) {
            console.log("");
            console.log("Run with --force to skip this prompt in non-interactive mode.");
            process.exit(1);
          }

          const confirmed = await confirm("Continue creating worktree?");
          if (!confirmed) {
            console.log("Cancelled");
            process.exit(0);
          }
          console.log("");
        }
      }
    }

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

    // Handle Docker Compose override if portMapping is configured
    const hasPortMapping = Object.keys(config.portMapping).length > 0;
    const hasCompose = hasDockerCompose(worktreePath);

    if (verbose) {
      console.log(`[verbose] Docker Compose: ${hasCompose ? "found" : "not found"}`);
      console.log(`[verbose] Port mapping configured: ${hasPortMapping}`);
    }

    if (hasPortMapping && hasCompose && Object.keys(allocatedPorts).length > 0) {
      console.log(`Configuring Docker Compose...`);

      const overrideContent = generateDockerOverride(allocatedPorts, config.portMapping);

      if (overrideContent) {
        const overridePath = writeDockerOverride(projectRoot, envName, overrideContent);
        setComposeFilePath(worktreePath, overridePath);
        console.log(`  Override: ${overridePath}`);
        console.log(`  COMPOSE_FILE set in .env`);
      }
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
