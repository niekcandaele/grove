import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import yaml from "js-yaml";
import { getOverridesDir } from "../utils/paths.js";
import type { PortMappingEntry } from "../config/project.js";

export interface HardcodedPort {
  service: string;
  ports: string[];
}

export interface HardcodedContainerName {
  service: string;
  containerName: string;
}

export interface EnvVar {
  name: string;
  value: string;
  line: number;
}

/**
 * Parse a .env file into key-value pairs
 */
export function parseEnvFile(content: string): Map<string, string> {
  const vars = new Map<string, string>();

  for (const line of content.split("\n")) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    // Remove surrounding quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    vars.set(key, value);
  }

  return vars;
}

/**
 * Find all port variables in .env content matching patterns
 */
export function scanPortVariables(
  content: string,
  patterns: string[]
): string[] {
  const vars = parseEnvFile(content);
  const portVars: string[] = [];

  for (const key of vars.keys()) {
    for (const pattern of patterns) {
      if (matchPattern(key, pattern)) {
        portVars.push(key);
        break;
      }
    }
  }

  return portVars;
}

/**
 * Match a key against a glob-like pattern (supports * wildcard)
 */
function matchPattern(key: string, pattern: string): boolean {
  // Convert glob pattern to regex
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")  // Escape special regex chars
    .replace(/\*/g, ".*");  // Convert * to .*

  const regex = new RegExp(`^${regexStr}$`, "i");
  return regex.test(key);
}

/**
 * Merge overlay values into base .env content, preserving structure and comments
 */
function mergeEnvContent(baseContent: string, overlay: Map<string, string>): string {
  const lines = baseContent.split("\n");
  const seen = new Set<string>();

  const merged = lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (match) {
      const key = match[1];
      seen.add(key);
      if (overlay.has(key)) {
        const leadingWhitespace = line.match(/^\s*/)?.[0] || "";
        return `${leadingWhitespace}${key}=${overlay.get(key)}`;
      }
    }
    return line;
  });

  // Append variables from overlay not in base
  for (const [key, value] of overlay) {
    if (!seen.has(key)) {
      merged.push(`${key}=${value}`);
    }
  }

  return merged.join("\n");
}

/**
 * Update port values in .env content
 */
export function updateEnvPorts(
  content: string,
  portMap: Record<string, number>
): string {
  const lines = content.split("\n");
  const result: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments - keep as is
    if (!trimmed || trimmed.startsWith("#")) {
      result.push(line);
      continue;
    }

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) {
      result.push(line);
      continue;
    }

    const key = trimmed.slice(0, eqIndex).trim();

    if (key in portMap) {
      // Replace the value, preserving key and any leading whitespace
      const leadingWhitespace = line.match(/^\s*/)?.[0] || "";
      result.push(`${leadingWhitespace}${key}=${portMap[key]}`);
    } else {
      result.push(line);
    }
  }

  return result.join("\n");
}

/**
 * Copy and merge .env files from worktree and main worktree
 * Starts with .env.example as base, overlays main .env values on top
 */
export function copyEnvFile(
  worktreePath: string,
  mainWorktreePath: string
): boolean {
  const envExamplePath = join(worktreePath, ".env.example");
  const envPath = join(worktreePath, ".env");
  const mainEnvPath = join(mainWorktreePath, ".env");

  // Start with .env.example as base (if exists)
  let baseContent = "";
  if (existsSync(envExamplePath)) {
    baseContent = readFileSync(envExamplePath, "utf-8");
  }

  // Overlay main .env values on top
  if (existsSync(mainEnvPath)) {
    const mainContent = readFileSync(mainEnvPath, "utf-8");
    const mainVars = parseEnvFile(mainContent);

    if (baseContent) {
      const merged = mergeEnvContent(baseContent, mainVars);
      writeFileSync(envPath, merged, { mode: 0o600 });
    } else {
      copyFileSync(mainEnvPath, envPath);
    }
    return true;
  }

  // Fallback: just use .env.example if no main .env
  if (baseContent) {
    writeFileSync(envPath, baseContent, { mode: 0o600 });
    return true;
  }

  return false;
}

/**
 * Copy configured files from main worktree to new worktree
 */
export function copyConfiguredFiles(
  worktreePath: string,
  mainWorktreePath: string,
  files: string[]
): string[] {
  const copied: string[] = [];

  for (const file of files) {
    const sourcePath = join(mainWorktreePath, file);
    const destPath = join(worktreePath, file);

    if (!existsSync(sourcePath)) {
      continue;
    }

    const destDir = dirname(destPath);
    mkdirSync(destDir, { recursive: true });

    copyFileSync(sourcePath, destPath);
    copied.push(file);
  }

  return copied;
}

/**
 * Read, update ports, and write .env file
 */
export function configureEnvFile(
  worktreePath: string,
  portMap: Record<string, number>
): void {
  const envPath = join(worktreePath, ".env");

  if (!existsSync(envPath)) {
    // Create empty .env with just ports
    const content = Object.entries(portMap)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");
    writeFileSync(envPath, content + "\n", { mode: 0o600 });
    return;
  }

  const content = readFileSync(envPath, "utf-8");
  const updated = updateEnvPorts(content, portMap);
  writeFileSync(envPath, updated, { mode: 0o600 });
}

/**
 * Get port variables from .env.example or existing .env
 */
export function getPortVariablesFromProject(
  projectRoot: string,
  patterns: string[]
): string[] {
  const envExamplePath = join(projectRoot, ".env.example");
  const envPath = join(projectRoot, ".env");

  let content = "";

  if (existsSync(envExamplePath)) {
    content = readFileSync(envExamplePath, "utf-8");
  } else if (existsSync(envPath)) {
    content = readFileSync(envPath, "utf-8");
  }

  if (!content) {
    return [];
  }

  return scanPortVariables(content, patterns);
}

/**
 * Append a variable to .env file
 */
export function appendToEnvFile(
  envPath: string,
  key: string,
  value: string
): void {
  let content = "";

  if (existsSync(envPath)) {
    content = readFileSync(envPath, "utf-8");
    if (!content.endsWith("\n")) {
      content += "\n";
    }
  }

  content += `${key}=${value}\n`;
  writeFileSync(envPath, content, { mode: 0o600 });
}

/**
 * Get default container port based on variable name patterns
 */
function getDefaultContainerPort(varName: string, hostPort: number): number {
  const upper = varName.toUpperCase();

  if (upper.includes("HTTP") || upper.includes("WEB") || upper.includes("APP")) {
    return 3000;
  }
  if (upper.includes("POSTGRES") || upper.includes("PG") || upper.includes("DB_PORT")) {
    return 5432;
  }
  if (upper.includes("REDIS")) {
    return 6379;
  }
  if (upper.includes("MONGO")) {
    return 27017;
  }
  if (upper.includes("MYSQL")) {
    return 3306;
  }

  return hostPort;
}

/**
 * Generate Docker Compose override YAML content
 */
export function generateDockerOverride(
  portMap: Record<string, number>,
  portMapping: Record<string, string | PortMappingEntry>
): string {
  const services: Record<string, string[]> = {};

  for (const [varName, hostPort] of Object.entries(portMap)) {
    const mapping = portMapping[varName];
    if (!mapping) continue;

    let serviceName: string;
    let containerPort: number;

    if (typeof mapping === "string") {
      serviceName = mapping;
      containerPort = getDefaultContainerPort(varName, hostPort);
    } else {
      serviceName = mapping.service;
      containerPort = mapping.containerPort;
    }

    if (!services[serviceName]) {
      services[serviceName] = [];
    }
    services[serviceName].push(`"${hostPort}:${containerPort}"`);
  }

  if (Object.keys(services).length === 0) {
    return "";
  }

  let yaml = "services:\n";
  for (const [service, ports] of Object.entries(services)) {
    yaml += `  ${service}:\n`;
    yaml += `    ports: !override\n`;
    for (const port of ports) {
      yaml += `      - ${port}\n`;
    }
  }

  return yaml;
}

/**
 * Get project hash for directory naming
 */
export function getProjectHash(projectRoot: string): string {
  return createHash("sha256").update(projectRoot).digest("hex").slice(0, 12);
}

/**
 * Get the override directory path for a project/environment
 */
export function getOverridePath(projectRoot: string, envName: string): string {
  const hash = getProjectHash(projectRoot);
  return join(getOverridesDir(), hash, envName);
}

/**
 * Write Docker Compose override file outside the repo
 */
export function writeDockerOverride(
  projectRoot: string,
  envName: string,
  overrideContent: string
): string {
  const overrideDir = getOverridePath(projectRoot, envName);
  const overridePath = join(overrideDir, "docker-compose.override.yml");

  mkdirSync(overrideDir, { recursive: true });
  writeFileSync(overridePath, overrideContent, { mode: 0o600 });

  return overridePath;
}

/**
 * Set COMPOSE_FILE in .env to point to main compose and override
 */
export function setComposeFilePath(
  worktreePath: string,
  overridePath: string
): void {
  const envPath = join(worktreePath, ".env");
  appendToEnvFile(envPath, "COMPOSE_FILE", `docker-compose.yml:${overridePath}`);
}

/**
 * Check if docker-compose.yml exists in a directory
 */
export function hasDockerCompose(dir: string): boolean {
  return existsSync(join(dir, "docker-compose.yml")) ||
         existsSync(join(dir, "docker-compose.yaml")) ||
         existsSync(join(dir, "compose.yml")) ||
         existsSync(join(dir, "compose.yaml"));
}

/**
 * Remove Docker override directory for an environment
 */
export function removeDockerOverride(projectRoot: string, envName: string): boolean {
  const overrideDir = getOverridePath(projectRoot, envName);

  if (existsSync(overrideDir)) {
    rmSync(overrideDir, { recursive: true, force: true });
    return true;
  }

  return false;
}

/**
 * Get the path to the docker-compose file in a directory
 */
export function getComposeFilePath(dir: string): string | null {
  const candidates = [
    "docker-compose.yml",
    "docker-compose.yaml",
    "compose.yml",
    "compose.yaml",
  ];

  for (const name of candidates) {
    const path = join(dir, name);
    if (existsSync(path)) {
      return path;
    }
  }

  return null;
}

/**
 * Detect hardcoded ports in docker-compose.yml that don't use variable interpolation
 */
export function detectHardcodedComposePorts(composePath: string): HardcodedPort[] {
  try {
    const content = readFileSync(composePath, "utf-8");
    const doc = yaml.load(content) as Record<string, unknown> | null;

    if (!doc || typeof doc !== "object") {
      return [];
    }

    const services = doc.services as Record<string, unknown> | undefined;
    if (!services || typeof services !== "object") {
      return [];
    }

    const results: HardcodedPort[] = [];

    for (const [serviceName, serviceConfig] of Object.entries(services)) {
      if (!serviceConfig || typeof serviceConfig !== "object") {
        continue;
      }

      const ports = (serviceConfig as Record<string, unknown>).ports;
      if (!Array.isArray(ports)) {
        continue;
      }

      const hardcoded: string[] = [];

      for (const port of ports) {
        const portStr = String(port);
        // A port is hardcoded if it doesn't contain ${
        if (!portStr.includes("${")) {
          hardcoded.push(portStr);
        }
      }

      if (hardcoded.length > 0) {
        results.push({ service: serviceName, ports: hardcoded });
      }
    }

    return results;
  } catch {
    // YAML parse error or file read error — return empty to avoid crashing
    return [];
  }
}

/**
 * Detect hardcoded container names in docker-compose.yml
 * These cause conflicts when running multiple environments simultaneously
 */
export function detectHardcodedContainerNames(composePath: string): HardcodedContainerName[] {
  try {
    const content = readFileSync(composePath, "utf-8");
    const doc = yaml.load(content) as Record<string, unknown> | null;

    if (!doc || typeof doc !== "object") {
      return [];
    }

    const services = doc.services as Record<string, unknown> | undefined;
    if (!services || typeof services !== "object") {
      return [];
    }

    const results: HardcodedContainerName[] = [];

    for (const [serviceName, serviceConfig] of Object.entries(services)) {
      if (!serviceConfig || typeof serviceConfig !== "object") {
        continue;
      }

      const containerName = (serviceConfig as Record<string, unknown>).container_name;
      if (typeof containerName !== "string") {
        continue;
      }

      // A container name is hardcoded if it doesn't contain ${
      if (!containerName.includes("${")) {
        results.push({ service: serviceName, containerName });
      }
    }

    return results;
  } catch {
    // YAML parse error or file read error — return empty to avoid crashing
    return [];
  }
}
