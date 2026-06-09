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
import { lineageDir, subjectsDir } from "@main/infra/storage/project-paths";

const projectPath = "/tmp/project";
const now = "2026-06-09T00:00:00.000Z";

function task(overrides: Partial<TaskItem> = {}): TaskItem {
  const createdAt = new Date("2026-06-01T00:00:00.000Z");
  return {
    id: "task-1",
    projectId: "tmp-project",
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
        proposals: [{ changeId: "change-1", createdAt: now }],
      },
    ],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function index(overrides: Partial<LineageIndex> = {}): LineageIndex {
  return {
    version: 1,
    tasks: { "local:task-1": "subject-1" },
    sessions: { "session-1": "subject-1" },
    proposals: { "change-1": "subject-1" },
    updatedAt: now,
    ...overrides,
  };
}

function subjectFilePath(subjectId = "subject-1"): string {
  return `${subjectsDir(projectPath)}/${subjectId}.json`;
}

function indexFilePath(): string {
  return `${lineageDir(projectPath)}/index.json`;
}

beforeEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

describe("lineage-store", () => {
  it("round-trips subjects and index files under lineage paths", async () => {
    await writeSubject(projectPath, subject());
    await writeIndex(projectPath, index());

    expect(JSON.parse(readFileSync(subjectFilePath(), "utf8"))).toMatchObject({
      id: "subject-1",
      origin: "task",
    });
    expect(JSON.parse(readFileSync(indexFilePath(), "utf8"))).toMatchObject({
      version: 1,
      tasks: { "local:task-1": "subject-1" },
    });
    await expect(readSubject(projectPath, "subject-1")).resolves.toEqual(subject());
    await expect(readIndex(projectPath)).resolves.toEqual(index());
  });

  it("returns null or empty results for missing and corrupt files", async () => {
    await expect(readSubject(projectPath, "missing")).resolves.toBeNull();
    await expect(readIndex(projectPath)).resolves.toBeNull();
    await expect(listSubjects(projectPath)).resolves.toEqual([]);

    mkdirSync(subjectsDir(projectPath), { recursive: true });
    writeFileSync(subjectFilePath("subject-bad"), "{not-json", "utf8");
    mkdirSync(lineageDir(projectPath), { recursive: true });
    writeFileSync(indexFilePath(), "{not-json", "utf8");

    await expect(readSubject(projectPath, "subject-bad")).resolves.toBeNull();
    await expect(readIndex(projectPath)).resolves.toBeNull();
    await expect(listSubjects(projectPath)).resolves.toEqual([]);
  });

  it("skips corrupt subject files while listing valid subjects", async () => {
    await writeSubject(projectPath, subject());
    writeFileSync(subjectFilePath("subject-bad"), "not-json", "utf8");

    await expect(listSubjects(projectPath)).resolves.toEqual([subject()]);
  });

  it("serializes concurrent writes to the same subject file", async () => {
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
        writeSubject(projectPath, subject({ updatedAt: "2026-06-09T00:00:01.000Z" })),
        writeSubject(projectPath, subject({ updatedAt: "2026-06-09T00:00:02.000Z" })),
      ]);
    } finally {
      writeSpy.mockRestore();
    }

    expect(maxConcurrentWrites).toBe(1);
    await expect(readSubject(projectPath, "subject-1")).resolves.toMatchObject({
      id: "subject-1",
    });
  });

  it("writes index files through a temp file followed by rename", async () => {
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
      await writeIndex(projectPath, index());
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
