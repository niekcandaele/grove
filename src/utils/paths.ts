import { homedir } from "node:os";
import { join } from "node:path";

const APP_NAME = "grove";

export function getConfigDir(): string {
  const xdgConfig = process.env.XDG_CONFIG_HOME;
  const base = xdgConfig || join(homedir(), ".config");
  return join(base, APP_NAME);
}

export function getStateDir(): string {
  const xdgState = process.env.XDG_STATE_HOME;
  const base = xdgState || join(homedir(), ".local", "state");
  return join(base, APP_NAME);
}

export function getConfigPath(): string {
  return join(getConfigDir(), "config.json");
}

export function getPortRegistryPath(): string {
  return join(getStateDir(), "ports.json");
}

export function getOverridesDir(): string {
  return join(getStateDir(), "overrides");
}
