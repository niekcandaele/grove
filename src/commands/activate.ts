import { defineCommand } from "citty";
import { findProjectRoot } from "../config/project.js";
import { getWorktreeByName } from "../services/git.js";
import {
  isInsideZellij,
  deriveSessionName,
  generateGoToTabCommand,
  generateAttachCommand,
} from "../services/zellij.js";

export const activateCommand = defineCommand({
  meta: {
    name: "activate",
    description: "CD into worktree (use: eval \"$(grove activate <name>)\")",
  },
  args: {
    name: {
      type: "positional",
      description: "Name of the environment to activate",
      required: true,
    },
  },
  run({ args }) {
    const envName = args.name as string;

    const projectRoot = findProjectRoot();
    if (!projectRoot) {
      // Output to stderr so eval doesn't try to execute it
      console.error("Error: Not in a git repository");
      console.error("  Run this command from within a git repository");
      process.exit(1);
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
      console.log(`cd "${worktree.path}"`);
    } else {
      // Outside Zellij: attach to session
      const sessionName = deriveSessionName(projectRoot);
      console.log(generateAttachCommand(sessionName));
      console.error(
        `# After attaching, run: eval "$(grove activate ${envName})"`
      );
    }
  },
});
