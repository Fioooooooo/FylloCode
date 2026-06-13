import { readFileSync, rmSync } from "fs";
import { join } from "path";
import { getDataSubPath } from "@main/infra/paths";
import { writeFileAtomicSync } from "@main/infra/storage/atomic-write";
import type { ProviderId } from "@shared/types/integration";

export type ProviderCredentials = Record<string, string>;

function credentialsRoot(): string {
  return join(getDataSubPath("integrations"), "credentials");
}

export function credentialPath(providerId: ProviderId): string {
  return join(credentialsRoot(), `${providerId}.json`);
}

export function loadCredentials(providerId: ProviderId): ProviderCredentials {
  try {
    return JSON.parse(readFileSync(credentialPath(providerId), "utf8")) as ProviderCredentials;
  } catch {
    return {};
  }
}

export function saveCredentials(
  providerId: ProviderId,
  credentials: ProviderCredentials
): ProviderCredentials {
  writeFileAtomicSync(credentialPath(providerId), JSON.stringify(credentials, null, 2));
  return credentials;
}

export function clearCredentials(providerId: ProviderId): void {
  rmSync(credentialPath(providerId), { force: true });
}
