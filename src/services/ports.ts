import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { getPortRegistryPath } from "../utils/paths.js";

export interface PortAllocation {
  project: string;
  environment: string;
  varName: string;
  allocatedAt: string;
}

export interface PortRegistry {
  version: 1;
  allocations: Record<string, PortAllocation>;
}

const DEFAULT_PORT_RANGE: [number, number] = [30000, 39999];

function createEmptyRegistry(): PortRegistry {
  return {
    version: 1,
    allocations: {},
  };
}

export function readRegistry(): PortRegistry {
  const registryPath = getPortRegistryPath();

  if (!existsSync(registryPath)) {
    return createEmptyRegistry();
  }

  const content = readFileSync(registryPath, "utf-8");
  return JSON.parse(content) as PortRegistry;
}

export function writeRegistry(registry: PortRegistry): void {
  const registryPath = getPortRegistryPath();
  const dir = dirname(registryPath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  writeFileSync(registryPath, JSON.stringify(registry, null, 2), {
    mode: 0o600,
  });
}

function findNextAvailablePort(
  registry: PortRegistry,
  portRange: [number, number]
): number {
  const [minPort, maxPort] = portRange;
  const usedPorts = new Set(Object.keys(registry.allocations).map(Number));

  for (let port = minPort; port <= maxPort; port++) {
    if (!usedPorts.has(port)) {
      return port;
    }
  }

  throw new Error(
    `No available ports in range ${minPort}-${maxPort}. ` +
      `${usedPorts.size} ports are currently allocated.`
  );
}

export function allocatePorts(
  projectPath: string,
  envName: string,
  varNames: string[],
  portRange: [number, number] = DEFAULT_PORT_RANGE
): Record<string, number> {
  const registry = readRegistry();
  const allocatedPorts: Record<string, number> = {};
  const timestamp = new Date().toISOString();

  for (const varName of varNames) {
    const port = findNextAvailablePort(registry, portRange);

    registry.allocations[String(port)] = {
      project: projectPath,
      environment: envName,
      varName,
      allocatedAt: timestamp,
    };

    allocatedPorts[varName] = port;
  }

  writeRegistry(registry);
  return allocatedPorts;
}

export function releasePorts(projectPath: string, envName: string): number {
  const registry = readRegistry();
  let releasedCount = 0;

  for (const [port, allocation] of Object.entries(registry.allocations)) {
    if (
      allocation.project === projectPath &&
      allocation.environment === envName
    ) {
      delete registry.allocations[port];
      releasedCount++;
    }
  }

  if (releasedCount > 0) {
    writeRegistry(registry);
  }

  return releasedCount;
}

export function getPortsForEnvironment(
  projectPath: string,
  envName: string
): Record<string, number> {
  const registry = readRegistry();
  const ports: Record<string, number> = {};

  for (const [port, allocation] of Object.entries(registry.allocations)) {
    if (
      allocation.project === projectPath &&
      allocation.environment === envName
    ) {
      ports[allocation.varName] = Number(port);
    }
  }

  return ports;
}

export function getAllocationsForProject(
  projectPath: string
): Array<{ envName: string; varName: string; port: number }> {
  const registry = readRegistry();
  const allocations: Array<{ envName: string; varName: string; port: number }> =
    [];

  for (const [port, allocation] of Object.entries(registry.allocations)) {
    if (allocation.project === projectPath) {
      allocations.push({
        envName: allocation.environment,
        varName: allocation.varName,
        port: Number(port),
      });
    }
  }

  return allocations;
}
