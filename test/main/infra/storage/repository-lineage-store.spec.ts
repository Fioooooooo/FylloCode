import { promises as fs } from "fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  appendRepositoryLineageRelation,
  readRepositoryLineageIndex,
  RepositoryLineageOriginConflictError,
} from "@main/infra/storage/repository-lineage-store";
import { repositoryLineageIndexPath } from "@main/infra/storage/workspace-paths";

let dataRoot: string;

vi.mock("@main/infra/paths", () => ({
  getDataSubPath: (name: string) => join(dataRoot, name),
}));

beforeEach(async () => {
  dataRoot = await mkdtemp(join(tmpdir(), "fyllo-repository-lineage-"));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(dataRoot, { recursive: true, force: true });
});

function relation(subjectId: string, kind: "origin" | "reference" = "reference") {
  return {
    workspaceId: `workspace-${subjectId}`,
    subjectId,
    relation: kind,
    linkedAt: "2026-08-03T00:00:00.000Z",
  } as const;
}

describe("repository-lineage-store", () => {
  it("stores Folder-owned indexes and replays a relation idempotently", async () => {
    const object = { kind: "proposal", changeId: "same-change" } as const;
    await expect(
      appendRepositoryLineageRelation("folder-a", object, relation("subject-a", "origin"))
    ).resolves.toMatchObject({ changed: true });
    await expect(
      appendRepositoryLineageRelation("folder-a", object, relation("subject-a", "origin"))
    ).resolves.toMatchObject({ changed: false });

    await expect(readRepositoryLineageIndex("folder-a")).resolves.toMatchObject({
      version: 2,
      proposals: { "same-change": [relation("subject-a", "origin")] },
    });
    expect(repositoryLineageIndexPath("folder-a")).toContain(
      "workspace-folders/folder-a/lineage/index.json"
    );
  });

  it("retains both concurrent references to one proposal", async () => {
    const object = { kind: "proposal", changeId: "same-change" } as const;
    await Promise.all([
      appendRepositoryLineageRelation("folder-a", object, relation("subject-a")),
      appendRepositoryLineageRelation("folder-a", object, relation("subject-b")),
    ]);

    const index = await readRepositoryLineageIndex("folder-a");
    expect(index.proposals["same-change"]).toEqual([relation("subject-a"), relation("subject-b")]);
  });

  it("rejects a different second origin without replacing the first", async () => {
    const object = { kind: "commit", commitHash: "abc123" } as const;
    await appendRepositoryLineageRelation("folder-a", object, relation("subject-a", "origin"));

    await expect(
      appendRepositoryLineageRelation("folder-a", object, relation("subject-b", "origin"))
    ).rejects.toBeInstanceOf(RepositoryLineageOriginConflictError);
    expect((await readRepositoryLineageIndex("folder-a")).commits.abc123).toEqual([
      relation("subject-a", "origin"),
    ]);
  });

  it("keeps the previous valid index when atomic rename fails", async () => {
    const object = { kind: "proposal", changeId: "same-change" } as const;
    await appendRepositoryLineageRelation("folder-a", object, relation("subject-a", "origin"));
    vi.spyOn(fs, "rename").mockRejectedValueOnce(new Error("rename failed"));

    await expect(
      appendRepositoryLineageRelation("folder-a", object, relation("subject-b"))
    ).rejects.toThrow("rename failed");

    const content = JSON.parse(await readFile(repositoryLineageIndexPath("folder-a"), "utf8")) as {
      proposals: Record<string, unknown[]>;
    };
    expect(content.proposals["same-change"]).toHaveLength(1);
  });
});
