import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import type { Session } from "@shared/types/chat";
import { getSessionAttention } from "@renderer/features/fyllo-action/model/session-attention";
import { useSessionAttention } from "@renderer/features/fyllo-action/application/useSessionAttention";
import SessionItem from "@renderer/components/chat/SessionItem.vue";

vi.mock("vue-router", () => ({
  useRoute: () => ({ path: "/chat" }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@renderer/stores", () => ({
  useSessionStore: () => ({
    activeSessionId: null,
    taskInfoBySessionId: new Map(),
  }),
  useAcpAgentsStore: () => ({
    icons: {},
  }),
}));

vi.mock("@renderer/composables/useConfirmDialog", () => ({
  useConfirmDialog: () => () => Promise.resolve(false),
}));

vi.mock("@renderer/composables/useOpenChatSession", () => ({
  useOpenChatSession: () => ({
    openChatSession: vi.fn(),
  }),
}));

const UTooltipStub = {
  props: ["text", "delayDuration"],
  template: '<div data-test="session-attention-tooltip"><slot /></div>',
};

const UBadgeStub = {
  props: ["color", "variant", "size", "ariaLabel"],
  template: '<span data-test="session-attention-badge" :aria-label="ariaLabel"><slot /></span>',
};

const UIconStub = {
  props: ["name"],
  template: '<span data-test="ui-icon" :data-icon="name" />',
};

const UButtonStub = {
  props: ["variant", "color", "size"],
  template: "<button><slot /></button>",
};

const UPopoverStub = {
  template: '<div><slot name="default" /><slot name="content" /></div>',
};

const UDropdownMenuStub = {
  props: ["items"],
  template: "<div><slot /></div>",
};

const CustomAgentIconStub = {
  template: '<div data-test="session-agent-icon-fallback" />',
};

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "session-1",
    projectId: "project-1",
    agentId: "claude-code",
    title: "Session",
    status: "ended",
    turnCount: 1,
    tokenUsage: { used: 0, size: 0 },
    createdAt: new Date(),
    updatedAt: new Date(),
    messages: [],
    ...overrides,
  };
}

function mountSessionItem(session: Session) {
  return mount(SessionItem, {
    props: { session },
    global: {
      stubs: {
        UTooltip: UTooltipStub,
        Tooltip: UTooltipStub,
        UBadge: UBadgeStub,
        Badge: UBadgeStub,
        UIcon: UIconStub,
        UButton: UButtonStub,
        UPopover: UPopoverStub,
        UDropdownMenu: UDropdownMenuStub,
        CustomAgentIcon: CustomAgentIconStub,
      },
    },
  });
}

describe("getSessionAttention", () => {
  it("returns 0 for null or undefined sessions", () => {
    expect(getSessionAttention(null)).toBe(0);
    expect(getSessionAttention(undefined)).toBe(0);
  });

  it("returns 0 when there are no action states or pending actions", () => {
    expect(getSessionAttention(makeSession())).toBe(0);
  });

  it("counts persisted ready and failed action states", () => {
    const session = makeSession({
      actionStates: {
        "chat:session-1:0:0:0": {
          type: "task.create",
          status: "ready",
          revision: 1,
          updatedAt: new Date().toISOString(),
        },
        "chat:session-1:0:0:1": {
          type: "plan.create",
          status: "failed",
          revision: 2,
          updatedAt: new Date().toISOString(),
          error: "boom",
        },
        "chat:session-1:0:0:2": {
          type: "knowledge.flag",
          status: "succeeded",
          revision: 1,
          updatedAt: new Date().toISOString(),
        },
      },
    });

    expect(getSessionAttention(session)).toBe(2);
  });

  it("counts pending actions parsed from assistant messages", () => {
    const session = makeSession({
      messages: [
        {
          id: "msg-1",
          role: "assistant",
          parts: [
            {
              type: "text",
              text: '<fyllo-action type="task.create">{"title":"x"}</fyllo-action>',
            },
          ],
          metadata: { sessionId: "session-1", createdAt: new Date() },
        },
      ],
    });

    expect(getSessionAttention(session)).toBe(1);
  });

  it("does not double-count actions that already have a persisted state", () => {
    const session = makeSession({
      actionStates: {
        "chat:session-1:0:0:0": {
          type: "task.create",
          status: "ready",
          revision: 1,
          updatedAt: new Date().toISOString(),
        },
      },
      messages: [
        {
          id: "msg-1",
          role: "assistant",
          parts: [
            {
              type: "text",
              text: '<fyllo-action type="task.create">{"title":"x"}</fyllo-action>',
            },
          ],
          metadata: { sessionId: "session-1", createdAt: new Date() },
        },
      ],
    });

    expect(getSessionAttention(session)).toBe(1);
  });
});

describe("useSessionAttention", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("exposes attentionCount, displayCount and hasAttention", () => {
    const session = makeSession({
      actionStates: {
        "chat:session-1:0:0:0": {
          type: "task.create",
          status: "ready",
          revision: 1,
          updatedAt: new Date().toISOString(),
        },
      },
    });

    const { attentionCount, displayCount, hasAttention } = useSessionAttention(session);

    expect(attentionCount.value).toBe(1);
    expect(displayCount.value).toBe("1");
    expect(hasAttention.value).toBe(true);
  });

  it("caps display count at 99+", () => {
    const session = makeSession({
      actionStates: Object.fromEntries(
        Array.from({ length: 105 }, (_, index) => [
          `chat:session-1:0:0:${index}`,
          {
            type: "task.create" as const,
            status: "ready" as const,
            revision: 1,
            updatedAt: new Date().toISOString(),
          },
        ])
      ),
    });

    const { displayCount, attentionCount } = useSessionAttention(session);

    expect(attentionCount.value).toBe(105);
    expect(displayCount.value).toBe("99+");
  });
});

describe("SessionItem attention badge", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("does not render the attention badge when there is no attention", () => {
    const wrapper = mountSessionItem(makeSession());

    expect(wrapper.find('[data-test="session-attention-badge"]').exists()).toBe(false);
  });

  it("renders the attention count and tooltip when there are pending actions", () => {
    const wrapper = mountSessionItem(
      makeSession({
        actionStates: {
          "chat:session-1:0:0:0": {
            type: "task.create",
            status: "ready",
            revision: 1,
            updatedAt: new Date().toISOString(),
          },
        },
      })
    );

    const badge = wrapper.find('[data-test="session-attention-badge"]');
    expect(badge.exists()).toBe(true);
    expect(wrapper.find('[data-test="session-attention-count"]').text()).toBe("1");
    expect(badge.attributes("aria-label")).toBe("该会话有 1 个待处理操作");
    expect(wrapper.find('[data-test="session-attention-tooltip"]').exists()).toBe(true);
  });

  it("renders 99+ when attention count exceeds 99", () => {
    const wrapper = mountSessionItem(
      makeSession({
        actionStates: Object.fromEntries(
          Array.from({ length: 105 }, (_, index) => [
            `chat:session-1:0:0:${index}`,
            {
              type: "task.create" as const,
              status: "ready" as const,
              revision: 1,
              updatedAt: new Date().toISOString(),
            },
          ])
        ),
      })
    );

    expect(wrapper.find('[data-test="session-attention-count"]').text()).toBe("99+");
  });

  it("keeps the running indicator alongside the attention badge", () => {
    const wrapper = mountSessionItem(
      makeSession({
        status: "running",
        actionStates: {
          "chat:session-1:0:0:0": {
            type: "task.create",
            status: "ready",
            revision: 1,
            updatedAt: new Date().toISOString(),
          },
        },
      })
    );

    expect(wrapper.find('[data-test="session-running-indicator"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="session-attention-badge"]').exists()).toBe(true);
  });
});
