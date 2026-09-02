import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  disposeSessionRegistry,
  resetSessionRegistryForTests,
  sessionRegistry,
  workflowSessionRegistryKey,
} from "@main/services/session/chat/session-registry";
import type { AcpSession } from "@main/services/session/chat/acp-session";

// Minimal fake AcpSession: only `.cancel()` is used by the registry.
function fakeSession(): AcpSession {
  const cancel = vi.fn();
  return { cancel } as unknown as AcpSession;
}

beforeEach(() => {
  resetSessionRegistryForTests();
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

  it("cancelWorkspace() cancels only sessions whose key belongs to the Workspace", () => {
    const projectAChat = fakeSession();
    const projectAApply = fakeSession();
    const projectBChat = fakeSession();
    sessionRegistry.register("chat", "workspace-a:session-1", projectAChat);
    sessionRegistry.register("apply", "workspace-a:run-1", projectAApply);
    sessionRegistry.register("chat", "workspace-b:session-1", projectBChat);

    sessionRegistry.cancelWorkspace("workspace-a");

    expect(projectAChat.cancel).toHaveBeenCalled();
    expect(projectAApply.cancel).toHaveBeenCalled();
    expect(projectBChat.cancel).not.toHaveBeenCalled();
    expect(sessionRegistry.get("chat", "workspace-b:session-1")).toBe(projectBChat);
  });

  it("window cleanup 保留 app-owned Session", () => {
    const userChat = fakeSession();
    const notificationChat = fakeSession();
    const spawn = fakeSession();
    sessionRegistry.register("chat", "workspace-a:user", userChat, "window");
    sessionRegistry.register("chat", "workspace-a:notification", notificationChat, "app");
    sessionRegistry.register("spawn", "workspace-a:parent:spawn", spawn, "app");

    sessionRegistry.cancelWindowOwnedWorkspace("workspace-a");

    expect(userChat.cancel).toHaveBeenCalledOnce();
    expect(notificationChat.cancel).not.toHaveBeenCalled();
    expect(spawn.cancel).not.toHaveBeenCalled();
  });

  it("拒绝同 owner/key 覆盖活跃 Session", () => {
    sessionRegistry.register("chat", "workspace-a:session", fakeSession());
    expect(() =>
      sessionRegistry.register("chat", "workspace-a:session", fakeSession())
    ).toThrowError(/already registered/);
  });

  it("cancels and lists spawned turns by their exact parent Session", () => {
    const parentAFirst = fakeSession();
    const parentASecond = fakeSession();
    const parentB = fakeSession();
    sessionRegistry.register("spawn", "workspace-a:parent-a:spawn-1", parentAFirst);
    sessionRegistry.register("spawn", "workspace-a:parent-a:spawn-2", parentASecond);
    sessionRegistry.register("spawn", "workspace-a:parent-b:spawn-1", parentB);

    expect(sessionRegistry.listSpawnedByParent("workspace-a", "parent-a")).toEqual([
      "spawn-1",
      "spawn-2",
    ]);
    sessionRegistry.cancelSpawnedByParent("workspace-a", "parent-a");

    expect(parentAFirst.cancel).toHaveBeenCalledOnce();
    expect(parentASecond.cancel).toHaveBeenCalledOnce();
    expect(parentB.cancel).not.toHaveBeenCalled();
    expect(sessionRegistry.listSpawnedByParent("workspace-a", "parent-a")).toEqual([]);
  });

  it("keeps workflow fresh sessions in their own owner namespace and cancels one Run only", () => {
    const workflowSession = fakeSession();
    const otherWorkflowRun = fakeSession();
    const spawnedSession = fakeSession();
    const workflowKey = workflowSessionRegistryKey(
      "workspace-a",
      "workflow-1",
      "run-1",
      "workflow-session-1"
    );
    const otherRunKey = workflowSessionRegistryKey(
      "workspace-a",
      "workflow-1",
      "run-2",
      "workflow-session-2"
    );
    sessionRegistry.register("workflow", workflowKey, workflowSession);
    sessionRegistry.register("workflow", otherRunKey, otherWorkflowRun);
    sessionRegistry.register("spawn", "workspace-a:parent:spawn-1", spawnedSession);

    expect(sessionRegistry.listWorkflowRun("workspace-a", "workflow-1", "run-1")).toEqual([
      "workflow-session-1",
    ]);
    expect(sessionRegistry.get("spawn", "workspace-a:parent:spawn-1")).toBe(spawnedSession);

    sessionRegistry.cancelWorkflowRun("workspace-a", "workflow-1", "run-1");

    expect(workflowSession.cancel).toHaveBeenCalledOnce();
    expect(otherWorkflowRun.cancel).not.toHaveBeenCalled();
    expect(spawnedSession.cancel).not.toHaveBeenCalled();
    expect(sessionRegistry.get("workflow", workflowKey)).toBeUndefined();
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

  it("cancels and rejects late session registration after shutdown begins", () => {
    const active = fakeSession();
    const late = fakeSession();
    sessionRegistry.register("chat", "active", active);

    disposeSessionRegistry();
    sessionRegistry.register("chat", "late", late);

    expect(active.cancel).toHaveBeenCalledOnce();
    expect(late.cancel).toHaveBeenCalledOnce();
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
