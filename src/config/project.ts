import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadGlobalConfig, type GlobalConfig } from "./global.js";

export interface PortMappingEntry {
  service: string;
  containerPort: number;
}

export interface ProjectConfig {
  worktreeDir: string;
  baseBranch: string;
  portVarPatterns: string[];
  portMapping: Record<string, string | PortMappingEntry>;
  portRange: [number, number];
}

interface ProjectConfigFile {
  worktreeDir?: string;
  baseBranch?: string;
  portVarPatterns?: string[];
  portMapping?: Record<string, string | PortMappingEntry>;
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
    portMapping: {},
    portRange: global.defaultPortRange,
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
