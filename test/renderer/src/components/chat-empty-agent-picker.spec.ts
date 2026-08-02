import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ChatEmptyAgentPicker from "@renderer/components/chat/empty/ChatEmptyAgentPicker.vue";
import InstalledAgentTile from "@renderer/components/chat/empty/InstalledAgentTile.vue";
import { useAcpAgentsStore, useSessionStore, useWorkspaceStore } from "@renderer/stores";
import type { WorkspaceInfo } from "@shared/types/workspace";

function multiRootWorkspace(): WorkspaceInfo {
  return {
    version: 2,
    id: "workspace-1",
    name: "Workspace",
    kind: "collection",
    isDeleted: false,
    folderIds: ["folder-1", "folder-2"],
    primaryFolderId: "folder-1",
    createdAt: "2026-08-01T00:00:00.000Z",
    lastOpenedAt: "2026-08-01T00:00:00.000Z",
    primaryFolder: {
      version: 1,
      id: "folder-1",
      name: "Primary",
      path: "/tmp/primary",
    },
    primaryFolderMetaPath: "/tmp/primary-meta.json",
    pathMissing: false,
    folders: [
      {
        folderId: "folder-1",
        folderName: "Primary",
        folderPath: "/tmp/primary",
        pathMissing: false,
        isPrimary: true,
      },
      {
        folderId: "folder-2",
        folderName: "Secondary",
        folderPath: "/tmp/secondary",
        pathMissing: false,
        isPrimary: false,
      },
    ],
    availableFolders: [
      {
        folderId: "folder-1",
        folderName: "Primary",
        folderPath: "/tmp/primary",
        pathMissing: false,
        isPrimary: true,
      },
      {
        folderId: "folder-2",
        folderName: "Secondary",
        folderPath: "/tmp/secondary",
        pathMissing: false,
        isPrimary: false,
      },
    ],
    missingFolders: [],
    chatAvailable: true,
  };
}

describe("ChatEmptyAgentPicker multi-root capability", () => {
  beforeEach(() => {
    const pinia = createPinia();
    setActivePinia(pinia);

    const agents = useAcpAgentsStore();
    agents.initialized = true;
    agents.statuses = {
      "claude-code": {
        id: "claude-code",
        name: "Claude Code",
        installed: true,
        managedBy: "fyllocode",
        updateAvailable: false,
      },
    };
    useWorkspaceStore().currentWorkspace = multiRootWorkspace();
  });

  function mountPicker() {
    return mount(ChatEmptyAgentPicker, {
      global: {
        stubs: {
          AgentPickerModal: true,
          MoreAgentsTile: true,
        },
      },
    });
  }

  it("keeps unknown Agents keyboard-focusable and selects after live support detection", async () => {
    const agents = useAcpAgentsStore();
    const session = useSessionStore();
    const setDraftAgent = vi.spyOn(session, "setDraftAgent");
    vi.spyOn(agents, "refreshCapabilities").mockImplementation(async (agentId) => {
      agents.capabilitiesByAgent.set(agentId, {
        sessionCapabilities: { additionalDirectories: {} },
        capabilityCompleteness: "complete",
        capturedAgentVersion: "1.0.0",
        capturedAt: "2026-08-02T00:00:00.000Z",
      });
    });
    const wrapper = mountPicker();

    const button = wrapper.get("button");
    expect(button.text()).toContain("连接后检测");
    expect(button.attributes("disabled")).toBeUndefined();
    await button.trigger("click");
    await flushPromises();

    expect(agents.refreshCapabilities).toHaveBeenCalledWith("claude-code");
    expect(setDraftAgent).toHaveBeenCalledWith("claude-code");
  });

  it("does not select when live detection resolves to unsupported", async () => {
    const agents = useAcpAgentsStore();
    const session = useSessionStore();
    const setDraftAgent = vi.spyOn(session, "setDraftAgent");
    vi.spyOn(agents, "refreshCapabilities").mockImplementation(async (agentId) => {
      agents.capabilitiesByAgent.set(agentId, {
        sessionCapabilities: {},
        capabilityCompleteness: "complete",
        capturedAgentVersion: "1.0.0",
        capturedAt: "2026-08-02T00:00:00.000Z",
      });
    });
    const wrapper = mountPicker();

    await wrapper.get("button").trigger("click");
    await flushPromises();

    expect(setDraftAgent).not.toHaveBeenCalled();
    expect(wrapper.get("button").attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain("不支持多根工作区");
  });
});

describe("InstalledAgentTile", () => {
  it("uses a native button so an unknown Agent remains in keyboard focus order", () => {
    const wrapper = mount(InstalledAgentTile, {
      props: {
        agentId: "claude-code",
        name: "Claude Code",
        workspaceCompatibility: "unknown",
      },
    });

    expect(wrapper.element.tagName).toBe("BUTTON");
    expect(wrapper.attributes("disabled")).toBeUndefined();
    expect(wrapper.text()).toContain("连接后检测");
  });
});
