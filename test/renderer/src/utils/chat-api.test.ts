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
  listSpawnNotifications: vi.fn(),
  dispatchSpawnNotification: vi.fn(),
  onSpawnNotificationsWake: vi.fn(),
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

    await chatApi.readAttachmentDataUrl(
      "workspace-1",
      "session-1",
      "11111111-1111-4111-8111-111111111111",
      "image/png"
    );

    expect(chatBridge.readAttachmentDataUrl).toHaveBeenCalledWith(
      "workspace-1",
      "session-1",
      "11111111-1111-4111-8111-111111111111",
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

  it("forwards owner-safe spawn notification operations", async () => {
    chatBridge.listSpawnNotifications.mockResolvedValue({ ok: true, data: [] });
    chatBridge.dispatchSpawnNotification.mockResolvedValue({
      ok: true,
      data: { status: "not_pending" },
    });
    const handler = vi.fn();
    const cleanup = vi.fn();
    chatBridge.onSpawnNotificationsWake.mockReturnValue(cleanup);

    await chatApi.listSpawnNotifications("workspace-1");
    await chatApi.dispatchSpawnNotification("workspace-1", "notification-1");
    expect(chatApi.onSpawnNotificationsWake(handler)).toBe(cleanup);

    expect(chatBridge.listSpawnNotifications).toHaveBeenCalledWith("workspace-1");
    expect(chatBridge.dispatchSpawnNotification).toHaveBeenCalledWith(
      "workspace-1",
      "notification-1"
    );
    expect(chatBridge.onSpawnNotificationsWake).toHaveBeenCalledWith(handler);
  });
});
