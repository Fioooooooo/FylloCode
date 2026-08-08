import { beforeEach, describe, expect, it } from "vitest";
import { ChatTurnGate } from "@main/services/session/chat/chat-turn-gate";

describe("ChatTurnGate", () => {
  let gate: ChatTurnGate;

  beforeEach(() => {
    gate = new ChatTurnGate();
  });

  it("同 Workspace/Session 串行且 release 幂等", () => {
    const user = gate.tryAcquire("workspace-1", "session-1", "user");
    expect(user).not.toBeNull();
    expect(gate.tryAcquire("workspace-1", "session-1", "notification")).toBeNull();
    user?.release();
    user?.release();
    expect(gate.tryAcquire("workspace-1", "session-1", "notification")).not.toBeNull();
  });

  it("不同 Session 和 Workspace 可并行", () => {
    expect(gate.tryAcquire("workspace-1", "session-1", "user")).not.toBeNull();
    expect(gate.tryAcquire("workspace-1", "session-2", "notification")).not.toBeNull();
    expect(gate.tryAcquire("workspace-2", "session-1", "notification")).not.toBeNull();
  });
});
