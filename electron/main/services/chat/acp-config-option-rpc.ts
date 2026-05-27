import type { AcpSessionConfigOption } from "@shared/types/acp-config";

interface AcpRpcError {
  code?: number | string;
  message?: string;
  data?: { details?: string };
}

export function valueExistsInSchema(
  schema: AcpSessionConfigOption,
  value: string | boolean
): boolean {
  if (schema.type === "boolean") {
    return typeof value === "boolean";
  }
  if (typeof value !== "string") {
    return false;
  }

  const options = schema.options;
  if (!Array.isArray(options) || options.length === 0) {
    return false;
  }

  const isGrouped = "group" in options[0];
  if (isGrouped) {
    const groups = options as Extract<typeof options, { group: string }[]>;
    return groups.some((group) => group.options.some((item) => item.value === value));
  }
  const flat = options as Extract<typeof options, { value: string }[]>;
  return flat.some((item) => item.value === value);
}

export function isMethodNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as AcpRpcError;
  if (candidate.code === -32601 || candidate.code === "MethodNotFound") {
    return true;
  }
  const text = `${candidate.message ?? ""} ${candidate.data?.details ?? ""}`.toLowerCase();
  return text.includes("not implemented") || text.includes("unsupported");
}

export function buildPayload(
  type: "select" | "boolean",
  value: string | boolean
): { type?: "boolean"; value: string | boolean } {
  if (type === "boolean") {
    return { type: "boolean", value: value as boolean };
  }
  return { value: value as string };
}
