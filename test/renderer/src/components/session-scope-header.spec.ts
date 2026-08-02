import { computed, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import SessionScopeHeader from "@renderer/components/chat/SessionScopeHeader.vue";
import type { Session } from "@shared/types/chat";
import type { SessionScopeDiff } from "@renderer/stores/session/session";

const activeSessionRef = ref<Session | null>(null);
const activeSessionScopeDiffRef = ref<SessionScopeDiff | null>(null);

vi.mock("@renderer/stores", () => ({
  useSessionStore: () => ({
    activeSession: computed(() => activeSessionRef.value),
    activeSessionScopeDiff: computed(() => activeSessionScopeDiffRef.value),
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

function scopedSession(): Session {
  return {
    id: "session-1",
    workspaceId: "workspace-1",
    agentId: "claude-code",
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
      folders: [
        { folderId: "folder-app", folderName: "App", folderPath: "/repos/app" },
        { folderId: "folder-api", folderName: "API", folderPath: "/repos/api" },
      ],
      cwd: "/repos/app",
      additionalDirectories: ["/repos/api"],
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

describe("SessionScopeHeader", () => {
  beforeEach(() => {
    activeSessionRef.value = null;
    activeSessionScopeDiffRef.value = null;
  });

  it("stays hidden when the active Session has no frozen scope", () => {
    const wrapper = mount(SessionScopeHeader);

    expect(wrapper.find('[data-test="session-scope-header"]').exists()).toBe(false);
  });

  it("shows the frozen Folder scope and primary marker", () => {
    activeSessionRef.value = scopedSession();
    activeSessionScopeDiffRef.value = emptyDiff();
    const wrapper = mount(SessionScopeHeader);

    expect(wrapper.get('[data-test="session-scope-summary"]').text()).toContain("2 个 Folder");
    expect(wrapper.get('[data-test="session-scope-status"]').text()).toBe("目录范围已固定");
    expect(wrapper.text()).toContain("App");
    expect(wrapper.text()).toContain("API");
    expect(wrapper.text()).toContain("primary");
    expect(wrapper.get('[data-test="session-scope-summary"]').classes()).toContain(
      "focus-visible:ring-2"
    );
  });

  it("explains stale and current-only differences without changing the displayed snapshot", () => {
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
      snapshotOnly: [{ folderId: "folder-api", folderName: "API", folderPath: "/repos/api" }],
      primaryChanged: true,
      hasChanges: true,
      isStale: true,
    });
    const wrapper = mount(SessionScopeHeader);

    expect(wrapper.get('[data-test="session-scope-status"]').text()).toBe("目录范围已失效");
    expect(wrapper.get('[data-test="session-scope-diff"]').text()).toContain("当前新增：Docs");
    expect(wrapper.get('[data-test="session-scope-diff"]').text()).toContain(
      "已移出 Workspace：API"
    );
    expect(wrapper.get('[data-test="session-scope-diff"]').text()).toContain(
      "新建 Session 获得当前成员授权"
    );
    expect(wrapper.text()).toContain("/repos/api");
  });
});
