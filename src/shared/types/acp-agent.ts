export type AcpInstallMethod = "npx" | "uvx" | "binary";

export type AcpManagedBy = "fyllocode" | "user";
export type AcpAgentKind = "native" | "adapter" | "bridge";

export interface AcpFylloMeta {
  kind: AcpAgentKind;
}

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
  args?: string[];
  env?: Record<string, string>;
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
  website?: string;
  distribution: AcpAgentDistribution;
  __fyllo?: AcpFylloMeta;
}

export interface AcpRegistry {
  version?: string;
  agents: AcpAgentEntry[];
}

export interface AcpRegistryCache {
  fetchedAt: string;
  data: AcpRegistry;
}

export interface AcpCustomAgentConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface AcpCustomAgentsJson {
  agent_servers: Record<string, AcpCustomAgentConfig>;
}

export interface CatalogAgent {
  id: string;
  source: "registry" | "custom";
  name: string;
  registryEntry?: AcpAgentEntry;
  customConfig?: {
    displayName: string;
    command: string;
    args: string[];
    env: Record<string, string>;
  };
}

export interface AcpStatusCache {
  fetchedAt: string;
  statuses: AcpAgentStatus[];
}

export interface AcpInstalledRecord {
  managedBy: AcpManagedBy;
  installMethod: AcpInstallMethod;
  installPath?: string;
  installedVersion?: string;
  installedAt: string;
}

export type AcpInstalledMap = Record<string, AcpInstalledRecord>;

export interface AcpAgentStatus {
  id: string;
  installed: boolean;
  detectedVersion?: string;
  managedBy: AcpManagedBy | null;
  installMethod?: AcpInstallMethod;
  updateAvailable: boolean;
  latestVersion?: string;
  /** 状态来源：registry 为 ACP Registry，custom 为本地 custom-agents.json */
  source?: "registry" | "custom";
  /** 显示名称；custom agent 在检测时填充，避免渲染进程再查一次配置 */
  name?: string;
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

// distribution.package 可能携带版本/标签后缀（如 @scope/pkg@1.2.3、pkg@latest），
// npm/uv 的 list 与 uninstall 命令要求裸包名；UI 展示也使用裸包名。
export function stripPackageVersion(packageSpec: string): string {
  return packageSpec.replace(/@[\d].*$/, "").replace(/(@[^@/]+)@.*$/, "$1");
}

export interface AcpInstallProgress {
  agentId: string;
  status: "downloading" | "installing" | "done" | "error";
  message?: string;
}

export interface AcpUninstallProgress {
  agentId: string;
  status: "uninstalling" | "done" | "error";
  message?: string;
}
