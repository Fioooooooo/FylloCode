import { beforeEach, describe, expect, it, vi } from "vitest";
import { ipcMain } from "electron";
import {
  SessionChatChannels,
  SessionChatProbeChannels,
  SessionChatStreamChannels,
} from "@shared/ipc/session/chat.channels";
import { ProposalBrowserChannels } from "@shared/ipc/proposal/browser.channels";
import { ProposalApplyChannels } from "@shared/ipc/proposal/apply.channels";
import { ProposalArchiveChannels } from "@shared/ipc/proposal/archive.channels";
import { PlatformSettingsChannels } from "@shared/ipc/platform/settings.channels";
import { PlatformReleaseChannels } from "@shared/ipc/platform/release.channels";
import { InsightOverviewChannels } from "@shared/ipc/insight/overview.channels";

const mocks = vi.hoisted(() => ({
  browserWindowFromWebContents: vi.fn(),
  ipcMainHandle: vi.fn(),
  sessionProbeBusOnUpdate: vi.fn(),
}));

vi.mock("electron", async (importOriginal) => {
  const actual = await importOriginal<typeof import("electron")>();
  return {
    ...actual,
    BrowserWindow: {
      ...actual.BrowserWindow,
      fromWebContents: mocks.browserWindowFromWebContents,
    },
    ipcMain: {
      ...actual.ipcMain,
      handle: mocks.ipcMainHandle,
    },
  };
});

vi.mock("@main/services/platform/acp-agent/acp-agent-service", () => ({
  detectAllAgentStatus: vi.fn(),
  detectAllAgentStatusForced: vi.fn(),
  ensureAgentAvailable: vi.fn(),
  getAgentIcons: vi.fn(),
  getAgentRegistry: vi.fn(),
  installAgent: vi.fn(),
  loadCapabilitiesCache: vi.fn(),
  loadCustomAgents: vi.fn(),
  refreshAgentRegistry: vi.fn(),
  saveCustomAgents: vi.fn(),
  uninstallAgent: vi.fn(),
}));

vi.mock("@main/services/session/chat/session-probe-bus", () => ({
  sessionProbeBus: {
    onUpdate: mocks.sessionProbeBusOnUpdate,
  },
}));

describe("registerAllHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers key domain channels exactly once", async () => {
    const { registerAllHandlers } = await import("@main/ipc");

    registerAllHandlers();

    const registeredChannels = vi.mocked(ipcMain.handle).mock.calls.map(([channel]) => channel);
    const expectedChannels = [
      ...Object.values(SessionChatChannels),
      ...Object.values(SessionChatStreamChannels).filter(
        (channel) => channel !== SessionChatStreamChannels.streamPort
      ),
      ...Object.values(SessionChatProbeChannels).filter(
        (channel) => channel !== SessionChatProbeChannels.update
      ),
      ...Object.values(ProposalBrowserChannels).filter(
        (channel) => channel !== ProposalBrowserChannels.statusChanged
      ),
      ...Object.values(ProposalApplyChannels).filter(
        (channel) => channel !== ProposalApplyChannels.stageStreamPort
      ),
      ...Object.values(ProposalArchiveChannels).filter(
        (channel) => channel !== ProposalArchiveChannels.archivePort
      ),
      ...Object.values(PlatformSettingsChannels),
      ...Object.values(PlatformReleaseChannels),
      ...Object.values(InsightOverviewChannels),
    ];

    for (const channel of expectedChannels) {
      expect(
        registeredChannels.filter((registered) => registered === channel),
        channel
      ).toHaveLength(1);
    }

    // Legacy flat channel strings are intentionally kept here as negative guards.
    expect(registeredChannels).not.toContain("chat:listSessions");
    expect(registeredChannels).not.toContain("proposal:list");
    expect(registeredChannels).not.toContain("settings:get");
    expect(registeredChannels).not.toContain("overview:getProjectOverview");
  });
});
