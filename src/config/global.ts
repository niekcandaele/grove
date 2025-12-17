import { readFileSync, existsSync } from "node:fs";
import { getConfigPath } from "../utils/paths.js";

export interface GlobalConfig {
  defaultPortRange: [number, number];
  defaultBaseBranch: string;
}

const DEFAULT_CONFIG: GlobalConfig = {
  defaultPortRange: [30000, 39999],
  defaultBaseBranch: "main",
};

export function loadGlobalConfig(): GlobalConfig {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    return DEFAULT_CONFIG;
  }

  const content = readFileSync(configPath, "utf-8");
  const parsed = JSON.parse(content) as Partial<GlobalConfig>;

  return {
    ...DEFAULT_CONFIG,
    ...parsed,
  };
}
