import { readFileSync } from "fs";
import { join } from "path";
import { getDataSubPath } from "@main/infra/paths";
import { writeFileAtomicSync } from "@main/infra/storage/atomic-write";
import type { ToolConnection } from "@shared/types/integration";

const CONNECTIONS_FILE = "connections.json";

function getConnectionsPath(): string {
  return join(getDataSubPath("integrations"), CONNECTIONS_FILE);
}

function readConnections(): ToolConnection[] {
  try {
    const content = readFileSync(getConnectionsPath(), "utf-8");
    return JSON.parse(content) as ToolConnection[];
  } catch {
    return [];
  }
}

function writeConnections(connections: ToolConnection[]): void {
  writeFileAtomicSync(getConnectionsPath(), JSON.stringify(connections, null, 2));
}

export function getConnections(): ToolConnection[] {
  return readConnections();
}

export function getConnection(toolId: string): ToolConnection | null {
  return readConnections().find((c) => c.toolId === toolId) ?? null;
}

export function saveConnection(connection: ToolConnection): void {
  const connections = readConnections();
  const index = connections.findIndex((c) => c.toolId === connection.toolId);
  if (index >= 0) {
    connections[index] = connection;
  } else {
    connections.push(connection);
  }
  writeConnections(connections);
}

export function removeConnection(toolId: string): void {
  const connections = readConnections().filter((c) => c.toolId !== toolId);
  writeConnections(connections);
}
