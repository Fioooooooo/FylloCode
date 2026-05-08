import { describe, expect, it } from "vitest";
import { z } from "zod";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { validate } from "@main/ipc/_kit/schema";

describe("validate", () => {
  const schema = z.object({
    id: z.string().min(1),
    count: z.number().int().nonnegative(),
  });

  it("returns the parsed value on success", () => {
    expect(validate(schema, { id: "x", count: 3 })).toEqual({ id: "x", count: 3 });
  });

  it("throws an IPC error with VALIDATION_ERROR on failure", () => {
    try {
      validate(schema, { id: "", count: -1 });
      throw new Error("expected validate to throw");
    } catch (err) {
      const e = err as Error & { code: string };
      expect(e.code).toBe(IpcErrorCodes.VALIDATION_ERROR);
      expect(e.message).toContain("id:");
      expect(e.message).toContain("count:");
    }
  });

  it("formats root-level failures with (root) path", () => {
    const stringSchema = z.string();
    try {
      validate(stringSchema, 123);
      throw new Error("expected validate to throw");
    } catch (err) {
      const e = err as Error;
      expect(e.message).toMatch(/\(root\):/);
    }
  });
});
