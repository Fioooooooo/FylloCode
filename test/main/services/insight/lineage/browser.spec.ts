import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Subject } from "@shared/types/lineage";

const mocks = vi.hoisted(() => ({
  listSubjects: vi.fn(),
  listSessionMetas: vi.fn(),
  readProposalFiles: vi.fn(),
  readPlan: vi.fn(),
  writeSubject: vi.fn(),
  writeIndex: vi.fn(),
}));

vi.mock("@main/infra/storage/lineage-store", () => ({
  listSubjects: mocks.listSubjects,
  writeSubject: mocks.writeSubject,
  writeIndex: mocks.writeIndex,
}));

vi.mock("@main/infra/storage/session-store", () => ({
  listSessionMetas: mocks.listSessionMetas,
}));

vi.mock("@main/infra/proposal/openspec-reader", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@main/infra/proposal/openspec-reader")>();
  return {
    ...actual,
    readProposalFiles: mocks.readProposalFiles,
  };
});

vi.mock("@main/services/insight/lineage/plan", () => ({
  readPlan: mocks.readPlan,
}));

import {
  deriveLineageBrowserStatus,
  getLineageBrowser,
} from "@main/services/insight/lineage/browser";

function subject(overrides: Partial<Subject> = {}): Subject {
  return {
    id: "subject-1",
    origin: "chat",
    task: null,
    links: [],
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("lineage browser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listSubjects.mockResolvedValue([]);
    mocks.listSessionMetas.mockResolvedValue([]);
    mocks.readProposalFiles.mockResolvedValue([]);
    mocks.readPlan.mockRejectedValue(new Error("missing plan"));
  });

  it("derives aggregate status with stable precedence", () => {
    expect(deriveLineageBrowserStatus(["archived", "applying"], 0)).toBe("applying");
    expect(deriveLineageBrowserStatus(["archived", "draft"], 0)).toBe("planned");
    expect(deriveLineageBrowserStatus([null], 0)).toBe("planned");
    expect(deriveLineageBrowserStatus(["archived", "archived"], 0)).toBe("completed");
    expect(deriveLineageBrowserStatus([], 1)).toBe("planned");
    expect(deriveLineageBrowserStatus([], 0)).toBe("discussion");
  });

  it("sorts subjects and enriches sessions, plans, and archived proposals", async () => {
    mocks.listSubjects.mockResolvedValue([
      subject({ id: "older", updatedAt: "2026-07-02T00:00:00.000Z" }),
      subject({
        id: "newer",
        updatedAt: "2026-07-10T00:00:00.000Z",
        links: [
          {
            sessionId: "session-1",
            createdAt: "2026-07-03T00:00:00.000Z",
            plans: [{ slug: "2026-07-03-plan-one", createdAt: "2026-07-03T01:00:00.000Z" }],
            proposals: [
              {
                changeId: "change-one",
                createdAt: "2026-07-03T02:00:00.000Z",
                commitHash: "abc123",
              },
            ],
          },
        ],
      }),
    ]);
    mocks.listSessionMetas.mockResolvedValue([
      {
        sessionId: "session-1",
        title: "恢复会话",
        agentId: "codex",
        updatedAt: "2026-07-10T01:00:00.000Z",
      },
    ]);
    mocks.readProposalFiles.mockResolvedValue([
      {
        id: "2026-07-09-change-one",
        title: "Change One",
        status: "archived",
      },
    ]);
    mocks.readPlan.mockResolvedValue({
      slug: "2026-07-03-plan-one",
      goal: "验证恢复路径",
      createdAt: "2026-07-03T01:00:00.000Z",
      status: "approved",
      body: "",
    });

    const result = await getLineageBrowser("/tmp/project");

    expect(result.entries.map((entry) => entry.subjectId)).toEqual(["newer", "older"]);
    expect(result.entries[0]).toMatchObject({
      status: "completed",
      sessions: [
        {
          sessionId: "session-1",
          title: "恢复会话",
          agentId: "codex",
          updatedAt: "2026-07-10T01:00:00.000Z",
          plans: [{ goal: "验证恢复路径", status: "approved" }],
          proposals: [
            {
              changeId: "change-one",
              title: "Change One",
              status: "archived",
              commitHash: "abc123",
            },
          ],
        },
      ],
    });
  });

  it("keeps stable ids when related metadata cannot be read", async () => {
    mocks.listSubjects.mockResolvedValue([
      subject({
        links: [
          {
            sessionId: "session-missing",
            createdAt: "2026-07-03T00:00:00.000Z",
            plans: [{ slug: "2026-07-03-plan-missing", createdAt: "2026-07-03T01:00:00.000Z" }],
            proposals: [{ changeId: "change-missing", createdAt: "2026-07-03T02:00:00.000Z" }],
          },
        ],
      }),
    ]);

    const result = await getLineageBrowser("/tmp/project");

    expect(result.entries[0]).toMatchObject({
      status: "planned",
      sessions: [
        {
          sessionId: "session-missing",
          title: "session-missing",
          agentId: null,
          createdAt: "2026-07-03T00:00:00.000Z",
          updatedAt: "2026-07-03T00:00:00.000Z",
          plans: [{ slug: "2026-07-03-plan-missing", goal: null, status: null }],
          proposals: [{ changeId: "change-missing", title: null, status: null, commitHash: null }],
        },
      ],
    });
  });

  it("returns an empty browser without invoking plan reads or writes", async () => {
    await expect(getLineageBrowser("/tmp/project")).resolves.toEqual({ entries: [] });
    expect(mocks.readPlan).not.toHaveBeenCalled();
    expect(mocks.writeSubject).not.toHaveBeenCalled();
    expect(mocks.writeIndex).not.toHaveBeenCalled();
  });
});
