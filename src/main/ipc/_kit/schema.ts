import type { ZodType } from "zod";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { ipcError } from "./errors";

/**
 * Validate raw renderer input against a zod schema. On failure, throw an
 * `IpcError` with `VALIDATION_ERROR` so `wrapHandler` can normalise it.
 */
export function validate<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const message = formatZodError(result.error);
    throw ipcError(IpcErrorCodes.VALIDATION_ERROR, message);
  }
  return result.data;
}

function formatZodError(error: {
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>;
}): string {
  if (error.issues.length === 0) {
    return "Invalid input";
  }
  return error.issues
    .map((issue) => {
      const path = issue.path.map((segment) => String(segment)).join(".") || "(root)";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}
