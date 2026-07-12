import {
  getFylloActionContract,
  isValidFylloActionTypeName,
} from "@shared/constants/fyllo-action-contracts";
import type {
  FylloActionInvalidParseResult,
  FylloActionParseErrorCode,
  FylloActionParseResult,
  FylloActionReadyParseResult,
} from "@shared/types/fyllo-action";

export interface FylloActionMarkdownNode {
  attrs?: Record<string, unknown> | [string, unknown][] | null;
  loading?: boolean;
  raw?: string;
  content?: string;
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

const fylloActionTagPattern = /<fyllo-action\b([^>]*)>([\s\S]*?)(<\/fyllo-action>|$)/g;
const fylloActionAttrPattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>/]+)))?/g;

export function buildChatFylloActionId(input: ChatFylloActionIdInput): string {
  return [
    "chat",
    input.sessionId,
    String(input.messageIndex),
    String(input.partIndex),
    String(input.actionOrdinalInPart),
  ].join(":");
}

function invalid(
  code: FylloActionParseErrorCode,
  message: string,
  options: { type?: string; details?: string[] } = {}
): FylloActionInvalidParseResult {
  return {
    status: "invalid",
    type: options.type,
    error: {
      code,
      message,
      details: options.details,
    },
  };
}

function getAttrEntries(attrs: FylloActionMarkdownNode["attrs"]): Array<[string, unknown]> {
  if (!attrs) {
    return [];
  }

  if (Array.isArray(attrs)) {
    return attrs.filter((entry): entry is [string, unknown] => typeof entry[0] === "string");
  }

  return Object.entries(attrs);
}

function formatValidationIssues(issues: Array<{ path: PropertyKey[]; message: string }>): string[] {
  return issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "payload";
    return `${path}: ${issue.message}`;
  });
}

function parseFylloActionAttrs(rawAttrs: string): Record<string, string> {
  return Object.fromEntries(
    Array.from(rawAttrs.matchAll(fylloActionAttrPattern), (match) => [
      match[1],
      match[2] ?? match[3] ?? match[4] ?? "",
    ])
  );
}

export function collectFylloActionSources(source: string): ParsedFylloActionSource[] {
  return Array.from(source.matchAll(fylloActionTagPattern), (match) => ({
    attrs: parseFylloActionAttrs(match[1] ?? ""),
    content: match[2] ?? "",
    loading: match[3] !== "</fyllo-action>",
  }));
}

export function parseFylloActionNode(node: FylloActionMarkdownNode): FylloActionParseResult {
  const attrEntries = getAttrEntries(node.attrs);
  const extraAttrs = attrEntries.map(([name]) => name).filter((name) => name !== "type");
  const rawType = attrEntries.find(([name]) => name === "type")?.[1];
  const type = typeof rawType === "string" ? rawType : undefined;

  if (extraAttrs.length > 0) {
    return invalid("unexpected_attribute", "Only the type attribute is allowed.", {
      type,
      details: extraAttrs.map((name) => `Unexpected attribute: ${name}`),
    });
  }

  if (node.loading === true) {
    return {
      status: "pending",
      type,
    };
  }

  if (type === undefined || type.length === 0) {
    return invalid("missing_type", "Fyllo action type is required.");
  }

  if (!isValidFylloActionTypeName(type)) {
    return invalid("invalid_type_name", "Fyllo action type must use domain.action syntax.", {
      type,
    });
  }

  const contract = getFylloActionContract(type);
  if (!contract) {
    return invalid("unknown_type", `Unsupported Fyllo action type: ${type}.`, {
      type,
    });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(String(node.content ?? "").trim());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON payload.";
    return invalid("invalid_json", message, { type });
  }

  const parsedPayload = contract.payloadSchema.safeParse(payload);

  if (!parsedPayload.success) {
    return invalid("invalid_payload", "Fyllo action payload does not match the schema.", {
      type,
      details: formatValidationIssues(parsedPayload.error.issues),
    });
  }

  return {
    status: "ready",
    type: contract.type,
    payload: parsedPayload.data,
  } as FylloActionReadyParseResult;
}
