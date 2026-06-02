// Theme / appearance
export type ThemeMode = "light" | "dark" | "system";

// Agent execution mode
export type AgentMode = "auto" | "manual";

// Notification methods (multi-select)
export type NotificationMethod = "system" | "sound" | "in-app";

// Budget alert unit
export type BudgetUnit = "tokens" | "usd";

// Token stats reset period
export type TokenStatsPeriod = "daily" | "weekly" | "monthly";

// Supported CLI agent info
export interface AgentInfo {
  id: string;
  name: string;
  description: string;
  installed: boolean;
  version?: string;
  docsUrl: string;
}

// Budget alert config
export interface BudgetAlert {
  value: number;
  unit: BudgetUnit;
}

// Global preferences config
export interface PreferencesConfig {
  theme: ThemeMode;
  language: string;
  defaultAgentMode: AgentMode;
  notificationMethods: NotificationMethod[];
  autoSaveSession: boolean;
  tokenStatsPeriod: TokenStatsPeriod;
  budgetAlert: BudgetAlert;
}

export type AppAboutInfo = Readonly<{
  version: string;
  releaseChannel: string;
  copyright: string;
  repositoryUrl: string;
  feedbackUrl: string;
}>;

export type ReleaseCheckStatus = "update-available" | "up-to-date";

export type ReleaseCheckSuccess = Readonly<{
  status: ReleaseCheckStatus;
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
  releaseName?: string;
  publishedAt?: string;
}>;

export type ReleaseCheckResult = ReleaseCheckSuccess;
