import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let testDir: string;

vi.mock("../utils/paths.js", () => ({
  getPortRegistryPath: () => join(testDir, "ports.json"),
}));

import {
  allocatePorts,
  releasePorts,
  readRegistry,
  getPortsForEnvironment,
  getAllocationsForProject,
} from "./ports.js";
import { getPortRegistryPath } from "../utils/paths.js";

describe("Port Registry", () => {
  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "ai-env-ports-test-"));
  });

  afterEach(() => {
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("readRegistry", () => {
    it("returns empty registry when file does not exist", () => {
      const registry = readRegistry();
      expect(registry.version).toBe(1);
      expect(registry.allocations).toEqual({});
    });
  });

  describe("allocatePorts", () => {
    it("allocates ports sequentially starting from range minimum", () => {
      const ports = allocatePorts("/project/a", "env1", ["HTTP_PORT", "DB_PORT"], [30000, 39999]);

      expect(ports.HTTP_PORT).toBe(30000);
      expect(ports.DB_PORT).toBe(30001);
    });

    it("allocates different ports on subsequent calls", () => {
      const ports1 = allocatePorts("/project/a", "env1", ["HTTP_PORT"], [30000, 39999]);
      const ports2 = allocatePorts("/project/a", "env2", ["HTTP_PORT"], [30000, 39999]);

      expect(ports1.HTTP_PORT).toBe(30000);
      expect(ports2.HTTP_PORT).toBe(30001);
    });

    it("persists allocations to registry file", () => {
      allocatePorts("/project/a", "env1", ["HTTP_PORT"], [30000, 39999]);

      const registryPath = getPortRegistryPath();
      expect(existsSync(registryPath)).toBe(true);

      const content = readFileSync(registryPath, "utf-8");
      const registry = JSON.parse(content);
      expect(registry.allocations["30000"]).toBeDefined();
      expect(registry.allocations["30000"].project).toBe("/project/a");
      expect(registry.allocations["30000"].environment).toBe("env1");
      expect(registry.allocations["30000"].varName).toBe("HTTP_PORT");
    });

    it("throws when no ports available", () => {
      expect(() => {
        allocatePorts("/project/a", "env1", ["PORT1", "PORT2", "PORT3"], [30000, 30001]);
      }).toThrow("No available ports");
    });

    it("records allocation timestamp", () => {
      const before = new Date().toISOString();
      allocatePorts("/project/a", "env1", ["HTTP_PORT"], [30000, 39999]);
      const after = new Date().toISOString();

      const registry = readRegistry();
      const timestamp = registry.allocations["30000"].allocatedAt;

      expect(timestamp >= before).toBe(true);
      expect(timestamp <= after).toBe(true);
    });
  });

  describe("releasePorts", () => {
    it("releases all ports for an environment", () => {
      allocatePorts("/project/a", "env1", ["HTTP_PORT", "DB_PORT"], [30000, 39999]);

      const released = releasePorts("/project/a", "env1");

      expect(released).toBe(2);
      const registry = readRegistry();
      expect(Object.keys(registry.allocations)).toHaveLength(0);
    });

    it("only releases ports for matching project and environment", () => {
      allocatePorts("/project/a", "env1", ["HTTP_PORT"], [30000, 39999]);
      allocatePorts("/project/a", "env2", ["HTTP_PORT"], [30000, 39999]);
      allocatePorts("/project/b", "env1", ["HTTP_PORT"], [30000, 39999]);

      const released = releasePorts("/project/a", "env1");

      expect(released).toBe(1);
      const registry = readRegistry();
      expect(Object.keys(registry.allocations)).toHaveLength(2);
    });

    it("allows immediate reallocation of released ports", () => {
      const ports1 = allocatePorts("/project/a", "env1", ["HTTP_PORT"], [30000, 39999]);
      expect(ports1.HTTP_PORT).toBe(30000);

      releasePorts("/project/a", "env1");

      const ports2 = allocatePorts("/project/a", "env2", ["HTTP_PORT"], [30000, 39999]);
      expect(ports2.HTTP_PORT).toBe(30000);
    });

    it("returns 0 when no ports to release", () => {
      const released = releasePorts("/project/nonexistent", "env1");
      expect(released).toBe(0);
    });
  });

  describe("getPortsForEnvironment", () => {
    it("returns ports allocated to specific environment", () => {
      allocatePorts("/project/a", "env1", ["HTTP_PORT", "DB_PORT"], [30000, 39999]);
      allocatePorts("/project/a", "env2", ["HTTP_PORT"], [30000, 39999]);

      const ports = getPortsForEnvironment("/project/a", "env1");

      expect(ports.HTTP_PORT).toBe(30000);
      expect(ports.DB_PORT).toBe(30001);
      expect(Object.keys(ports)).toHaveLength(2);
    });

    it("returns empty object when no ports allocated", () => {
      const ports = getPortsForEnvironment("/project/a", "env1");
      expect(ports).toEqual({});
    });
  });

  describe("getAllocationsForProject", () => {
    it("returns all allocations for a project", () => {
      allocatePorts("/project/a", "env1", ["HTTP_PORT"], [30000, 39999]);
      allocatePorts("/project/a", "env2", ["HTTP_PORT", "DB_PORT"], [30000, 39999]);

      const allocations = getAllocationsForProject("/project/a");

      expect(allocations).toHaveLength(3);
      expect(allocations).toContainEqual({ envName: "env1", varName: "HTTP_PORT", port: 30000 });
      expect(allocations).toContainEqual({ envName: "env2", varName: "HTTP_PORT", port: 30001 });
      expect(allocations).toContainEqual({ envName: "env2", varName: "DB_PORT", port: 30002 });
    });

    it("does not include allocations from other projects", () => {
      allocatePorts("/project/a", "env1", ["HTTP_PORT"], [30000, 39999]);
      allocatePorts("/project/b", "env1", ["HTTP_PORT"], [30000, 39999]);

      const allocations = getAllocationsForProject("/project/a");

      expect(allocations).toHaveLength(1);
      expect(allocations[0].port).toBe(30000);
    });
  });
});
