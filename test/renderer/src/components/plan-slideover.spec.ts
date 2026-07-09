import { flushPromises, mount, type DOMWrapper, type VueWrapper } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PlanSlideover from "@renderer/components/chat/plan/PlanSlideover.vue";

const readPlanMock = vi.hoisted(() => vi.fn());
const savePlanBodyMock = vi.hoisted(() => vi.fn());
const approvePlanMock = vi.hoisted(() => vi.fn());
const sendMessageMock = vi.hoisted(() => vi.fn());
const activeSessionId = vi.hoisted(() => ({ value: "session-1" as string | null }));

vi.mock("@renderer/stores/insight/lineage", () => ({
  useLineageStore: () => ({
    readPlan: readPlanMock,
    savePlanBody: savePlanBodyMock,
    approvePlan: approvePlanMock,
  }),
}));

vi.mock("@renderer/stores/workspace/project", () => ({
  useProjectStore: () => ({
    currentProject: { id: "project-1" },
  }),
}));

vi.mock("@renderer/stores/session/session", () => ({
  useSessionStore: () => ({
    get activeSessionId() {
      return activeSessionId.value;
    },
  }),
}));

vi.mock("@renderer/stores/session/chat", () => ({
  useChatStore: () => ({
    sendMessage: sendMessageMock,
  }),
}));

function buttonByText(wrapper: VueWrapper, text: string): DOMWrapper<HTMLButtonElement> {
  const button = wrapper.findAll("button").find((node) => node.text() === text);
  if (!button) {
    throw new Error(`Missing button: ${text}`);
  }
  return button as DOMWrapper<HTMLButtonElement>;
}

async function mountPlan(): Promise<VueWrapper> {
  const wrapper = mount(PlanSlideover, {
    props: {
      sessionId: "session-1",
      slug: "2026-06-29-plan-a",
      mode: "review",
    },
  });
  await flushPromises();
  return wrapper;
}

describe("PlanSlideover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activeSessionId.value = "session-1";
    readPlanMock.mockResolvedValue({
      ok: true,
      data: {
        slug: "2026-06-29-plan-a",
        goal: "Need review",
        createdAt: "2026-06-29T00:00:00.000Z",
        status: "draft",
        body: "Initial body",
      },
    });
    savePlanBodyMock.mockImplementation((_projectId, input) =>
      Promise.resolve({
        ok: true,
        data: {
          slug: input.slug,
          goal: "Need review",
          createdAt: "2026-06-29T00:00:00.000Z",
          status: "draft",
          body: input.body,
        },
      })
    );
    approvePlanMock.mockResolvedValue({
      ok: true,
      data: {
        slug: "2026-06-29-plan-a",
        goal: "Need review",
        createdAt: "2026-06-29T00:00:00.000Z",
        status: "approved",
        body: "Edited body",
      },
    });
    sendMessageMock.mockResolvedValue(undefined);
  });

  it("loads and dismisses without approving", async () => {
    const wrapper = await mountPlan();

    expect(readPlanMock).toHaveBeenCalledWith("project-1", {
      sessionId: "session-1",
      slug: "2026-06-29-plan-a",
    });
    expect(
      (wrapper.get('[data-test="plan-body-editor"]').element as HTMLTextAreaElement).value
    ).toBe("Initial body");

    await buttonByText(wrapper, "关闭").trigger("click");
    await flushPromises();

    expect(approvePlanMock).not.toHaveBeenCalled();
    expect(wrapper.emitted("close")?.[0]).toEqual([{ status: "dismissed" }]);
  });

  it("saves latest body, approves, then sends confirmation message", async () => {
    const wrapper = await mountPlan();

    await wrapper.get('[data-test="plan-body-editor"]').setValue("Edited body");
    await buttonByText(wrapper, "确认").trigger("click");
    await flushPromises();

    expect(savePlanBodyMock).toHaveBeenCalledWith("project-1", {
      sessionId: "session-1",
      slug: "2026-06-29-plan-a",
      body: "Edited body",
    });
    expect(approvePlanMock).toHaveBeenCalledWith("project-1", {
      sessionId: "session-1",
      slug: "2026-06-29-plan-a",
    });
    expect(sendMessageMock).toHaveBeenCalledWith([
      { type: "text", text: "我已确认规划方案：2026-06-29-plan-a" },
    ]);
    expect(wrapper.emitted("close")?.[0]).toEqual([{ status: "approved" }]);
  });

  it("fails approval when the active session changed", async () => {
    const wrapper = await mountPlan();
    activeSessionId.value = "session-2";

    await buttonByText(wrapper, "确认").trigger("click");
    await flushPromises();

    expect(approvePlanMock).not.toHaveBeenCalled();
    expect(sendMessageMock).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("当前聊天会话已切换");
  });
});
