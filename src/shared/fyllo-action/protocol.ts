import type {
  KnowledgeFlagActionPayload,
  KnowledgeReviewActionPayload,
} from "@shared/types/knowledge";
import type {
  FylloTagMarkdownAnalysis,
  FylloTagMarkdownContext,
  FylloTagMarkdownDisposition,
  FylloTagMarkdownOccurrence,
} from "@shared/fyllo-markdown/tag-analysis";

export type FylloActionType = "task.create" | "plan.create" | "knowledge.flag" | "knowledge.review";

export type FylloConfirmActionType = FylloActionType;

export interface TaskCreateActionPayload {
  title: string;
  description?: string;
}

export interface PlanCreateActionPayload {
  slug: string;
  goal: string;
}

export interface FylloActionPayloadByType {
  "task.create": TaskCreateActionPayload;
  "plan.create": PlanCreateActionPayload;
  "knowledge.flag": KnowledgeFlagActionPayload;
  "knowledge.review": KnowledgeReviewActionPayload;
}

export type FylloActionPayload<T extends FylloActionType = FylloActionType> =
  FylloActionPayloadByType[T];

export type FylloActionParseErrorCode =
  | "missing_type"
  | "invalid_type_name"
  | "unknown_type"
  | "unexpected_attribute"
  | "invalid_json"
  | "invalid_payload";

export interface FylloActionParseError {
  code: FylloActionParseErrorCode;
  message: string;
  details?: string[];
}

export interface FylloActionPendingParseResult {
  status: "pending";
  type?: string;
}

export interface FylloActionInvalidParseResult {
  status: "invalid";
  type?: string;
  error: FylloActionParseError;
}

export type FylloActionReadyParseResult = {
  [Type in FylloActionType]: {
    status: "ready";
    type: Type;
    payload: FylloActionPayloadByType[Type];
  };
}[FylloActionType];

export type FylloActionParseResult =
  FylloActionPendingParseResult | FylloActionInvalidParseResult | FylloActionReadyParseResult;

export type FylloActionHandlerResult =
  | {
      outcome: "succeeded";
      completedActionIds?: string[];
    }
  | {
      outcome: "failed";
      error: string;
    }
  | {
      outcome: "cancelled";
    }
  | {
      outcome: "dismissed";
    };

export type FylloActionStateStatus = "ready" | "succeeded" | "failed" | "cancelled";

export interface FylloActionState {
  type: FylloConfirmActionType;
  status: FylloActionStateStatus;
  revision: number;
  updatedAt: string;
  error?: string;
}

export type FylloActionCommand = "succeed" | "fail" | "cancel";

export interface RegisterFylloActionInput {
  projectId: string;
  sessionId: string;
  actionId: string;
  type: FylloConfirmActionType;
}

export interface TransitionFylloActionInput {
  projectId: string;
  sessionId: string;
  actionId: string;
  command: FylloActionCommand;
  expectedRevision: number;
  error?: string;
}

export interface TransitionFylloActionsInput {
  projectId: string;
  sessionId: string;
  actionIds: string[];
  command: FylloActionCommand;
  expectedRevisions: Record<string, number>;
  error?: string;
}

export interface TransitionFylloActionResult {
  actionId: string;
  success: boolean;
  record?: FylloActionState;
  error?: string;
}

export interface PersistedFylloActionStates {
  version: 1;
  records: Record<string, FylloActionState>;
}

export interface ChatFylloActionIdInput {
  sessionId: string;
  messageIndex: number;
  partIndex: number;
  actionOrdinalInPart: number;
}

export interface ParsedFylloActionSource {
  attrs: Record<string, string>;
  content: string;
  loading: boolean;
}

export type FylloActionMarkdownDisposition = FylloTagMarkdownDisposition;
export type FylloActionMarkdownContext = FylloTagMarkdownContext;
export type FylloActionMarkdownOccurrence = FylloTagMarkdownOccurrence;
export type FylloActionMarkdownAnalysis = FylloTagMarkdownAnalysis;

export interface FylloActionMarkdownNode {
  type?: string;
  attrs?: Record<string, unknown> | [string, unknown][] | null;
  loading?: boolean;
  raw?: string;
  content?: string;
}

export type { KnowledgeFlagActionPayload, KnowledgeReviewActionPayload };
