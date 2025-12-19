import { defineCommand, runMain } from "citty";
import { createCommand } from "./commands/create.js";
import { activateCommand } from "./commands/activate.js";
import { listCommand } from "./commands/list.js";
import { deleteCommand } from "./commands/delete.js";
import { statusCommand } from "./commands/status.js";

declare const GROVE_VERSION: string | undefined;
const version = typeof GROVE_VERSION !== "undefined" ? GROVE_VERSION : "dev";

const main = defineCommand({
  meta: {
    name: "grove",
    version,
    description:
      "CLI tool for managing git worktrees with automatic port allocation",
  },
  subCommands: {
    create: createCommand,
    activate: activateCommand,
    list: listCommand,
    delete: deleteCommand,
    status: statusCommand,
  },
});

runMain(main);
