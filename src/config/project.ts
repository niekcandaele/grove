import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadGlobalConfig, type GlobalConfig } from "./global.js";

export interface ProjectConfig {
  worktreeDir: string;
  baseBranch: string;
  portVarPatterns: string[];
  portRange: [number, number];
  copyFiles: string[];
}

interface ProjectConfigFile {
  worktreeDir?: string;
  baseBranch?: string;
  portVarPatterns?: string[];
  copyFiles?: string[];
}

function getDefaultWorktreeDir(projectRoot: string): string {
  const projectName = projectRoot.split("/").pop() || "project";
  return `../${projectName}-worktrees`;
}

export function loadProjectConfig(projectRoot: string): ProjectConfig {
  const global = loadGlobalConfig();
  const configPath = join(projectRoot, ".grove.json");

  const defaults: ProjectConfig = {
    worktreeDir: getDefaultWorktreeDir(projectRoot),
    baseBranch: global.defaultBaseBranch,
    portVarPatterns: ["*_PORT"],
    portRange: global.defaultPortRange,
    copyFiles: [".claude/settings.local.json", ".envrc"],
  };

  if (!existsSync(configPath)) {
    return defaults;
  }

  const content = readFileSync(configPath, "utf-8");
  const parsed = JSON.parse(content) as ProjectConfigFile;

  return {
    ...defaults,
    ...parsed,
  };
}

export function findProjectRoot(startDir: string = process.cwd()): string | null {
  let current = startDir;

  while (current !== "/") {
    if (existsSync(join(current, ".git"))) {
      return current;
    }
    current = join(current, "..");
  }

  return null;
}
