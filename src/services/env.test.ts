import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
  mkdirSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  parseEnvFile,
  scanPortVariables,
  updateEnvPorts,
  copyEnvFile,
  configureEnvFile,
  getPortVariablesFromProject,
  appendToEnvFile,
} from "./env.js";

// Pure function tests

describe("parseEnvFile", () => {
  it("parses basic key=value pairs", () => {
    const content = "FOO=bar\nBAZ=qux";
    const result = parseEnvFile(content);

    expect(result.get("FOO")).toBe("bar");
    expect(result.get("BAZ")).toBe("qux");
  });

  it("handles quoted values with double quotes", () => {
    const content = 'MESSAGE="hello world"';
    const result = parseEnvFile(content);

    expect(result.get("MESSAGE")).toBe("hello world");
  });

  it("handles quoted values with single quotes", () => {
    const content = "MESSAGE='hello world'";
    const result = parseEnvFile(content);

    expect(result.get("MESSAGE")).toBe("hello world");
  });

  it("skips comments", () => {
    const content = "# This is a comment\nFOO=bar";
    const result = parseEnvFile(content);

    expect(result.size).toBe(1);
    expect(result.get("FOO")).toBe("bar");
  });

  it("skips empty lines", () => {
    const content = "FOO=bar\n\n\nBAZ=qux";
    const result = parseEnvFile(content);

    expect(result.size).toBe(2);
  });

  it("handles values with equals signs", () => {
    const content = "URL=http://example.com?foo=bar";
    const result = parseEnvFile(content);

    expect(result.get("URL")).toBe("http://example.com?foo=bar");
  });
});

describe("scanPortVariables", () => {
  it("finds variables matching *_PORT pattern", () => {
    const content = "HTTP_PORT=3000\nDB_PORT=5432\nNAME=test";
    const result = scanPortVariables(content, ["*_PORT"]);

    expect(result).toContain("HTTP_PORT");
    expect(result).toContain("DB_PORT");
    expect(result).not.toContain("NAME");
  });

  it("handles multiple patterns", () => {
    const content = "HTTP_PORT=3000\napp_port=8080\nOTHER=value";
    const result = scanPortVariables(content, ["*_PORT", "*_port"]);

    expect(result).toContain("HTTP_PORT");
    expect(result).toContain("app_port");
    expect(result).toHaveLength(2);
  });

  it("returns empty array when no matches", () => {
    const content = "NAME=test\nVALUE=123";
    const result = scanPortVariables(content, ["*_PORT"]);

    expect(result).toHaveLength(0);
  });

  it("handles case-insensitive pattern matching", () => {
    const content = "http_port=3000";
    const result = scanPortVariables(content, ["*_PORT"]);

    expect(result).toContain("http_port");
  });
});

describe("updateEnvPorts", () => {
  it("updates existing port values", () => {
    const content = "HTTP_PORT=3000\nDB_PORT=5432";
    const result = updateEnvPorts(content, { HTTP_PORT: 30001, DB_PORT: 30002 });

    expect(result).toContain("HTTP_PORT=30001");
    expect(result).toContain("DB_PORT=30002");
  });

  it("preserves non-port lines", () => {
    const content = "NAME=test\nHTTP_PORT=3000\nDESC=description";
    const result = updateEnvPorts(content, { HTTP_PORT: 30001 });

    expect(result).toContain("NAME=test");
    expect(result).toContain("DESC=description");
    expect(result).toContain("HTTP_PORT=30001");
  });

  it("preserves comments and empty lines", () => {
    const content = "# Comment\n\nHTTP_PORT=3000";
    const result = updateEnvPorts(content, { HTTP_PORT: 30001 });

    expect(result).toContain("# Comment");
    expect(result).toContain("HTTP_PORT=30001");
  });

  it("preserves leading whitespace", () => {
    const content = "  HTTP_PORT=3000";
    const result = updateEnvPorts(content, { HTTP_PORT: 30001 });

    expect(result).toBe("  HTTP_PORT=30001");
  });
});

// Filesystem tests

describe("copyEnvFile", () => {
  let tempDir: string;
  let worktreePath: string;
  let mainWorktreePath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "ai-env-copy-test-"));
    worktreePath = join(tempDir, "worktree");
    mainWorktreePath = join(tempDir, "main");
    mkdirSync(worktreePath);
    mkdirSync(mainWorktreePath);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("copies .env.example when it exists", () => {
    writeFileSync(join(worktreePath, ".env.example"), "FOO=bar");

    const result = copyEnvFile(worktreePath, mainWorktreePath);

    expect(result).toBe(true);
    expect(existsSync(join(worktreePath, ".env"))).toBe(true);
    expect(readFileSync(join(worktreePath, ".env"), "utf-8")).toBe("FOO=bar");
  });

  it("falls back to main .env when no .env.example", () => {
    writeFileSync(join(mainWorktreePath, ".env"), "MAIN=value");

    const result = copyEnvFile(worktreePath, mainWorktreePath);

    expect(result).toBe(true);
    expect(readFileSync(join(worktreePath, ".env"), "utf-8")).toBe("MAIN=value");
  });

  it("returns false when no source file exists", () => {
    const result = copyEnvFile(worktreePath, mainWorktreePath);

    expect(result).toBe(false);
    expect(existsSync(join(worktreePath, ".env"))).toBe(false);
  });

  it("merges .env.example with main .env values", () => {
    writeFileSync(join(worktreePath, ".env.example"), "EXAMPLE=yes\nSHARED=example");
    writeFileSync(join(mainWorktreePath, ".env"), "MAIN=no\nSHARED=main");

    copyEnvFile(worktreePath, mainWorktreePath);

    const result = readFileSync(join(worktreePath, ".env"), "utf-8");
    // Base structure from .env.example, values overlaid from main .env
    expect(result).toContain("EXAMPLE=yes");
    expect(result).toContain("SHARED=main"); // main .env value takes precedence
    expect(result).toContain("MAIN=no"); // appended from main .env
  });
});

describe("configureEnvFile", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "ai-env-config-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("updates port values in existing .env", () => {
    writeFileSync(join(tempDir, ".env"), "HTTP_PORT=3000\nNAME=test");

    configureEnvFile(tempDir, { HTTP_PORT: 30001 });

    const content = readFileSync(join(tempDir, ".env"), "utf-8");
    expect(content).toContain("HTTP_PORT=30001");
    expect(content).toContain("NAME=test");
  });

  it("creates .env with ports if not exists", () => {
    configureEnvFile(tempDir, { HTTP_PORT: 30001, DB_PORT: 30002 });

    expect(existsSync(join(tempDir, ".env"))).toBe(true);
    const content = readFileSync(join(tempDir, ".env"), "utf-8");
    expect(content).toContain("HTTP_PORT=30001");
    expect(content).toContain("DB_PORT=30002");
  });
});

describe("getPortVariablesFromProject", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "ai-env-vars-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("reads from .env.example first", () => {
    writeFileSync(join(tempDir, ".env.example"), "HTTP_PORT=3000");
    writeFileSync(join(tempDir, ".env"), "DB_PORT=5432");

    const result = getPortVariablesFromProject(tempDir, ["*_PORT"]);

    expect(result).toContain("HTTP_PORT");
    expect(result).not.toContain("DB_PORT");
  });

  it("falls back to .env when no .env.example", () => {
    writeFileSync(join(tempDir, ".env"), "DB_PORT=5432");

    const result = getPortVariablesFromProject(tempDir, ["*_PORT"]);

    expect(result).toContain("DB_PORT");
  });

  it("returns empty array when no env files exist", () => {
    const result = getPortVariablesFromProject(tempDir, ["*_PORT"]);

    expect(result).toHaveLength(0);
  });
});

describe("appendToEnvFile", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "ai-env-append-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("appends to existing file", () => {
    const envPath = join(tempDir, ".env");
    writeFileSync(envPath, "FOO=bar\n");

    appendToEnvFile(envPath, "BAZ", "qux");

    const content = readFileSync(envPath, "utf-8");
    expect(content).toBe("FOO=bar\nBAZ=qux\n");
  });

  it("creates file if not exists", () => {
    const envPath = join(tempDir, ".env");

    appendToEnvFile(envPath, "FOO", "bar");

    expect(existsSync(envPath)).toBe(true);
    expect(readFileSync(envPath, "utf-8")).toBe("FOO=bar\n");
  });

  it("adds newline before appending if missing", () => {
    const envPath = join(tempDir, ".env");
    writeFileSync(envPath, "FOO=bar");

    appendToEnvFile(envPath, "BAZ", "qux");

    const content = readFileSync(envPath, "utf-8");
    expect(content).toBe("FOO=bar\nBAZ=qux\n");
  });
});

