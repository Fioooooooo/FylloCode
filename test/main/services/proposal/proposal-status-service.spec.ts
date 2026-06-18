import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { FSWatcher } from "fs";
import type { ProposalStatus, ProposalStatusChangedPayload } from "@shared/types/proposal";

const mocks = vi.hoisted(() => ({
  watchCallbacks: new Map<string, () => void>(),
  watcherCloses: [] as ReturnType<typeof vi.fn>[],
  resolveChangeDirAnywhere: vi.fn(),
  readIfExists: vi.fn(),
  watch: vi.fn((path: string, listener: (event: string, filename: string) => void) => {
    const normalizedPath = String(path);
    const callback = () => listener("change", normalizedPath);
    mocks.watchCallbacks.set(normalizedPath, callback);
    const close = vi.fn();
    mocks.watcherCloses.push(close);
    return {
      close,
      on: vi.fn().mockReturnThis(),
    } as unknown as FSWatcher;
  }),
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    watch: mocks.watch,
  };
});

vi.mock("@main/infra/proposal/openspec-reader", () => ({
  resolveChangeDirAnywhere: mocks.resolveChangeDirAnywhere,
  readIfExists: mocks.readIfExists,
  parseYamlStatus: vi.fn((content: string) => {
    const match = content.match(/^\s*status:\s*(creating|draft|applying|archived)\s*$/m);
    return (match?.[1] as ProposalStatus | undefined) ?? "draft";
  }),
}));

vi.mock("@main/infra/logger", () => ({
  default: mocks.logger,
}));

import { proposalStatusService } from "@main/services/proposal/proposal-status-service";

function activeDir(projectPath: string, changeId: string): string {
  return `${projectPath}/openspec/changes/${changeId}`;
}

function archiveDir(projectPath: string, datePrefix: string, changeId: string): string {
  return `${projectPath}/openspec/changes/archive/${datePrefix}-${changeId}`;
}

function triggerWatch(watchedPath: string): void {
  mocks.watchCallbacks.get(watchedPath)?.();
}

function latestClose(): ReturnType<typeof vi.fn> | undefined {
  return mocks.watcherCloses[mocks.watcherCloses.length - 1];
}

describe("ProposalStatusService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.watchCallbacks.clear();
    mocks.watcherCloses.length = 0;
    mocks.resolveChangeDirAnywhere.mockReset();
    mocks.readIfExists.mockReset();
    proposalStatusService.unwatchAll();
  });

  afterEach(() => {
    proposalStatusService.unwatchAll();
  });

  it("emits initial status when watching a proposal", async () => {
    const projectPath = "/project";
    const changeId = "foo";
    const dir = activeDir(projectPath, changeId);
    mocks.resolveChangeDirAnywhere.mockResolvedValue({ dir, archived: false });
    mocks.readIfExists.mockResolvedValue("status: creating\n");

    const events: ProposalStatusChangedPayload[] = [];
    proposalStatusService.onStatusChanged((payload) => events.push(payload));
    proposalStatusService.watchProposal(projectPath, changeId, "session-1");

    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(events[0]).toMatchObject({
      changeId,
      sessionId: "session-1",
      projectPath,
      status: "creating",
    });
  });

  it("emits status change when .openspec.yaml is updated", async () => {
    const projectPath = "/project";
    const changeId = "foo";
    const dir = activeDir(projectPath, changeId);
    mocks.resolveChangeDirAnywhere.mockResolvedValue({ dir, archived: false });
    mocks.readIfExists
      .mockResolvedValueOnce("status: creating\n")
      .mockResolvedValueOnce("status: draft\n");

    const events: ProposalStatusChangedPayload[] = [];
    proposalStatusService.onStatusChanged((payload) => events.push(payload));
    proposalStatusService.watchProposal(projectPath, changeId, "session-1");

    await vi.waitFor(() => expect(events).toHaveLength(1));
    triggerWatch(`${dir}/.openspec.yaml`);

    await vi.waitFor(() => expect(events).toHaveLength(2));
    expect(events[1]).toMatchObject({ changeId, status: "draft" });
  });

  it("relocates to archive directory and emits archived", async () => {
    const projectPath = "/project";
    const changeId = "foo";
    const active = activeDir(projectPath, changeId);
    const archived = archiveDir(projectPath, "2026-06-18", changeId);
    mocks.resolveChangeDirAnywhere
      .mockResolvedValueOnce({ dir: active, archived: false })
      .mockResolvedValueOnce({ dir: archived, archived: true });
    mocks.readIfExists
      .mockResolvedValueOnce("status: applying\n")
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("status: archived\n");

    const events: ProposalStatusChangedPayload[] = [];
    proposalStatusService.onStatusChanged((payload) => events.push(payload));
    proposalStatusService.watchProposal(projectPath, changeId, "session-1");

    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(events[0]).toMatchObject({ status: "applying" });

    triggerWatch(`${active}/.openspec.yaml`);

    await vi.waitFor(() => expect(events).toHaveLength(2));
    expect(events[1]).toMatchObject({ changeId, status: "archived" });
  });

  it("emits removed and stops watching when proposal disappears", async () => {
    const projectPath = "/project";
    const changeId = "foo";
    const dir = activeDir(projectPath, changeId);
    mocks.resolveChangeDirAnywhere
      .mockResolvedValueOnce({ dir, archived: false })
      .mockResolvedValueOnce(null);
    mocks.readIfExists.mockResolvedValueOnce("status: draft\n").mockResolvedValueOnce(null);

    const events: ProposalStatusChangedPayload[] = [];
    proposalStatusService.onStatusChanged((payload) => events.push(payload));
    proposalStatusService.watchProposal(projectPath, changeId, "session-1");

    await vi.waitFor(() => expect(events).toHaveLength(1));
    triggerWatch(`${dir}/.openspec.yaml`);

    await vi.waitFor(() => expect(events).toHaveLength(2));
    expect(events[1]).toMatchObject({ changeId, removed: true });
    expect(latestClose()).toHaveBeenCalledTimes(1);
  });

  it("replaces existing watcher when the same changeId is watched again", async () => {
    const projectPath = "/project";
    const changeId = "foo";
    const dir = activeDir(projectPath, changeId);
    mocks.resolveChangeDirAnywhere.mockResolvedValue({ dir, archived: false });
    mocks.readIfExists.mockResolvedValue("status: draft\n");

    proposalStatusService.watchProposal(projectPath, changeId, "session-1");
    await vi.waitFor(() => expect(mocks.watcherCloses).toHaveLength(1));
    const firstClose = mocks.watcherCloses[0];

    proposalStatusService.watchProposal(projectPath, changeId, "session-2");
    await vi.waitFor(() => expect(mocks.watcherCloses).toHaveLength(2));

    expect(firstClose).toHaveBeenCalledTimes(1);
  });
});
