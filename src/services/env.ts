import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

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
        let value = overlay.get(key)!;
        // Re-quote if value contains spaces or special chars
        if (/[\s#]/.test(value)) {
          value = `"${value}"`;
        }
        return `${leadingWhitespace}${key}=${value}`;
      }
    }
    return line;
  });

  // Append variables from overlay not in base
  for (const [key, value] of overlay) {
    if (!seen.has(key)) {
      // Re-quote if value contains spaces or special chars
      const quotedValue = /[\s#]/.test(value) ? `"${value}"` : value;
      merged.push(`${key}=${quotedValue}`);
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
