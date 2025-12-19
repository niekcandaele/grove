import { createInterface } from "node:readline";
import { isatty } from "node:tty";

/**
 * Prompt user for yes/no confirmation.
 * Returns true if user answers 'y' or 'Y', false otherwise.
 * In non-TTY environments, returns false.
 */
export async function confirm(message: string): Promise<boolean> {
  // In non-TTY environments (CI, piped input), don't hang waiting for input
  if (!isatty(0)) {
    return false;
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y");
    });
  });
}

/**
 * Check if running in an interactive terminal.
 */
export function isInteractive(): boolean {
  return isatty(0);
}
