import { getFylloActionContract, isValidFylloActionTypeName } from "./registry";
import { analyzeFylloTagMarkdown } from "@shared/fyllo-markdown/tag-analysis";
import type {
  FylloActionInvalidParseResult,
  FylloActionMarkdownAnalysis,
  FylloActionMarkdownNode,
  FylloActionParseErrorCode,
  FylloActionParseResult,
  FylloActionReadyParseResult,
  ParsedFylloActionSource,
} from "./protocol";

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

/**
 * 按原始 Markdown 源码识别 Action occurrence，并在 Markstream 解析前确定候选边界。
 * 该分析只负责结构和源码 ordinal；attrs、JSON 与 payload schema 仍由 semantic parser 校验。
 */
export function analyzeFylloActionMarkdown(source: string): FylloActionMarkdownAnalysis {
  return analyzeFylloTagMarkdown(source, { tagName: "fyllo-action" });
}

export function collectFylloActionSources(source: string): ParsedFylloActionSource[] {
  return analyzeFylloActionMarkdown(source).occurrences.map((occurrence) => ({
    attrs: occurrence.attrs,
    content: occurrence.body,
    loading: !occurrence.closed,
  }));
}

export function parseFylloActionNode(node: FylloActionMarkdownNode): FylloActionParseResult {
  const attrEntries = getAttrEntries(node.attrs);
  const extraAttrs = attrEntries.map(([name]) => name).filter((name) => name !== "type");
  const rawType = attrEntries.find(([name]) => name === "type")?.[1];
  const type = typeof rawType === "string" ? rawType : undefined;

  // The contract only allows the `type` attribute; reject anything else so that
  // future extensions (e.g. version/id) are not silently misinterpreted.
  if (extraAttrs.length > 0) {
    return invalid("unexpected_attribute", "Only the type attribute is allowed.", {
      type,
      details: extraAttrs.map((name) => `Unexpected attribute: ${name}`),
    });
  }

  // A loading node has not received its payload yet; defer validation until closed.
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
