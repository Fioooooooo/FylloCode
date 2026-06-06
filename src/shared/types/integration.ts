export type IntegrationCategoryId =
  | "project-management"
  | "source-control"
  | "ci-cd"
  | "deployment"
  | "communication"
  | "observability";

export const integrationCategoryIds = [
  "project-management",
  "source-control",
  "ci-cd",
  "deployment",
  "communication",
  "observability",
] as const satisfies readonly IntegrationCategoryId[];

export type IntegrationStageId = IntegrationCategoryId;
export type ConnectionType = "api-token" | "oauth";
export type ConnectionStatus = "not-connected" | "connected" | "connecting";
export type ProviderAuthType = "api-token" | "oauth";
export type ProviderConnectionState = "not-connected" | "connected" | "expired";
export type ProviderId =
  | "yunxiao"
  | "github"
  | "gitlab"
  | "jira"
  | "linear"
  | "aliyun"
  | "vercel"
  | "dingtalk"
  | "slack"
  | "sentry";

export type ProviderResourceType =
  | "projex-project"
  | "github-issue"
  | "jira-project"
  | "linear-team"
  | "codeup-repo"
  | "github-repo"
  | "gitlab-repo"
  | "flow-pipeline"
  | "github-workflow"
  | "gitlab-pipeline"
  | "aliyun-service"
  | "vercel-project"
  | "dingtalk-robot"
  | "slack-channel"
  | "sls-logstore"
  | "sentry-project";

export type FilterOption = "all" | "connected" | "enabled-in-project";

export interface IntegrationCategory {
  id: IntegrationCategoryId;
  name: string;
  description: string;
}

export interface ConnectionField {
  key: string;
  label: string;
  type: "text" | "password" | "url";
  placeholder?: string;
  helperText?: string;
  helpLink?: string;
  required: boolean;
}

export interface ProviderCredentialField extends ConnectionField {}

export interface ProviderCapability {
  stage: IntegrationStageId;
  resourceType: ProviderResourceType;
  label: string;
  description: string;
}

export interface ProviderManifest {
  id: ProviderId;
  name: string;
  description: string;
  authType: ProviderAuthType;
  credentialFields: ProviderCredentialField[];
  capabilities: ProviderCapability[];
  logoIcon: string;
  logoColor: string;
  comingSoon: boolean;
}

export interface Provider extends ProviderManifest {}

export type ProviderCredentials = Record<string, string>;

export interface ProviderConnection {
  providerId: ProviderId;
  state: Exclude<ProviderConnectionState, "not-connected">;
  accountName?: string;
  accountId?: string;
  connectedAt?: string;
  credentialPreview?: Record<string, string>;
}

export interface ProviderResource {
  id: string;
  name: string;
  providerId: ProviderId;
  resourceType: ProviderResourceType;
  parentId?: string;
  parentName?: string;
  subtitle?: string;
}

export interface ProviderResourceListQuery {
  search?: string;
  refresh?: boolean;
  page?: number;
  perPage?: number;
}

export interface ProjectIntegrationEntry {
  providerId: ProviderId;
  resourceType: ProviderResourceType;
  resourceId: string;
}

export type ProjectIntegrationConfig = Record<IntegrationStageId, ProjectIntegrationEntry[]>;

export interface ToolParameterField {
  key: string;
  label: string;
  type: "text" | "select" | "checkbox-group" | "url";
  options?: { label: string; value: string }[];
  placeholder?: string;
  helperText?: string;
  required: boolean;
}

export interface IntegrationTool {
  id: string;
  name: string;
  description: string;
  categoryId: IntegrationCategoryId;
  connectionType: ConnectionType;
  connectionFields: ConnectionField[];
  parameterFields: ToolParameterField[];
  projectConfigFields: ToolParameterField[];
  logoIcon: string;
  logoColor: string;
  comingSoon: boolean;
}

export interface ToolConnection {
  toolId: string;
  status: ConnectionStatus;
  accountName?: string;
  connectedAt?: string;
  /** 脱敏后的凭证回显，key 与 connectionFields 对应，敏感字段用掩码替换 */
  credentialPreview?: Record<string, string>;
}

export interface ToolConfig {
  toolId: string;
  parameters: Record<string, unknown>;
}

export interface ProjectToolConfig {
  projectId: string;
  toolId: string;
  enabled: boolean;
  overrides: Record<string, unknown>;
}

export interface YunxiaoOrganization {
  id: string;
  name: string;
  description: string;
}
