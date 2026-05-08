import { describe, expect, it, vi } from "vitest";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { wrapHandler } from "@main/ipc/_kit/wrap-handler";
import { ipcError } from "@main/ipc/_kit/errors";

vi.mock("@main/infra/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe("wrapHandler", () => {
  it("returns { ok: true, data } on success", async () => {
    const result = await wrapHandler(() => Promise.resolve(42));
    expect(result).toEqual({ ok: true, data: 42 });
  });

  it("normalises ipcError into { ok: false, error }", async () => {
    const result = await wrapHandler(() => {
      throw ipcError(IpcErrorCodes.PROJECT_NOT_FOUND, "Project not found: x");
    });
    expect(result).toEqual({
      ok: false,
      error: { code: IpcErrorCodes.PROJECT_NOT_FOUND, message: "Project not found: x" },
    });
  });

  it("maps unknown thrown errors to UNKNOWN_ERROR", async () => {
    const result = await wrapHandler(() => {
      throw new Error("boom");
    });
    expect(result).toEqual({
      ok: false,
      error: { code: IpcErrorCodes.UNKNOWN_ERROR, message: "boom" },
    });
  });

  it("coerces non-Error throws into string messages", async () => {
    const result = await wrapHandler(() => {
      throw "raw string";
    });
    expect(result).toEqual({
      ok: false,
      error: { code: IpcErrorCodes.UNKNOWN_ERROR, message: "raw string" },
    });
  });

  it("preserves known error codes attached via the `code` property", async () => {
    const result = await wrapHandler(() => {
      const err = new Error("no workflow");
      (err as Error & { code: string }).code = IpcErrorCodes.WORKFLOW_NOT_FOUND;
      throw err;
    });
    expect(result).toEqual({
      ok: false,
      error: { code: IpcErrorCodes.WORKFLOW_NOT_FOUND, message: "no workflow" },
    });
  });

  it("discards unknown string codes and falls back to UNKNOWN_ERROR", async () => {
    const result = await wrapHandler(() => {
      const err = new Error("mystery");
      (err as Error & { code: string }).code = "TOTALLY_FAKE";
      throw err;
    });
    if (result.ok) throw new Error("expected failure");
    expect(result.error.code).toBe(IpcErrorCodes.UNKNOWN_ERROR);
  });
});
