import { describe, expect, it, beforeEach, vi } from "vitest";
import { sessionRegistry } from "@main/services/chat/session-registry";
import type { AcpSession } from "@main/services/chat/acp-session";

// Mock lifecycle so registering a disposable during module load is a no-op.
vi.mock("@main/bootstrap/lifecycle", () => ({
  registerDisposable: vi.fn(),
}));

// Minimal fake AcpSession: only `.cancel()` is used by the registry.
function fakeSession(): AcpSession {
  const cancel = vi.fn();
  return { cancel } as unknown as AcpSession;
}

beforeEach(() => {
  sessionRegistry.cancelAll();
});

describe("sessionRegistry", () => {
  it("isolates owners by key space", () => {
    const a = fakeSession();
    const b = fakeSession();
    sessionRegistry.register("chat", "k1", a);
    sessionRegistry.register("apply", "k1", b);

    expect(sessionRegistry.get("chat", "k1")).toBe(a);
    expect(sessionRegistry.get("apply", "k1")).toBe(b);
    expect(sessionRegistry.size()).toBe(2);
  });

  it("cancel() removes the entry and calls session.cancel exactly once", () => {
    const s = fakeSession();
    sessionRegistry.register("chat", "k", s);

    sessionRegistry.cancel("chat", "k");
    expect(s.cancel).toHaveBeenCalledTimes(1);
    expect(sessionRegistry.get("chat", "k")).toBeUndefined();

    // Second cancel is a no-op.
    sessionRegistry.cancel("chat", "k");
    expect(s.cancel).toHaveBeenCalledTimes(1);
  });

  it("unregister() drops an entry without cancelling", () => {
    const s = fakeSession();
    sessionRegistry.register("chat", "k", s);
    sessionRegistry.unregister("chat", "k");
    expect(s.cancel).not.toHaveBeenCalled();
    expect(sessionRegistry.get("chat", "k")).toBeUndefined();
  });

  it("cancelByOwner() cancels only the specified owner", () => {
    const chatA = fakeSession();
    const chatB = fakeSession();
    const applyA = fakeSession();
    sessionRegistry.register("chat", "a", chatA);
    sessionRegistry.register("chat", "b", chatB);
    sessionRegistry.register("apply", "a", applyA);

    sessionRegistry.cancelByOwner("chat");

    expect(chatA.cancel).toHaveBeenCalled();
    expect(chatB.cancel).toHaveBeenCalled();
    expect(applyA.cancel).not.toHaveBeenCalled();
    expect(sessionRegistry.get("chat", "a")).toBeUndefined();
    expect(sessionRegistry.get("apply", "a")).toBe(applyA);
  });

  it("cancelAll() cancels across every owner and empties the registry", () => {
    const chat = fakeSession();
    const apply = fakeSession();
    const archive = fakeSession();
    sessionRegistry.register("chat", "x", chat);
    sessionRegistry.register("apply", "x", apply);
    sessionRegistry.register("archive", "x", archive);

    sessionRegistry.cancelAll();

    expect(chat.cancel).toHaveBeenCalled();
    expect(apply.cancel).toHaveBeenCalled();
    expect(archive.cancel).toHaveBeenCalled();
    expect(sessionRegistry.size()).toBe(0);
  });

  it("cancelByOwner keeps iterating after one cancel throws", () => {
    const throwing = {
      cancel: vi.fn(() => {
        throw new Error("boom");
      }),
    } as unknown as AcpSession;
    const fine = fakeSession();
    sessionRegistry.register("chat", "t", throwing);
    sessionRegistry.register("chat", "f", fine);

    expect(() => sessionRegistry.cancelByOwner("chat")).not.toThrow();
    expect(fine.cancel).toHaveBeenCalled();
    expect(sessionRegistry.size()).toBe(0);
  });
});
