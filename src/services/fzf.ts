import { spawnSync } from "node:child_process";

export function isFzfAvailable(): boolean {
  const result = spawnSync("which", ["fzf"], { encoding: "utf-8" });
  return result.status === 0;
}

export function runFzfPicker(items: string[]): string | null {
  const input = items.join("\n");

  const result = spawnSync("fzf", ["--ansi", "--no-sort"], {
    input,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "inherit"],
  });

  if (result.status !== 0 || !result.stdout) {
    return null;
  }

  return result.stdout.trim();
}
