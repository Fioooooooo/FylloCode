import type {
  KnowledgeFlagActionPayload,
  KnowledgeReviewActionPayload,
} from "@shared/types/knowledge";

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
  | FylloActionPendingParseResult
  | FylloActionInvalidParseResult
  | FylloActionReadyParseResult;

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

export type FylloActionStateStatus = "succeeded" | "failed" | "cancelled";

export interface FylloActionState {
  type: FylloConfirmActionType;
  status: FylloActionStateStatus;
  updatedAt: string;
}

export type { KnowledgeFlagActionPayload, KnowledgeReviewActionPayload };
