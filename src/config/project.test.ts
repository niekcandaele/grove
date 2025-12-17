import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadProjectConfig, findProjectRoot } from "./project.js";

describe("loadProjectConfig", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "ai-env-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns defaults when no config file exists", () => {
    const config = loadProjectConfig(tempDir);

    expect(config.baseBranch).toBe("main");
    expect(config.portVarPatterns).toEqual(["*_PORT"]);
    expect(config.portMapping).toEqual({});
    expect(config.portRange).toEqual([30000, 39999]);
  });

  it("loads config from .ai-env.json", () => {
    const projectConfig = {
      baseBranch: "develop",
      worktreeDir: "../custom-worktrees",
      portVarPatterns: ["*_PORT", "*_port"],
      portMapping: {
        HTTP_PORT: "web",
        DB_PORT: "postgres",
      },
    };

    writeFileSync(
      join(tempDir, ".ai-env.json"),
      JSON.stringify(projectConfig)
    );

    const config = loadProjectConfig(tempDir);

    expect(config.baseBranch).toBe("develop");
    expect(config.worktreeDir).toBe("../custom-worktrees");
    expect(config.portVarPatterns).toEqual(["*_PORT", "*_port"]);
    expect(config.portMapping).toEqual({
      HTTP_PORT: "web",
      DB_PORT: "postgres",
    });
  });

  it("merges project config with defaults", () => {
    const projectConfig = {
      baseBranch: "develop",
    };

    writeFileSync(
      join(tempDir, ".ai-env.json"),
      JSON.stringify(projectConfig)
    );

    const config = loadProjectConfig(tempDir);

    expect(config.baseBranch).toBe("develop");
    expect(config.portVarPatterns).toEqual(["*_PORT"]);
    expect(config.portRange).toEqual([30000, 39999]);
  });

  it("generates default worktreeDir from project name", () => {
    const config = loadProjectConfig("/home/user/code/my-project");
    expect(config.worktreeDir).toBe("../my-project-worktrees");
  });
});

describe("findProjectRoot", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "ai-env-root-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("finds .git directory in current folder", () => {
    mkdirSync(join(tempDir, ".git"));
    const root = findProjectRoot(tempDir);
    expect(root).toBe(tempDir);
  });

  it("finds .git directory in parent folder", () => {
    mkdirSync(join(tempDir, ".git"));
    const subDir = join(tempDir, "src", "components");
    mkdirSync(subDir, { recursive: true });

    const root = findProjectRoot(subDir);
    expect(root).toBe(tempDir);
  });

  it("returns null when no .git found", () => {
    const root = findProjectRoot(tempDir);
    expect(root).toBeNull();
  });
});
