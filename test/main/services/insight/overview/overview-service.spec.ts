import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Subject } from "@shared/types/lineage";

const mocks = vi.hoisted(() => ({
  readProposalFiles: vi.fn(),
  listSubjects: vi.fn(),
  getByProposal: vi.fn(),
  listRecentSubjects: vi.fn(),
  recordProposalCommitHash: vi.fn(),
  countSpecs: vi.fn(),
  countArchives: vi.fn(),
  countGuidelines: vi.fn(),
  getGitGovernance: vi.fn(),
  buildArchiveCommitIndex: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock("@main/infra/proposal/openspec-reader", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@main/infra/proposal/openspec-reader")>();
  return {
    ...actual,
    readProposalFiles: mocks.readProposalFiles,
  };
});

vi.mock("@main/infra/storage/lineage-store", () => ({
  listSubjects: mocks.listSubjects,
}));

vi.mock("@main/services/insight/lineage/lineage-service", () => ({
  getByProposal: mocks.getByProposal,
  listRecentSubjects: mocks.listRecentSubjects,
  recordProposalCommitHash: mocks.recordProposalCommitHash,
}));

vi.mock("@main/services/insight/overview/openspec-stats", () => ({
  countSpecs: mocks.countSpecs,
  countArchives: mocks.countArchives,
  countGuidelines: mocks.countGuidelines,
}));

vi.mock("@main/services/insight/overview/git-stats", () => ({
  getGitGovernance: mocks.getGitGovernance,
}));

vi.mock("@main/services/insight/overview/archive-commit-index", () => ({
  buildArchiveCommitIndex: mocks.buildArchiveCommitIndex,
}));

vi.mock("@main/infra/logger", () => ({
  default: {
    warn: mocks.loggerWarn,
  },
}));

import { getProjectOverview } from "@main/services/insight/overview/overview-service";

function subject(overrides: Partial<Subject>): Subject {
  return {
    id: "subject-1",
    origin: "task",
    task: null,
    links: [],
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-10T00:00:00.000Z",
    ...overrides,
  };
}

describe("overview-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-12T08:00:00.000Z"));

    mocks.countSpecs.mockResolvedValue(74);
    mocks.countArchives.mockResolvedValue({ total: 110, thisMonth: 14 });
    mocks.countGuidelines.mockResolvedValue(10);
    mocks.getGitGovernance.mockResolvedValue({
      specsGrowth: [
        { weekStart: "2026-05-25T00:00:00.000Z", cumulativeCount: 70 },
        { weekStart: "2026-06-01T00:00:00.000Z", cumulativeCount: 72 },
        { weekStart: "2026-06-08T00:00:00.000Z", cumulativeCount: 74 },
      ],
      recentGuidelines: [
        {
          fileName: "IPC.md",
          lastCommitDate: "2026-06-10T00:00:00.000Z",
          lastCommitMessage: "docs(ipc): overview",
        },
      ],
      guidelinesLastUpdated: "2026-06-10T00:00:00.000Z",
    });
    mocks.buildArchiveCommitIndex.mockResolvedValue(new Map());
    mocks.recordProposalCommitHash.mockResolvedValue(subject({ id: "written-subject" }));
  });

  it("maps active changes, lineage task refs, task linked ratio, and recent lineage merge status", async () => {
    mocks.readProposalFiles.mockResolvedValue([
      {
        id: "creating-change",
        title: "Creating Change",
        status: "creating",
        date: "2026-06-01T00:00:00.000Z",
      },
      {
        id: "draft-change",
        title: "Draft Change",
        status: "draft",
        date: "2026-06-02T00:00:00.000Z",
      },
      {
        id: "applying-change",
        title: "Applying Change",
        status: "applying",
        date: "2026-06-03T00:00:00.000Z",
        worktreePath: "/tmp/project/.worktrees/applying-change",
      },
      {
        id: "archived-change",
        title: "Archived Change",
        status: "archived",
        date: "2026-06-05T00:00:00.000Z",
      },
      {
        id: "old-change",
        title: "Old Change",
        status: "archived",
        date: "2026-06-02T00:00:00.000Z",
      },
      {
        id: "persisted-change",
        title: "Persisted Change",
        status: "archived",
        date: "2026-06-04T00:00:00.000Z",
      },
      {
        id: "no-commit",
        title: "No Commit",
        status: "draft",
        date: "2026-06-04T00:00:00.000Z",
      },
    ]);
    mocks.getByProposal.mockImplementation(async (_projectPath: string, changeId: string) => {
      if (changeId === "creating-change") {
        return {
          task: {
            ref: "yunxiao:ABC-1",
            snapshot: { title: "Implement overview data" },
          },
        };
      }
      return null;
    });
    mocks.listSubjects.mockResolvedValue([
      subject({
        id: "task-subject",
        origin: "task",
        task: {
          ref: "yunxiao:ABC-1",
          snapshot: { title: "Implement overview data" },
          capturedAt: "2026-06-01T00:00:00.000Z",
        } as never,
      }),
      subject({ id: "chat-subject", origin: "chat" }),
    ]);
    mocks.listRecentSubjects.mockResolvedValue([
      subject({
        id: "recent-applying",
        origin: "task",
        task: {
          ref: "yunxiao:ABC-1",
          snapshot: { title: "Implement overview data" },
          capturedAt: "2026-06-01T00:00:00.000Z",
        } as never,
        links: [
          {
            sessionId: "session-1",
            createdAt: "2026-06-01T00:00:00.000Z",
            proposals: [{ changeId: "applying-change", createdAt: "2026-06-03T00:00:00.000Z" }],
            plans: [],
          },
        ],
      }),
      subject({
        id: "recent-merged",
        origin: "chat",
        links: [
          {
            sessionId: "session-2",
            createdAt: "2026-06-02T00:00:00.000Z",
            proposals: [{ changeId: "old-change", createdAt: "2026-06-02T00:00:00.000Z" }],
            plans: [],
          },
        ],
      }),
      subject({
        id: "recent-persisted",
        origin: "chat",
        links: [
          {
            sessionId: "session-persisted",
            createdAt: "2026-06-04T00:00:00.000Z",
            proposals: [
              {
                changeId: "persisted-change",
                createdAt: "2026-06-04T00:00:00.000Z",
                commitHash: "stored123",
              },
            ],
            plans: [],
          },
        ],
      }),
      subject({
        id: "recent-pending",
        origin: "chat",
        links: [
          {
            sessionId: "session-3",
            createdAt: "2026-06-04T00:00:00.000Z",
            proposals: [{ changeId: "no-commit", createdAt: "2026-06-04T00:00:00.000Z" }],
            plans: [],
          },
        ],
      }),
    ]);
    mocks.buildArchiveCommitIndex.mockResolvedValue(
      new Map([
        [
          "old-change",
          {
            changeId: "old-change",
            archivedChangeId: "2026-06-02-old-change",
            hash: "abc123archive",
            committedAt: "2026-06-02T12:00:00.000Z",
          },
        ],
      ])
    );

    const overview = await getProjectOverview("/repo");

    expect(overview.stats).toMatchObject({
      specsCount: 74,
      specsThisMonth: 4,
      archiveCount: 110,
      archiveThisMonth: 14,
      guidelinesCount: 10,
      guidelinesLastUpdated: "2026-06-10T00:00:00.000Z",
      taskLinkedRatio: 0.5,
      totalSubjects: 2,
    });
    expect(overview.activeChanges).toEqual([
      expect.objectContaining({
        id: "creating-change",
        title: "Creating Change",
        status: "creating",
        taskRef: "yunxiao:ABC-1",
        taskTitle: "Implement overview data",
      }),
      expect.objectContaining({ id: "draft-change", title: "Draft Change", status: "draft" }),
      expect.objectContaining({
        id: "applying-change",
        title: "Applying Change",
        status: "applying",
        worktreePath: "/tmp/project/.worktrees/applying-change",
      }),
      expect.objectContaining({
        id: "no-commit",
        title: "No Commit",
        status: "draft",
      }),
    ]);
    expect(overview.activeChanges.map((change) => change.id)).not.toContain("archived-change");
    expect(mocks.buildArchiveCommitIndex).toHaveBeenCalledWith("/repo", [
      "old-change",
      "no-commit",
    ]);
    expect(mocks.recordProposalCommitHash).toHaveBeenCalledTimes(1);
    expect(mocks.recordProposalCommitHash).toHaveBeenCalledWith(
      "/repo",
      "old-change",
      "abc123archive"
    );
    expect(overview.recentLineages).toEqual([
      expect.objectContaining({
        subjectId: "recent-applying",
        sessionCount: 1,
        proposalCount: 1,
        proposalStatus: "applying",
        archiveCommitHash: null,
      }),
      expect.objectContaining({
        subjectId: "recent-merged",
        proposalStatus: "completed",
        archiveCommitHash: "abc123archive",
      }),
      expect.objectContaining({
        subjectId: "recent-persisted",
        proposalStatus: "completed",
        archiveCommitHash: "stored123",
      }),
      expect.objectContaining({
        subjectId: "recent-pending",
        proposalStatus: "pending",
        archiveCommitHash: null,
      }),
    ]);
  });

  it("returns zero task linked ratio when lineage subjects are empty", async () => {
    mocks.readProposalFiles.mockResolvedValue([]);
    mocks.listSubjects.mockResolvedValue([]);
    mocks.listRecentSubjects.mockResolvedValue([]);

    const overview = await getProjectOverview("/repo");

    expect(overview.stats.taskLinkedRatio).toBe(0);
    expect(overview.stats.totalSubjects).toBe(0);
    expect(overview.activeChanges).toEqual([]);
    expect(overview.recentLineages).toEqual([]);
  });

  it("returns a git-resolved merge hash when lineage writeback fails", async () => {
    mocks.readProposalFiles.mockResolvedValue([
      {
        id: "missing-hash",
        title: "Missing Hash",
        status: "archived",
        date: "2026-06-04T00:00:00.000Z",
      },
    ]);
    mocks.getByProposal.mockResolvedValue(null);
    mocks.listSubjects.mockResolvedValue([]);
    mocks.listRecentSubjects.mockResolvedValue([
      subject({
        id: "recent-missing",
        origin: "chat",
        links: [
          {
            sessionId: "session-1",
            createdAt: "2026-06-04T00:00:00.000Z",
            proposals: [{ changeId: "missing-hash", createdAt: "2026-06-04T00:00:00.000Z" }],
            plans: [],
          },
        ],
      }),
    ]);
    mocks.buildArchiveCommitIndex.mockResolvedValue(
      new Map([
        [
          "missing-hash",
          {
            changeId: "missing-hash",
            archivedChangeId: "2026-06-04-missing-hash",
            hash: "git123",
            committedAt: "2026-06-04T12:00:00.000Z",
          },
        ],
      ])
    );
    const writebackError = new Error("write failed");
    mocks.recordProposalCommitHash.mockRejectedValueOnce(writebackError);

    const overview = await getProjectOverview("/repo");

    expect(overview.recentLineages).toEqual([
      expect.objectContaining({
        subjectId: "recent-missing",
        proposalStatus: "completed",
        archiveCommitHash: "git123",
      }),
    ]);
    expect(mocks.recordProposalCommitHash).toHaveBeenCalledWith("/repo", "missing-hash", "git123");
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      "[overview] failed to persist proposal commit hash project=/repo change=missing-hash",
      writebackError
    );
  });
});
