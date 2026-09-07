import { readFileSync, rmSync } from "fs";
import { join } from "path";
import { safeStorage } from "electron";
import { getDataSubPath } from "@main/infra/paths";
import { writeFileAtomicSync } from "@main/infra/storage/atomic-write";
import type { ProviderId } from "@shared/types/integration";

export type ProviderCredentials = Record<string, string>;

interface CredentialEnvelope {
  encrypted: string;
}

function credentialsRoot(): string {
  return join(getDataSubPath("integrations"), "credentials");
}

export function credentialPath(providerId: ProviderId): string {
  return join(credentialsRoot(), `${providerId}.json`);
}

export function loadCredentials(providerId: ProviderId): ProviderCredentials {
  try {
    const envelope: unknown = JSON.parse(readFileSync(credentialPath(providerId), "utf8"));
    if (
      !envelope ||
      typeof envelope !== "object" ||
      Array.isArray(envelope) ||
      typeof (envelope as Partial<CredentialEnvelope>).encrypted !== "string"
    ) {
      return {};
    }
    const plaintext = safeStorage.decryptString(
      Buffer.from((envelope as CredentialEnvelope).encrypted, "base64")
    );
    const credentials: unknown = JSON.parse(plaintext);
    if (!credentials || typeof credentials !== "object" || Array.isArray(credentials)) {
      return {};
    }
    return credentials as ProviderCredentials;
  } catch {
    return {};
  }
}

export function saveCredentials(
  providerId: ProviderId,
  credentials: ProviderCredentials
): ProviderCredentials {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Electron safeStorage encryption is unavailable");
  }
  const encrypted = safeStorage.encryptString(JSON.stringify(credentials)).toString("base64");
  const envelope: CredentialEnvelope = { encrypted };
  writeFileAtomicSync(credentialPath(providerId), JSON.stringify(envelope, null, 2));
  return credentials;
}

export function clearCredentials(providerId: ProviderId): void {
  rmSync(credentialPath(providerId), { force: true });
}
