import { mkdirSync, promises as fsPromises, readFileSync, rmSync, writeFileSync } from "fs";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { LineageIndex, LineageTaskSnapshot, Subject } from "@shared/types/lineage";
import type { TaskItem } from "@shared/types/task";

const { tempRoot } = await vi.hoisted(async () => {
  const { createTestTempRoot } = await import("@test/main/test-temp-root");

  return {
    tempRoot: createTestTempRoot("fyllocode-lineage-store-"),
  };
});

vi.mock("@main/infra/paths", () => ({
  getDataSubPath: vi.fn((subPath: string) => `${tempRoot}/${subPath}`),
}));

import {
  listSubjects,
  readIndex,
  readSubject,
  writeIndex,
  writeSubject,
} from "@main/infra/storage/lineage-store";
import { lineageDir, lineageSubjectsDir } from "@main/infra/storage/workspace-paths";

const workspaceId = "workspace-1";
const now = "2026-06-09T00:00:00.000Z";

function task(overrides: Partial<TaskItem> = {}): TaskItem {
  const createdAt = new Date("2026-06-01T00:00:00.000Z");
  return {
    id: "task-1",
    workspaceId: "workspace-1",
    title: "Lineage task",
    description: { format: "plain_text", content: "Details" },
    status: "open",
    source: "local",
    sourceMeta: { source: "local" },
    labels: [],
    assignee: undefined,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

function taskSnapshot(overrides: Partial<LineageTaskSnapshot> = {}): LineageTaskSnapshot {
  return {
    ref: "local:task-1",
    snapshot: task(),
    capturedAt: now,
    ...overrides,
  };
}

function subject(overrides: Partial<Subject> = {}): Subject {
  return {
    id: "subject-1",
    origin: "task",
    task: taskSnapshot(),
    links: [
      {
        sessionId: "session-1",
        createdAt: now,
        proposals: [{ folderId: "folder-1", changeId: "change-1", createdAt: now }],
        plans: [],
      },
    ],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function index(overrides: Partial<LineageIndex> = {}): LineageIndex {
  return {
    version: 2,
    tasks: { "local:task-1": "subject-1" },
    sessions: { "session-1": "subject-1" },
    proposals: { "folder-1\0change-1": "subject-1" },
    commitHashes: {},
    updatedAt: now,
    ...overrides,
  };
}

function subjectFilePath(subjectId = "subject-1"): string {
  return `${lineageSubjectsDir(workspaceId)}/${subjectId}.json`;
}

function indexFilePath(): string {
  return `${lineageDir(workspaceId)}/index.json`;
}

beforeEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

describe("lineage-store", () => {
  it("keeps lineage index and subject files under workspaces/<workspaceId>/lineage", async () => {
    await writeSubject(workspaceId, subject());
    await writeIndex(workspaceId, index());

    expect(subjectFilePath()).toBe(
      `${tempRoot}/workspaces/workspace-1/lineage/subjects/subject-1.json`
    );
    expect(indexFilePath()).toBe(`${tempRoot}/workspaces/workspace-1/lineage/index.json`);
  });

  it("round-trips subjects and index files under lineage paths", async () => {
    await writeSubject(workspaceId, subject());
    await writeIndex(workspaceId, index());

    expect(JSON.parse(readFileSync(subjectFilePath(), "utf8"))).toMatchObject({
      id: "subject-1",
      origin: "task",
    });
    expect(JSON.parse(readFileSync(indexFilePath(), "utf8"))).toMatchObject({
      version: 2,
      tasks: { "local:task-1": "subject-1" },
    });
    await expect(readSubject(workspaceId, "subject-1")).resolves.toEqual(subject());
    await expect(readIndex(workspaceId)).resolves.toEqual(index());
  });

  it("round-trips proposal commit hashes on subject links", async () => {
    const subjectWithCommitHash = subject({
      links: [
        {
          sessionId: "session-1",
          createdAt: now,
          proposals: [
            {
              folderId: "folder-1",
              changeId: "change-1",
              createdAt: now,
              commitHash: "abc123",
            },
          ],
          plans: [{ slug: "2026-06-29-plan-a", createdAt: now }],
        },
      ],
    });

    await writeSubject(workspaceId, subjectWithCommitHash);

    expect(JSON.parse(readFileSync(subjectFilePath(), "utf8"))).toMatchObject({
      links: [
        {
          proposals: [{ changeId: "change-1", commitHash: "abc123" }],
          plans: [{ slug: "2026-06-29-plan-a", createdAt: now }],
        },
      ],
    });
    await expect(readSubject(workspaceId, "subject-1")).resolves.toEqual(subjectWithCommitHash);
  });

  it("reads old subject proposal links without commitHash", async () => {
    mkdirSync(lineageSubjectsDir(workspaceId), { recursive: true });
    writeFileSync(subjectFilePath(), JSON.stringify(subject(), null, 2), "utf8");

    await expect(readSubject(workspaceId, "subject-1")).resolves.toEqual(subject());
  });

  it("normalizes old subject session links missing plans", async () => {
    mkdirSync(lineageSubjectsDir(workspaceId), { recursive: true });
    writeFileSync(
      subjectFilePath(),
      JSON.stringify(
        {
          ...subject(),
          links: [
            {
              sessionId: "session-1",
              createdAt: now,
              proposals: [{ folderId: "folder-1", changeId: "change-1", createdAt: now }],
            },
          ],
        },
        null,
        2
      ),
      "utf8"
    );

    await expect(readSubject(workspaceId, "subject-1")).resolves.toEqual(subject());
  });

  it("ignores legacy Folder ownership on Workspace-scoped plan links", async () => {
    mkdirSync(lineageSubjectsDir(workspaceId), { recursive: true });
    writeFileSync(
      subjectFilePath(),
      JSON.stringify(
        {
          ...subject(),
          links: [
            {
              sessionId: "session-1",
              createdAt: now,
              proposals: [],
              plans: [
                {
                  slug: "2026-06-29-plan-a",
                  createdAt: now,
                  folderId: "legacy-folder",
                },
              ],
            },
          ],
        },
        null,
        2
      ),
      "utf8"
    );

    await expect(readSubject(workspaceId, "subject-1")).resolves.toMatchObject({
      links: [
        {
          plans: [{ slug: "2026-06-29-plan-a", createdAt: now }],
        },
      ],
    });
    expect((await readSubject(workspaceId, "subject-1"))?.links[0]?.plans[0]).not.toHaveProperty(
      "folderId"
    );
  });

  it("drops plans from index normalization", async () => {
    await writeIndex(workspaceId, {
      ...index(),
      plans: { "2026-06-29-plan-a": "subject-1" },
    } as unknown as LineageIndex);

    expect(JSON.parse(readFileSync(indexFilePath(), "utf8"))).not.toHaveProperty("plans");
    await expect(readIndex(workspaceId)).resolves.toEqual(index());
  });

  it("rejects v1 index files until the upgrade migration rebuilds them", async () => {
    mkdirSync(lineageDir(workspaceId), { recursive: true });
    writeFileSync(
      indexFilePath(),
      JSON.stringify(
        {
          version: 1,
          tasks: { "local:task-1": "subject-1" },
          sessions: { "session-1": "subject-1" },
          proposals: { "change-1": "subject-1" },
          updatedAt: now,
        },
        null,
        2
      ),
      "utf8"
    );

    await expect(readIndex(workspaceId)).resolves.toBeNull();
  });

  it("writes index commitHashes", async () => {
    await writeIndex(workspaceId, index({ commitHashes: { "folder-1\0abc123": "subject-1" } }));

    expect(JSON.parse(readFileSync(indexFilePath(), "utf8"))).toMatchObject({
      version: 2,
      commitHashes: { "folder-1\0abc123": "subject-1" },
    });
  });

  it("returns null or empty results for missing and corrupt files", async () => {
    await expect(readSubject(workspaceId, "missing")).resolves.toBeNull();
    await expect(readIndex(workspaceId)).resolves.toBeNull();
    await expect(listSubjects(workspaceId)).resolves.toEqual([]);

    mkdirSync(lineageSubjectsDir(workspaceId), { recursive: true });
    writeFileSync(subjectFilePath("subject-bad"), "{not-json", "utf8");
    mkdirSync(lineageDir(workspaceId), { recursive: true });
    writeFileSync(indexFilePath(), "{not-json", "utf8");

    await expect(readSubject(workspaceId, "subject-bad")).resolves.toBeNull();
    await expect(readIndex(workspaceId)).resolves.toBeNull();
    await expect(listSubjects(workspaceId)).resolves.toEqual([]);
  });

  it("skips corrupt subject files while listing valid subjects", async () => {
    await writeSubject(workspaceId, subject());
    writeFileSync(subjectFilePath("subject-bad"), "not-json", "utf8");

    await expect(listSubjects(workspaceId)).resolves.toEqual([subject()]);
  });

  it("serializes concurrent writes to the same subject file", async () => {
    // Track how many temp-file writes overlap for the same subject. The lineage store uses
    // a per-file write lock, so concurrent `writeSubject` calls must not write simultaneously.
    const realWriteFile = fsPromises.writeFile.bind(fsPromises);
    let activeWrites = 0;
    let maxConcurrentWrites = 0;
    const targetPathPrefix = `${subjectFilePath()}.`;
    const writeSpy = vi
      .spyOn(fsPromises, "writeFile")
      .mockImplementation(async (path, data, options) => {
        if (typeof path === "string" && path.startsWith(targetPathPrefix)) {
          activeWrites += 1;
          maxConcurrentWrites = Math.max(maxConcurrentWrites, activeWrites);
          await new Promise((resolve) => setTimeout(resolve, 20));
          try {
            return await realWriteFile(path, data, options);
          } finally {
            activeWrites -= 1;
          }
        }

        return realWriteFile(path, data, options);
      });

    try {
      await Promise.all([
        writeSubject(workspaceId, subject({ updatedAt: "2026-06-09T00:00:01.000Z" })),
        writeSubject(workspaceId, subject({ updatedAt: "2026-06-09T00:00:02.000Z" })),
      ]);
    } finally {
      writeSpy.mockRestore();
    }

    expect(maxConcurrentWrites).toBe(1);
    await expect(readSubject(workspaceId, "subject-1")).resolves.toMatchObject({
      id: "subject-1",
    });
  });

  it("writes index files through a temp file followed by rename", async () => {
    // Verify the atomic-write strategy: index data is written to a temp file first, then
    // renamed into place so readers never see a partially written index.
    const realWriteFile = fsPromises.writeFile.bind(fsPromises);
    const realRename = fsPromises.rename.bind(fsPromises);
    const writePaths: string[] = [];
    const renamePairs: Array<[string, string]> = [];
    const writeSpy = vi
      .spyOn(fsPromises, "writeFile")
      .mockImplementation(async (path, data, options) => {
        writePaths.push(String(path));
        return realWriteFile(path, data, options);
      });
    const renameSpy = vi.spyOn(fsPromises, "rename").mockImplementation(async (from, to) => {
      renamePairs.push([String(from), String(to)]);
      return realRename(from, to);
    });

    try {
      await writeIndex(workspaceId, index());
    } finally {
      writeSpy.mockRestore();
      renameSpy.mockRestore();
    }

    expect(writePaths).toContainEqual(expect.stringMatching(/index\.json\.\d+\.\d+\.tmp$/));
    expect(renamePairs).toContainEqual([
      expect.stringMatching(/index\.json\.\d+\.\d+\.tmp$/),
      indexFilePath(),
    ]);
  });
});
