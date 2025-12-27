import { defineCommand } from "citty";
import { findProjectRoot } from "../config/project.js";
import {
  getWorktreeByName,
  listWorktrees,
  getMainWorktreePath,
  getLastCommitDate,
} from "../services/git.js";
import {
  isInsideZellij,
  isZellijAvailable,
  deriveSessionName,
  generateGoToTabCommand,
  generateAttachCommand,
} from "../services/zellij.js";
import { isFzfAvailable, runFzfPicker } from "../services/fzf.js";
import { relativeDate } from "../utils/date.js";
import { shellEscape } from "../utils/shell.js";

interface WorktreeWithDate {
  branch: string;
  path: string;
  lastCommit: Date | null;
}

function selectEnvironmentWithFzf(
  environments: WorktreeWithDate[]
): string | null {
  const items = environments.map((env) => {
    const date = env.lastCommit ? relativeDate(env.lastCommit) : "unknown";
    return `${env.branch}  (${date})`;
  });

  const selected = runFzfPicker(items);
  if (!selected) return null;

  // Extract branch name (everything before the first "  (")
  const match = selected.match(/^([^\s]+)/);
  return match ? match[1] : null;
}

function showEnvironmentList(environments: WorktreeWithDate[]): void {
  console.error("");
  console.error("Available environments:");
  console.error("");
  for (const env of environments) {
    const date = env.lastCommit ? relativeDate(env.lastCommit) : "unknown";
    console.error(`  ${env.branch}  (${date})`);
  }
  console.error("");
  console.error("Usage: eval \"$(grove activate <name>)\"");
  console.error("");
  console.error("Tip: Install fzf for fuzzy selection:");
  console.error("  brew install fzf  (macOS)");
  console.error("  apt install fzf   (Debian/Ubuntu)");
}

export const activateCommand = defineCommand({
  meta: {
    name: "activate",
    description: "CD into worktree (use: eval \"$(grove activate <name>)\")",
  },
  args: {
    name: {
      type: "positional",
      description: "Name of the environment to activate",
      required: false,
    },
  },
  run({ args }) {
    const projectRoot = findProjectRoot();
    if (!projectRoot) {
      console.error("Error: Not in a git repository");
      console.error("  Run this command from within a git repository");
      process.exit(1);
    }

    let envName = args.name as string | undefined;

    // If no name provided, use FZF picker or show list
    if (!envName) {
      const worktrees = listWorktrees(projectRoot);
      const mainWorktreePath = getMainWorktreePath(projectRoot);

      const environments: WorktreeWithDate[] = worktrees
        .filter((wt) => wt.path !== mainWorktreePath)
        .map((wt) => ({
          branch: wt.branch || "(detached)",
          path: wt.path,
          lastCommit: getLastCommitDate(wt.path),
        }))
        .sort((a, b) => {
          // Most recent first
          if (!a.lastCommit && !b.lastCommit) return 0;
          if (!a.lastCommit) return 1;
          if (!b.lastCommit) return -1;
          return b.lastCommit.getTime() - a.lastCommit.getTime();
        });

      if (environments.length === 0) {
        console.error("No environments found.");
        console.error("");
        console.error("Create one with:");
        console.error("  grove create <name>");
        process.exit(1);
      }

      if (isFzfAvailable()) {
        const selected = selectEnvironmentWithFzf(environments);
        if (!selected) {
          // User cancelled
          process.exit(0);
        }
        envName = selected;
      } else {
        showEnvironmentList(environments);
        process.exit(1);
      }
    }

    const worktree = getWorktreeByName(envName, projectRoot);
    if (!worktree) {
      console.error(`Error: Environment "${envName}" not found`);
      console.error("");
      console.error("Available environments:");
      console.error("  Run 'grove list' to see all environments");
      console.error("");
      console.error("To create a new environment:");
      console.error(`  grove create ${envName}`);
      process.exit(1);
    }

    // Output shell commands for eval
    if (isInsideZellij()) {
      // Inside Zellij: switch to tab (create if missing), then cd
      console.log(generateGoToTabCommand(envName));
      console.log(`cd ${shellEscape(worktree.path)}`);
    } else if (isZellijAvailable()) {
      // Outside Zellij but zellij is installed: attach to session
      const sessionName = deriveSessionName(projectRoot);
      console.log(generateAttachCommand(sessionName));
      console.error(
        `# After attaching, run: eval "$(grove activate ${envName})"`
      );
    } else {
      // Zellij not available: just cd
      console.log(`cd ${shellEscape(worktree.path)}`);
    }
  },
});
