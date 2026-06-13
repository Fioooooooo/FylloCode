import { readFileSync } from "fs";
import { join } from "path";
import { getDataSubPath } from "@main/infra/paths";
import { writeFileAtomicSync } from "@main/infra/storage/atomic-write";
import type { ProviderConnection, ProviderId } from "@shared/types/integration";

type ConnectionDocument = Partial<Record<ProviderId, ProviderConnection>>;

function connectionsPath(): string {
  return join(getDataSubPath("integrations"), "connections.json");
}

function readDocument(): ConnectionDocument {
  try {
    return JSON.parse(readFileSync(connectionsPath(), "utf8")) as ConnectionDocument;
  } catch {
    return {};
  }
}

function writeDocument(document: ConnectionDocument): void {
  writeFileAtomicSync(connectionsPath(), JSON.stringify(document, null, 2));
}

export function listConnections(): ProviderConnection[] {
  return Object.values(readDocument()).filter(
    (connection): connection is ProviderConnection => connection !== undefined
  );
}

export function getConnection(providerId: ProviderId): ProviderConnection | null {
  return readDocument()[providerId] ?? null;
}

export function saveConnection(connection: ProviderConnection): ProviderConnection {
  const document = readDocument();
  document[connection.providerId] = connection;
  writeDocument(document);
  return connection;
}

export function removeConnection(providerId: ProviderId): void {
  const document = readDocument();
  delete document[providerId];
  writeDocument(document);
}
