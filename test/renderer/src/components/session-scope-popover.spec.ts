import { computed, defineComponent, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import SessionScopePopover from "@renderer/components/chat/SessionScopePopover.vue";
import type { Session } from "@shared/types/chat";
import type { SessionScopeDiff } from "@renderer/stores/session/session";

const activeSessionRef = ref<Session | null>(null);
const activeSessionScopeDiffRef = ref<SessionScopeDiff | null>(null);
const currentWorkspaceKindRef = ref<"folder" | "collection">("collection");

vi.mock("@renderer/stores", () => ({
  useSessionStore: () => ({
    activeSession: computed(() => activeSessionRef.value),
    activeSessionScopeDiff: computed(() => activeSessionScopeDiffRef.value),
  }),
  useWorkspaceStore: () => ({
    get currentWorkspace() {
      return { kind: currentWorkspaceKindRef.value };
    },
  }),
}));

vi.mock("pinia", async (importOriginal) => {
  const actual = await importOriginal<typeof import("pinia")>();
  return {
    ...actual,
    storeToRefs: () => ({
      activeSession: computed(() => activeSessionRef.value),
      activeSessionScopeDiff: computed(() => activeSessionScopeDiffRef.value),
    }),
  };
});

const popoverStub = defineComponent({
  props: {
    open: { type: Boolean, default: false },
    content: { type: Object, default: undefined },
    ui: { type: Object, default: undefined },
  },
  emits: ["update:open"],
  template: `
    <div data-test="popover-stub" :data-ui-content="ui?.content">
      <div data-test="popover-trigger-shell" @click="$emit('update:open', !open)"><slot /></div>
      <div v-if="open" data-test="popover-content"><slot name="content" /></div>
    </div>
  `,
});

function scopedSession(folderCount = 2): Session {
  const folders = Array.from({ length: folderCount }, (_, index) => {
    if (index === 0) {
      return { folderId: "folder-app", folderName: "App", folderPath: "/repos/app" };
    }
    if (index === 1) {
      return { folderId: "folder-api", folderName: "API", folderPath: "/repos/api" };
    }
    return {
      folderId: `folder-${index + 1}`,
      folderName: `Project ${index + 1}`,
      folderPath: `/repos/project-${index + 1}`,
    };
  });

  return {
    id: "session-1",
    workspaceId: "workspace-1",
    agentId: "claude-code",
    sessionMode: "fyllocode",
    title: "Session",
    isPinned: false,
    status: "ended",
    turnCount: 0,
    tokenUsage: { used: 0, size: 0 },
    createdAt: new Date("2026-08-02T00:00:00.000Z"),
    updatedAt: new Date("2026-08-02T00:00:00.000Z"),
    messages: [],
    workspaceSnapshot: {
      workspaceId: "workspace-1",
      workspaceKind: "collection",
      primaryFolderId: "folder-app",
      folders,
      cwd: "/repos/app",
      additionalDirectories: folders.slice(1).map((folder) => folder.folderPath),
    },
  };
}

function emptyDiff(overrides: Partial<SessionScopeDiff> = {}): SessionScopeDiff {
  return {
    currentOnly: [],
    snapshotOnly: [],
    primaryChanged: false,
    nameChanges: [],
    pathChanges: [],
    unavailableFolderIds: [],
    hasChanges: false,
    isStale: false,
    ...overrides,
  };
}

function mountPopover(): ReturnType<typeof mount> {
  return mount(SessionScopePopover, {
    global: {
      stubs: {
        UPopover: popoverStub,
        Popover: popoverStub,
      },
    },
  });
}

describe("SessionScopePopover", () => {
  beforeEach(() => {
    activeSessionRef.value = null;
    activeSessionScopeDiffRef.value = null;
    currentWorkspaceKindRef.value = "collection";
  });

  it("stays hidden when the active Session has no frozen scope", () => {
    const wrapper = mountPopover();

    expect(wrapper.find('[data-test="session-scope-trigger"]').exists()).toBe(false);
  });

  it("opens the frozen Project scope with ordered paths and primary markers", async () => {
    activeSessionRef.value = scopedSession();
    activeSessionScopeDiffRef.value = emptyDiff();
    const wrapper = mountPopover();
    const trigger = wrapper.get('[data-test="session-scope-trigger"]');

    expect(trigger.attributes("title")).toBe("Agent 授权范围");
    expect(trigger.attributes("aria-label")).toBe("Agent 授权范围");
    expect(trigger.attributes("aria-expanded")).toBe("false");
    expect(wrapper.find('[data-icon-name="i-lucide-folder-key"]').exists()).toBe(true);

    await trigger.trigger("click");

    expect(trigger.attributes("aria-expanded")).toBe("true");
    expect(wrapper.get('[data-test="popover-content"]').text()).toContain("Agent 可访问的 Project");
    expect(wrapper.get('[data-test="popover-content"]').text()).toContain(
      "共 2 个 Project · 会话创建时固定"
    );
    expect(
      wrapper.findAll('[data-test="session-scope-project"]').map((item) => item.text())
    ).toEqual(["App/repos/app 主 Project", "API/repos/api"]);
    expect(wrapper.get('[title="App"]').text()).toBe("App");
    expect(wrapper.get('[title="/repos/app"]').text()).toBe("/repos/app");
    expect(wrapper.findAll('[data-test="session-scope-primary-dot"]')).toHaveLength(1);
    expect(wrapper.get('[data-test="session-scope-primary-label"]').text()).toBe("主 Project");
    expect(wrapper.text()).toContain("Workspace 成员变更不会自动更新当前 Session");

    await wrapper.get('[aria-label="关闭授权范围"]').trigger("click");

    expect(wrapper.find('[data-test="popover-content"]').exists()).toBe(false);
    expect(trigger.attributes("aria-expanded")).toBe("false");
  });

  it("keeps 16 Projects in a vertically scrollable single-column list", async () => {
    activeSessionRef.value = scopedSession(16);
    activeSessionScopeDiffRef.value = emptyDiff();
    const wrapper = mountPopover();

    await wrapper.get('[data-test="session-scope-trigger"]').trigger("click");

    const list = wrapper.get('[data-test="session-scope-project-list"]');
    expect(wrapper.get('[data-test="popover-content"]').text()).toContain("共 16 个 Project");
    expect(wrapper.findAll('[data-test="session-scope-project"]')).toHaveLength(16);
    expect(list.classes()).toContain("max-h-72");
    expect(list.classes()).toContain("overflow-y-auto");
    expect(list.classes()).toContain("overflow-x-hidden");
    expect(list.classes()).toContain("overscroll-contain");
    expect(
      wrapper.get('[data-test="session-scope-popover"]').attributes("data-ui-content")
    ).toContain("max-w-[calc(100vw-2rem)]");
  });

  it("surfaces current Workspace differences before opening and inside the Popover", async () => {
    activeSessionRef.value = scopedSession();
    activeSessionScopeDiffRef.value = emptyDiff({
      currentOnly: [
        {
          folderId: "folder-docs",
          folderName: "Docs",
          folderPath: "/repos/docs",
          pathMissing: false,
          isPrimary: false,
        },
      ],
      primaryChanged: true,
      hasChanges: true,
    });
    const wrapper = mountPopover();
    const trigger = wrapper.get('[data-test="session-scope-trigger"]');

    expect(trigger.attributes("aria-label")).toBe("Agent 授权范围：与当前 Workspace 不同");
    expect(
      wrapper
        .get('[data-test="session-scope-trigger-status"] [data-icon-name]')
        .attributes("data-icon-name")
    ).toBe("i-lucide-triangle-alert");

    await trigger.trigger("click");

    expect(wrapper.get('[data-test="session-scope-status"]').text()).toBe("与当前 Workspace 不同");
    expect(wrapper.get('[data-test="session-scope-diff"]').text()).toContain(
      "当前新增 Project：Docs"
    );
    expect(wrapper.get('[data-test="session-scope-diff"]').text()).toContain("主 Project 已变更");
    expect(wrapper.get('[data-test="session-scope-diff"]').text()).toContain(
      "新建 Session 才能获得当前 Project 授权"
    );
  });

  it("explains stale differences without replacing the displayed snapshot", async () => {
    activeSessionRef.value = scopedSession();
    activeSessionScopeDiffRef.value = emptyDiff({
      snapshotOnly: [{ folderId: "folder-api", folderName: "API", folderPath: "/repos/api" }],
      primaryChanged: true,
      nameChanges: [{ folderId: "folder-app", snapshotName: "App", currentName: "Application" }],
      pathChanges: [
        {
          folderId: "folder-app",
          snapshotPath: "/repos/app",
          currentPath: "/repos/application",
        },
      ],
      unavailableFolderIds: ["folder-api"],
      hasChanges: true,
      isStale: true,
    });
    const wrapper = mountPopover();
    const trigger = wrapper.get('[data-test="session-scope-trigger"]');

    expect(trigger.attributes("title")).toBe("Agent 授权范围：已失效");
    expect(
      wrapper
        .get('[data-test="session-scope-trigger-status"] [data-icon-name]')
        .attributes("data-icon-name")
    ).toBe("i-lucide-circle-alert");

    await trigger.trigger("click");

    const difference = wrapper.get('[data-test="session-scope-diff"]').text();
    expect(wrapper.get('[data-test="session-scope-status"]').text()).toBe("Project 授权范围已失效");
    expect(difference).toContain("已从当前 Workspace 移除：API");
    expect(difference).toContain("App 已重命名为 Application");
    expect(difference).toContain("App 的项目目录已变更");
    expect(difference).toContain("项目目录不可用：API");
    expect(wrapper.text()).toContain("/repos/app");
    expect(wrapper.text()).toContain("/repos/api");
    expect(wrapper.text()).not.toContain("/repos/application");
  });
});
