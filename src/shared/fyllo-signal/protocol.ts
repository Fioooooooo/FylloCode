import type {
  FylloTagMarkdownAnalysis,
  FylloTagMarkdownContext,
  FylloTagMarkdownDisposition,
  FylloTagMarkdownOccurrence,
} from "@shared/fyllo-markdown/tag-analysis";

export type FylloSignalType = "show.time";

export interface ShowTimeSignalPayload {
  label: string;
}

export interface FylloSignalPayloadByType {
  "show.time": ShowTimeSignalPayload;
}

export type FylloSignalPayload<T extends FylloSignalType = FylloSignalType> =
  FylloSignalPayloadByType[T];

export type FylloSignalParseErrorCode =
  | "missing_type"
  | "invalid_type_name"
  | "unknown_type"
  | "unexpected_attribute"
  | "invalid_json"
  | "invalid_payload";

export interface FylloSignalParseError {
  code: FylloSignalParseErrorCode;
  message: string;
  details?: string[];
}

export interface FylloSignalInvalidParseResult {
  status: "invalid";
  type?: string;
  error: FylloSignalParseError;
}

export type FylloSignalReadyParseResult = {
  [Type in FylloSignalType]: {
    status: "ready";
    type: Type;
    payload: FylloSignalPayloadByType[Type];
  };
}[FylloSignalType];

export type FylloSignalParseResult = FylloSignalInvalidParseResult | FylloSignalReadyParseResult;

export type FylloSignalMarkdownDisposition = FylloTagMarkdownDisposition;
export type FylloSignalMarkdownContext = FylloTagMarkdownContext;
export type FylloSignalMarkdownOccurrence = FylloTagMarkdownOccurrence;
export type FylloSignalMarkdownAnalysis = FylloTagMarkdownAnalysis;

export interface FylloSignalMarkdownNode {
  type?: string;
  attrs?: Record<string, unknown> | [string, unknown][] | null;
  raw?: string;
  content?: string;
}
