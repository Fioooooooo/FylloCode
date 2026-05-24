export type AcpInstallMethod = "npx" | "uvx" | "binary";

export type AcpManagedBy = "fyllocode" | "user";

export interface AcpAgentNpxDistribution {
  package: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface AcpAgentUvxDistribution {
  package: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface AcpAgentBinaryDistribution {
  archive: string;
  cmd: string;
}

export interface AcpAgentDistribution {
  npx?: AcpAgentNpxDistribution;
  uvx?: AcpAgentUvxDistribution;
  binary?: Record<string, AcpAgentBinaryDistribution>;
}

export interface AcpAgentEntry {
  id: string;
  name: string;
  version: string;
  description: string;
  authors: string[];
  license: string;
  icon?: string;
  repository?: string;
  distribution: AcpAgentDistribution;
}

export interface AcpRegistry {
  version?: string;
  agents: AcpAgentEntry[];
}

export interface AcpRegistryCache {
  fetchedAt: number;
  data: AcpRegistry;
}

export interface AcpInstalledRecord {
  managedBy: AcpManagedBy;
  installMethod: AcpInstallMethod;
  installPath?: string;
  installedVersion?: string;
  installedAt: number;
}

export type AcpInstalledMap = Record<string, AcpInstalledRecord>;

export interface AcpAgentStatus {
  id: string;
  installed: boolean;
  detectedVersion?: string;
  managedBy: AcpManagedBy | null;
  updateAvailable: boolean;
  latestVersion?: string;
}

export interface AcpPromptCapabilities {
  image: boolean;
  audio: boolean;
  embeddedContext: boolean;
}

export function normalizePromptCapabilities(input?: {
  image?: boolean;
  audio?: boolean;
  embeddedContext?: boolean;
}): AcpPromptCapabilities {
  return {
    image: input?.image === true,
    audio: input?.audio === true,
    embeddedContext: input?.embeddedContext === true,
  };
}

export interface AcpInstallProgress {
  agentId: string;
  status: "downloading" | "installing" | "done" | "error";
  message?: string;
}
