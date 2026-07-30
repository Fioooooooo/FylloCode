interface AcpRpcError {
  code?: number | string;
  message?: string;
  data?: { details?: string };
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
