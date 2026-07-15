export type KnowledgeEntryType = "project" | "reference" | "feedback";

export type KnowledgeComputedStatus = "active" | "suspect" | "unknown";

export interface KnowledgeFileAnchor {
  kind: "file";
  file: string;
  hash: string;
}

export interface KnowledgePackageAnchor {
  kind: "package";
  package: string;
  version: string;
  resolutionDigest: string;
}

export interface KnowledgeUrlAnchor {
  kind: "url";
  url: string;
  verifiedAt: string;
  maxAgeDays?: number;
}

export type KnowledgeAnchor = KnowledgeFileAnchor | KnowledgePackageAnchor | KnowledgeUrlAnchor;

export interface KnowledgeSessionSource {
  kind: "session";
  sessionId: string;
  messageId?: string;
  actionId?: string;
}

export interface KnowledgeCommitSource {
  kind: "commit";
  commitHash: string;
}

export interface KnowledgeLineageSource {
  kind: "lineage";
  subjectId?: string;
  proposalId?: string;
  commitHash?: string;
}

export type KnowledgeSource =
  | KnowledgeSessionSource
  | KnowledgeCommitSource
  | KnowledgeLineageSource;

export interface KnowledgeEntryFrontmatter {
  name: string;
  description: string;
  type: KnowledgeEntryType;
  createdAt: string;
  updatedAt: string;
  asOf?: string;
  anchors?: KnowledgeAnchor[];
  source?: KnowledgeSource;
}

export interface KnowledgeEntryDraft extends KnowledgeEntryFrontmatter {
  body: string;
}

export interface KnowledgeFlagActionPayload {
  summary: string;
  contextPaths?: string[];
}

export interface KnowledgeEntryDocument {
  name: string;
  content: string;
}

export interface KnowledgeBrowserEntry {
  name: string;
  description: string;
  type: KnowledgeEntryType;
  updatedAt: string;
  status: KnowledgeComputedStatus;
}

export interface KnowledgeBrowserError {
  path: string;
  type: "read" | "parse";
  message: string;
  name?: string;
}

export interface KnowledgeBrowserOverview {
  entries: KnowledgeBrowserEntry[];
  errors: KnowledgeBrowserError[];
}

export interface KnowledgeEntryDeleteResult {
  name: string;
}

export interface KnowledgeReviewActionPayload {
  name: string;
  summary?: string;
}
