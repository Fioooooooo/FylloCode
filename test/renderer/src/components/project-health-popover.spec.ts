import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import ProjectHealthPopover from "@renderer/components/layout/ProjectHealthPopover.vue";
import { useChatStore } from "@renderer/stores/session/chat";
import { useWorkspaceStore } from "@renderer/stores/workspace/workspace";
import { useSessionStore } from "@renderer/stores/session/session";
import type { WorkspaceInfo } from "@shared/types/workspace";
import { workspaceInfo } from "../fixtures/workspace";

const routerPush = vi.fn();
const toastAdd = vi.fn();

vi.mock("vue-router", () => ({
  useRouter: () => ({
    push: routerPush,
  }),
}));

vi.mock("@nuxt/ui/composables", async () => {
  const actual = await vi.importActual<object>("@nuxt/ui/composables");
  return {
    ...actual,
    useToast: vi.fn(() => ({ add: toastAdd })),
  };
});

const popoverStub = {
  props: ["open", "portal", "content", "ui"],
  emits: ["update:open"],
  template: `
    <div :data-ui-content="ui?.content">
      <slot />
      <slot v-if="open" name="content" />
    </div>
  `,
};

function makeProject(healthScore?: number): WorkspaceInfo {
  return workspaceInfo({
    id: "project-1",
    name: "Project 1",
    folderPath: "/tmp/project-1",
    healthScore,
    createdAt: new Date("2026-04-30T08:00:00.000Z"),
    lastOpenedAt: new Date("2026-04-30T08:00:00.000Z"),
  });
}

function mountPopover(project: WorkspaceInfo | null = makeProject()): ReturnType<typeof mount> {
  const workspaceStore = useWorkspaceStore();
  workspaceStore.currentWorkspace = project;

  const sessionStore = useSessionStore();
  sessionStore.draftAgentId = "claude-code";

  return mount(ProjectHealthPopover, {
    global: {
      stubs: {
        UPopover: popoverStub,
        Popover: popoverStub,
      },
    },
  });
}

describe("ProjectHealthPopover", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    routerPush.mockResolvedValue(undefined);
  });

  it("renders nothing without an active project", () => {
    const wrapper = mountPopover(null);

    expect(wrapper.find('[data-test="project-health-button"]').exists()).toBe(false);
  });

  it("maps healthScore to muted, orange, and green icon classes", async () => {
    const wrapper = mountPopover(makeProject());
    expect(wrapper.get('[data-test="project-health-icon"]').classes()).toContain("text-muted");

    const workspaceStore = useWorkspaceStore();
    workspaceStore.currentWorkspace = makeProject(20);
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[data-test="project-health-icon"]').classes()).toContain("text-orange-500");

    workspaceStore.currentWorkspace = makeProject(60);
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[data-test="project-health-icon"]').classes()).toContain("text-green-500");
  });

  it("opens popover immediately and keeps it open when refresh fails", async () => {
    const wrapper = mountPopover(makeProject(20));
    const workspaceStore = useWorkspaceStore();
    vi.spyOn(workspaceStore, "refreshCurrentWorkspace").mockRejectedValue(new Error("failed"));

    await wrapper.get('[data-test="project-health-button"]').trigger("click");

    expect(wrapper.get('[data-test="project-health-status"]').text()).toContain("20 分");
    expect(workspaceStore.refreshCurrentWorkspace).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(wrapper.find('[data-test="project-health-status"]').exists()).toBe(true);
  });

  it("updates popover copy after refresh succeeds", async () => {
    const wrapper = mountPopover(makeProject(20));
    const workspaceStore = useWorkspaceStore();
    vi.spyOn(workspaceStore, "refreshCurrentWorkspace").mockImplementation(async () => {
      workspaceStore.currentWorkspace = makeProject(75);
    });

    await wrapper.get('[data-test="project-health-button"]').trigger("click");
    await Promise.resolve();
    await wrapper.vm.$nextTick();

    expect(wrapper.get('[data-test="project-health-status"]').text()).toContain("75 分");
    expect(wrapper.get('[data-test="project-health-icon"]').classes()).toContain("text-green-500");
  });

  it("delegates health check to chatStore.sendMessage with reminder before prompt", async () => {
    const wrapper = mountPopover(makeProject());
    const sessionStore = useSessionStore();
    const chatStore = useChatStore();
    const beginDraftSession = vi.spyOn(sessionStore, "beginDraftSession");
    const sendMessage = vi.spyOn(chatStore, "sendMessage").mockResolvedValue(true);

    await wrapper.get('[data-test="project-health-button"]').trigger("click");
    await wrapper.get('[data-test="project-health-start"]').trigger("click");
    await flushPromises();

    expect(beginDraftSession).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledTimes(1);

    const parts = sendMessage.mock.calls[0]?.[0] ?? [];
    expect(parts).toHaveLength(2);
    expect(parts[0]).toEqual(
      expect.objectContaining({
        type: "text",
        text: expect.stringContaining("<system-reminder>"),
      })
    );
    expect(parts[1]).toEqual({
      type: "text",
      text: "帮我根据当前 Project 的技术栈检查：静态约束、测试约束、流程约束的配置情况并完善",
    });
    expect(routerPush).toHaveBeenCalledWith("/chat");
  });

  it("uses Workspace terminology for a collection even with one Project", async () => {
    const wrapper = mountPopover(
      workspaceInfo({
        id: "workspace-1",
        name: "Workspace 1",
        folderPath: "/tmp/project-1",
        kind: "collection",
      })
    );

    await wrapper.get('[data-test="project-health-button"]').trigger("click");

    expect(wrapper.get('[data-test="project-health-status"]').text()).toContain(
      "当前 Workspace 尚未进行健康检查"
    );
    expect(wrapper.get('[data-test="project-health-button"]').attributes("aria-label")).toBe(
      "Workspace 健康度"
    );
  });

  it("toasts when sendMessage rejects", async () => {
    const wrapper = mountPopover(makeProject());
    const chatStore = useChatStore();
    vi.spyOn(chatStore, "sendMessage").mockRejectedValue(new Error("network down"));

    await wrapper.get('[data-test="project-health-button"]').trigger("click");
    await wrapper.get('[data-test="project-health-start"]').trigger("click");
    await flushPromises();

    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "健康检查启动失败",
        description: "network down",
        color: "error",
      })
    );
    expect(routerPush).not.toHaveBeenCalled();
  });
});
