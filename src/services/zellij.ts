import { execSync } from "node:child_process";
import { basename } from "node:path";
import { shellEscape } from "../utils/shell.js";

/**
 * Check if we're running inside a Zellij session
 */
export function isInsideZellij(): boolean {
  return process.env.ZELLIJ !== undefined;
}

/**
 * Check if zellij command is available on the system
 */
export function isZellijAvailable(): boolean {
  try {
    execSync("which zellij", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Derive a session name from the project path.
 * Uses the directory basename.
 */
export function deriveSessionName(projectRoot: string): string {
  return basename(projectRoot);
}

/**
 * Generate shell command to create a new tab with given name and cwd.
 * Only works when called from inside a Zellij session.
 */
export function generateNewTabCommand(tabName: string, cwd: string): string {
  return `zellij action new-tab --name ${shellEscape(tabName)} --cwd ${shellEscape(cwd)}`;
}

/**
 * Generate shell command to switch to a tab (creating if necessary).
 * Only works when called from inside a Zellij session.
 */
export function generateGoToTabCommand(tabName: string): string {
  return `zellij action go-to-tab-name ${shellEscape(tabName)} --create`;
}

/**
 * Generate shell command to attach to or create a session.
 * Used when running outside Zellij.
 */
export function generateAttachCommand(sessionName: string): string {
  return `zellij attach ${shellEscape(sessionName)} --create`;
}
