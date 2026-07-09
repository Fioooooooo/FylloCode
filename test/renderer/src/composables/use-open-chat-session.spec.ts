import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOpenChatSession } from "@renderer/composables/useOpenChatSession";

const { nextTickMock, routeState } = vi.hoisted(() => ({
  nextTickMock: vi.fn(async () => undefined),
  routeState: { path: "/task" },
}));

const pushMock = vi.fn();
const resetChatStateMock = vi.fn();
const selectSessionMock = vi.fn();

vi.mock("vue-router", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
  useRoute: () => ({
    get path() {
      return routeState.path;
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

vi.mock("vue", async (importOriginal) => {
  const actual = await importOriginal<typeof import("vue")>();
  return {
    ...actual,
    nextTick: nextTickMock,
  };
});

describe("useOpenChatSession", () => {
  beforeEach(() => {
    pushMock.mockReset();
    resetChatStateMock.mockReset();
    selectSessionMock.mockReset();
    nextTickMock.mockReset();
    nextTickMock.mockResolvedValue(undefined);
    routeState.path = "/task";
  });

  it("navigates to /chat before selecting the session when not already on /chat", async () => {
    const { openChatSession } = useOpenChatSession();

    await openChatSession("session-1");

    expect(resetChatStateMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith("/chat");
    expect(nextTickMock).toHaveBeenCalledTimes(1);
    expect(selectSessionMock).toHaveBeenCalledWith("session-1");
    expect(pushMock).toHaveBeenCalledBefore(nextTickMock);
    expect(nextTickMock).toHaveBeenCalledBefore(selectSessionMock);
  });

  it("skips navigation when already on /chat", async () => {
    routeState.path = "/chat";
    const { openChatSession } = useOpenChatSession();

    await openChatSession("session-2");

    expect(resetChatStateMock).toHaveBeenCalledTimes(1);
    expect(pushMock).not.toHaveBeenCalled();
    expect(nextTickMock).toHaveBeenCalledTimes(1);
    expect(selectSessionMock).toHaveBeenCalledWith("session-2");
  });
});
