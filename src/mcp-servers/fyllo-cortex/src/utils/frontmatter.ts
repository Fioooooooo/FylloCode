import { load } from "js-yaml";

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;
const MAX_PARSE_ERROR_LENGTH = 200;

function summarizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, MAX_PARSE_ERROR_LENGTH);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function parseFrontmatter(content: string): {
  data: Record<string, unknown> | null;
  parseError?: string;
} {
  const match = FRONTMATTER_RE.exec(content);
  if (!match) {
    return { data: null };
  }

  try {
    const data = load(match[1] ?? "");
    if (!isPlainObject(data)) {
      return { data: null, parseError: "frontmatter is not an object" };
    }

    return { data };
  } catch (error) {
    return { data: null, parseError: summarizeError(error) };
  }
}
