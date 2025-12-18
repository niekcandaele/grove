import { basename } from "node:path";

/**
 * Check if we're running inside a Zellij session
 */
export function isInsideZellij(): boolean {
  return process.env.ZELLIJ !== undefined;
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
  return `zellij action new-tab --name "${tabName}" --cwd "${cwd}"`;
}

/**
 * Generate shell command to switch to a tab (creating if necessary).
 * Only works when called from inside a Zellij session.
 */
export function generateGoToTabCommand(tabName: string): string {
  return `zellij action go-to-tab-name "${tabName}" --create`;
}

/**
 * Generate shell command to attach to or create a session.
 * Used when running outside Zellij.
 */
export function generateAttachCommand(sessionName: string): string {
  return `zellij attach "${sessionName}" --create`;
}
