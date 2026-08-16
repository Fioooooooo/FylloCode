import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOpenChatSession } from "@renderer/composables/useOpenChatSession";

const { routeState } = vi.hoisted(() => ({
  routeState: { sessionId: null as string | null },
}));

const pushMock = vi.fn();
const resetChatStateMock = vi.fn();
const selectSessionMock = vi.fn();

vi.mock("vue-router", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
  useRoute: () => ({
    get params() {
      return { sessionId: routeState.sessionId };
    },
  }),
}));

vi.mock("@renderer/stores/session/chat", () => ({
  useChatStore: () => ({
    resetChatState: resetChatStateMock,
  }),
}));

vi.mock("@renderer/stores/session/session", () => ({
  useSessionStore: () => ({
    selectSession: selectSessionMock,
  }),
}));

describe("useOpenChatSession", () => {
  beforeEach(() => {
    pushMock.mockReset();
    resetChatStateMock.mockReset();
    selectSessionMock.mockReset();
    routeState.sessionId = null;
  });

  it("navigates directly to the target session subroute", async () => {
    const { openChatSession } = useOpenChatSession();

    await openChatSession("session-1");

    expect(resetChatStateMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith("/chat/session-1");
    expect(selectSessionMock).toHaveBeenCalledWith("session-1");
    expect(pushMock).toHaveBeenCalledBefore(selectSessionMock);
  });

  it("skips navigation when the target session is already open", async () => {
    routeState.sessionId = "session-2";
    const { openChatSession } = useOpenChatSession();

    await openChatSession("session-2");

    expect(resetChatStateMock).toHaveBeenCalledTimes(1);
    expect(pushMock).not.toHaveBeenCalled();
    expect(selectSessionMock).toHaveBeenCalledWith("session-2");
  });
});
