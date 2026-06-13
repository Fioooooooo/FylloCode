import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "events";

vi.mock("@main/bootstrap/lifecycle", () => ({
  registerDisposable: vi.fn(),
}));

import { driveAcpStream, type StreamOutput } from "@main/services/chat/acp-stream-driver";
import { sessionRegistry } from "@main/services/chat/session-registry";
import type { AcpSession } from "@main/services/chat/acp-session";
import type { SessionEvent } from "@main/domain/chat/session-events";
import { IpcErrorCodes } from "@shared/constants/error-codes";

/** Minimal AcpSession stand-in: an EventEmitter with a cancel spy. */
function createFakeSession(): AcpSession & { cancel: ReturnType<typeof vi.fn> } {
  const emitter = new EventEmitter();
  (emitter as unknown as { cancel: ReturnType<typeof vi.fn> }).cancel = vi.fn();
  return emitter as unknown as AcpSession & { cancel: ReturnType<typeof vi.fn> };
}

function createOutput(): StreamOutput & {
  chunks: unknown[];
  done: number[];
  errors: { code: string; message: string }[];
} {
  const chunks: unknown[] = [];
  const done: number[] = [];
  const errors: { code: string; message: string }[] = [];
  return {
    chunks,
    done,
    errors,
    sendChunk: (data) => chunks.push(data),
    sendDone: (totalTokens) => done.push(totalTokens),
    sendError: (code, message) => errors.push({ code, message }),
  };
}

const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe("driveAcpStream", () => {
  beforeEach(() => {
    sessionRegistry.cancelAll();
    vi.clearAllMocks();
  });

  it("forwards content deltas as chunks and registers the session", () => {
    const session = createFakeSession();
    const output = createOutput();
    driveAcpStream({
      session,
      owner: "chat",
      registryKey: "s1",
      output,
      logTag: "test",
      start: async () => {},
      hooks: { persistMessage: async () => {} },
    });

    expect(sessionRegistry.get("chat", "s1")).toBe(session);
    session.emit("event", { kind: "text_delta", text: "hi" } satisfies SessionEvent);
    expect(output.chunks).toEqual([{ kind: "text_delta", text: "hi" }]);
  });

  it("never forwards control events itself; delegates to onControlEvent", () => {
    const session = createFakeSession();
    const output = createOutput();
    const seen: string[] = [];
    driveAcpStream({
      session,
      owner: "apply",
      registryKey: "s2",
      output,
      logTag: "test",
      start: async () => {},
      hooks: {
        persistMessage: async () => {},
        onControlEvent: (ev) => seen.push(ev.kind),
      },
    });

    session.emit("event", {
      kind: "usage_update",
      used: 1,
      size: 2,
      cost: { amount: 0, currency: "USD" },
    } satisfies SessionEvent);
    // Driver forwarded nothing; the hook decided (and here forwarded nothing).
    expect(output.chunks).toEqual([]);
    expect(seen).toEqual(["usage_update"]);
  });

  it("runs onDone before sendDone and unregisters", async () => {
    const session = createFakeSession();
    const output = createOutput();
    const order: string[] = [];
    driveAcpStream({
      session,
      owner: "chat",
      registryKey: "s3",
      output,
      logTag: "test",
      start: async () => {},
      hooks: {
        persistMessage: async () => {
          order.push("persist");
        },
        onDone: async () => {
          order.push("onDone");
        },
      },
    });

    session.emit("event", { kind: "done", totalTokens: 42 } satisfies SessionEvent);
    await flush();

    expect(order).toEqual(["onDone"]);
    expect(output.done).toEqual([42]);
    expect(sessionRegistry.get("chat", "s3")).toBeUndefined();
  });

  it("maps the error code and unregisters on error", async () => {
    const session = createFakeSession();
    const output = createOutput();
    driveAcpStream({
      session,
      owner: "chat",
      registryKey: "s4",
      output,
      logTag: "test",
      start: async () => {},
      hooks: { persistMessage: async () => {} },
    });

    session.emit("event", {
      kind: "error",
      code: "WEIRD_CODE",
      message: "boom",
    } satisfies SessionEvent);
    await flush();

    expect(output.errors).toEqual([{ code: IpcErrorCodes.ACP_ERROR, message: "boom" }]);
    expect(sessionRegistry.get("chat", "s4")).toBeUndefined();
  });

  it("cancel() cancels the session and unregisters", () => {
    const session = createFakeSession();
    const output = createOutput();
    const runner = driveAcpStream({
      session,
      owner: "archive",
      registryKey: "s5",
      output,
      logTag: "test",
      start: async () => {},
      hooks: { persistMessage: async () => {} },
    });

    runner.cancel();
    expect(session.cancel).toHaveBeenCalledTimes(1);
    expect(sessionRegistry.get("archive", "s5")).toBeUndefined();
  });

  it("uses doneFailureCode when finalisation throws", async () => {
    const session = createFakeSession();
    const output = createOutput();
    driveAcpStream({
      session,
      owner: "apply",
      registryKey: "s6",
      output,
      logTag: "test",
      start: async () => {},
      hooks: {
        persistMessage: async () => {},
        doneFailureCode: IpcErrorCodes.APPLY_RUN_PERSIST_FAILED,
        onDone: async () => {
          throw new Error("disk full");
        },
      },
    });

    session.emit("event", { kind: "done", totalTokens: 1 } satisfies SessionEvent);
    await flush();

    expect(output.done).toEqual([]);
    expect(output.errors).toEqual([
      { code: IpcErrorCodes.APPLY_RUN_PERSIST_FAILED, message: "disk full" },
    ]);
  });
});
