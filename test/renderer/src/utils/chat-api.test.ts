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

  it("forwards pin state through updateSession", async () => {
    chatBridge.updateSession.mockResolvedValue({ ok: true, data: {} });

    await chatApi.updateSession("session-1", { isPinned: true }, "project-1");

    expect(chatBridge.updateSession).toHaveBeenCalledWith(
      "session-1",
      { isPinned: true },
      "project-1"
    );
  });
});
