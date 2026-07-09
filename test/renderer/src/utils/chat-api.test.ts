import { beforeEach, describe, expect, it, vi } from "vitest";
import { chatApi } from "@renderer/api/session/chat";

const chatBridge = {
  listSessions: vi.fn(),
  createSession: vi.fn(),
  updateSession: vi.fn(),
  removeSession: vi.fn(),
  loadMessages: vi.fn(),
  persistMessage: vi.fn(),
  streamMessage: vi.fn(),
  saveAttachment: vi.fn(),
  readAttachmentDataUrl: vi.fn(),
  setActionState: vi.fn(),
};

describe("chatApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "api", {
      configurable: true,
      value: {
        session: {
          chat: chatBridge,
        },
      },
    });
  });

  it("forwards readAttachmentDataUrl to the preload bridge", async () => {
    chatBridge.readAttachmentDataUrl.mockResolvedValue({
      ok: true,
      data: { dataUrl: "data:image/png;base64,AAAA" },
    });

    await chatApi.readAttachmentDataUrl("file:///tmp/%E6%88%AA%E5%9B%BE%201.png", "image/png");

    expect(chatBridge.readAttachmentDataUrl).toHaveBeenCalledWith(
      "file:///tmp/%E6%88%AA%E5%9B%BE%201.png",
      "image/png"
    );
  });

  it("forwards setActionState to the preload bridge", async () => {
    chatBridge.setActionState.mockResolvedValue({
      ok: true,
      data: { actionStates: {} },
    });
    const state = {
      type: "task.create" as const,
      status: "cancelled" as const,
      updatedAt: "2026-06-08T00:00:00.000Z",
    };

    await chatApi.setActionState({
      projectId: "project-1",
      sessionId: "session-1",
      actionId: "chat:session-1:0:0:0",
      state,
    });

    expect(chatBridge.setActionState).toHaveBeenCalledWith({
      projectId: "project-1",
      sessionId: "session-1",
      actionId: "chat:session-1:0:0:0",
      state,
    });
  });
});
