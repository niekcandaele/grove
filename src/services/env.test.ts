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
  generateDockerOverride,
  getProjectHash,
  hasDockerCompose,
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

describe("generateDockerOverride", () => {
  it("generates valid YAML for service port mappings with !override", () => {
    const portMap = { HTTP_PORT: 30001 };
    const portMapping = { HTTP_PORT: { service: "web", containerPort: 3000 } };

    const result = generateDockerOverride(portMap, portMapping);

    expect(result).toContain("services:");
    expect(result).toContain("web:");
    expect(result).toContain("ports: !override");
    expect(result).toContain('"30001:3000"');
  });

  it("uses explicit containerPort when provided as object", () => {
    const portMap = { HTTP_PORT: 30000 };
    const portMapping = { HTTP_PORT: { service: "web", containerPort: 80 } };

    const result = generateDockerOverride(portMap, portMapping);

    expect(result).toContain('"30000:80"');
  });

  it("falls back to heuristic for string-only mapping", () => {
    const portMap = { HTTP_PORT: 30000 };
    const portMapping = { HTTP_PORT: "web" };

    const result = generateDockerOverride(portMap, portMapping);

    expect(result).toContain('"30000:3000"');
  });

  it("uses postgres default for DB variables with string mapping", () => {
    const portMap = { DB_PORT: 30000 };
    const portMapping = { DB_PORT: "postgres" };

    const result = generateDockerOverride(portMap, portMapping);

    expect(result).toContain('"30000:5432"');
  });

  it("returns empty string when no mappings match", () => {
    const portMap = { HTTP_PORT: 30001 };
    const portMapping = { OTHER_PORT: { service: "web", containerPort: 3000 } };

    const result = generateDockerOverride(portMap, portMapping);

    expect(result).toBe("");
  });

  it("groups multiple ports under same service", () => {
    const portMap = { HTTP_PORT: 30001, HTTPS_PORT: 30002 };
    const portMapping = {
      HTTP_PORT: { service: "web", containerPort: 80 },
      HTTPS_PORT: { service: "web", containerPort: 443 },
    };

    const result = generateDockerOverride(portMap, portMapping);

    const webMatches = result.match(/web:/g);
    expect(webMatches).toHaveLength(1);
    expect(result).toContain('"30001:80"');
    expect(result).toContain('"30002:443"');
  });

  it("handles multiple services", () => {
    const portMap = { HTTP_PORT: 30001, DB_PORT: 30002 };
    const portMapping = {
      HTTP_PORT: { service: "web", containerPort: 3000 },
      DB_PORT: { service: "postgres", containerPort: 5432 },
    };

    const result = generateDockerOverride(portMap, portMapping);

    expect(result).toContain("web:");
    expect(result).toContain("postgres:");
  });
});

describe("getProjectHash", () => {
  it("returns 12-character hex string", () => {
    const hash = getProjectHash("/home/user/project");

    expect(hash).toHaveLength(12);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it("returns same hash for same path", () => {
    const hash1 = getProjectHash("/home/user/project");
    const hash2 = getProjectHash("/home/user/project");

    expect(hash1).toBe(hash2);
  });

  it("returns different hash for different paths", () => {
    const hash1 = getProjectHash("/home/user/project1");
    const hash2 = getProjectHash("/home/user/project2");

    expect(hash1).not.toBe(hash2);
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

  it("prefers .env.example over main .env", () => {
    writeFileSync(join(worktreePath, ".env.example"), "EXAMPLE=yes");
    writeFileSync(join(mainWorktreePath, ".env"), "MAIN=no");

    copyEnvFile(worktreePath, mainWorktreePath);

    expect(readFileSync(join(worktreePath, ".env"), "utf-8")).toBe("EXAMPLE=yes");
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

describe("hasDockerCompose", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "ai-env-compose-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns true for docker-compose.yml", () => {
    writeFileSync(join(tempDir, "docker-compose.yml"), "version: '3'");

    expect(hasDockerCompose(tempDir)).toBe(true);
  });

  it("returns true for docker-compose.yaml", () => {
    writeFileSync(join(tempDir, "docker-compose.yaml"), "version: '3'");

    expect(hasDockerCompose(tempDir)).toBe(true);
  });

  it("returns true for compose.yml", () => {
    writeFileSync(join(tempDir, "compose.yml"), "version: '3'");

    expect(hasDockerCompose(tempDir)).toBe(true);
  });

  it("returns true for compose.yaml", () => {
    writeFileSync(join(tempDir, "compose.yaml"), "version: '3'");

    expect(hasDockerCompose(tempDir)).toBe(true);
  });

  it("returns false when no compose file exists", () => {
    expect(hasDockerCompose(tempDir)).toBe(false);
  });
});
