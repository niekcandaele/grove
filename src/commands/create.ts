import { defineCommand } from "citty";
import { sanitizeName } from "../utils/naming.js";
import { getPortRegistryPath } from "../utils/paths.js";
import { loadProjectConfig, findProjectRoot } from "../config/project.js";
import { createWorktree, getMainWorktreePath } from "../services/git.js";
import {
  copyEnvFile,
  configureEnvFile,
  getPortVariablesFromProject,
  hasDockerCompose,
  generateDockerOverride,
  writeDockerOverride,
  setComposeFilePath,
} from "../services/env.js";
import { allocatePorts } from "../services/ports.js";

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

    // Create worktree
    console.log(`Creating worktree...`);
    let worktreePath: string;
    try {
      const result = createWorktree(
        envName,
        config.baseBranch,
        config.worktreeDir,
        projectRoot
      );
      worktreePath = result.path;
      console.log(`  Branch: ${result.branch}`);
      console.log(`  Path: ${worktreePath}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Error creating worktree: ${message}`);
      process.exit(1);
    }

    // Get main worktree path for .env copying
    const mainWorktreePath = getMainWorktreePath(projectRoot);

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

    // Output activation command
    console.log("");
    console.log(`Environment "${envName}" created successfully!`);
    console.log("");
    console.log("To activate:");
    console.log(`  eval "$(ai-env activate ${envName})"`);
  },
});
