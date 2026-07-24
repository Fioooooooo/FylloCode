import { analyzeFylloTagMarkdown } from "@shared/fyllo-markdown/tag-analysis";
import { getFylloSignalContract, isValidFylloSignalTypeName } from "./registry";
import type {
  FylloSignalInvalidParseResult,
  FylloSignalMarkdownAnalysis,
  FylloSignalMarkdownNode,
  FylloSignalParseErrorCode,
  FylloSignalParseResult,
  FylloSignalReadyParseResult,
} from "./protocol";

function invalid(
  code: FylloSignalParseErrorCode,
  message: string,
  options: { type?: string; details?: string[] } = {}
): FylloSignalInvalidParseResult {
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

function getAttrEntries(attrs: FylloSignalMarkdownNode["attrs"]): Array<[string, unknown]> {
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

export function analyzeFylloSignalMarkdown(source: string): FylloSignalMarkdownAnalysis {
  return analyzeFylloTagMarkdown(source, { tagName: "fyllo-signal" });
}

export function parseFylloSignalNode(node: FylloSignalMarkdownNode): FylloSignalParseResult {
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
  if (type === undefined || type.length === 0) {
    return invalid("missing_type", "Fyllo signal type is required.");
  }
  if (!isValidFylloSignalTypeName(type)) {
    return invalid("invalid_type_name", "Fyllo signal type must use domain.action syntax.", {
      type,
    });
  }

  const contract = getFylloSignalContract(type);
  if (!contract) {
    return invalid("unknown_type", `Unsupported Fyllo signal type: ${type}.`, { type });
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
    return invalid("invalid_payload", "Fyllo signal payload does not match the schema.", {
      type,
      details: formatValidationIssues(parsedPayload.error.issues),
    });
  }

  return {
    status: "ready",
    type: contract.type,
    payload: parsedPayload.data,
  } as FylloSignalReadyParseResult;
}
