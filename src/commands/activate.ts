import { defineCommand } from "citty";
import { findProjectRoot } from "../config/project.js";
import { getWorktreeByName } from "../services/git.js";

export const activateCommand = defineCommand({
  meta: {
    name: "activate",
    description: "CD into worktree (use: eval \"$(ai-env activate <name>)\")",
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
      console.error("  Run 'ai-env list' to see all environments");
      console.error("");
      console.error("To create a new environment:");
      console.error(`  ai-env create ${envName}`);
      process.exit(1);
    }

    // Output cd command for shell eval
    // Quote the path to handle spaces
    console.log(`cd "${worktree.path}"`);
  },
});
