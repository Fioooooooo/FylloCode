import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  deleteKnowledgeEntry,
  getKnowledgeBrowser,
  readKnowledgeEntry,
  saveKnowledgeEntry,
} from "@main/services/insight/knowledge/knowledge-document-service";
import { serializeKnowledgeEntry } from "@main/infra/storage/knowledge";

let tempRoot: string;
let knowledgeRoot: string;

const rawContent =
  "---\nname: markstream-vue-theme-subscription\ndescription: Keep theme subscription stable\ntype: project\n---\n\nBody with raw markdown.";

const indexedContent = serializeKnowledgeEntry({
  name: "markstream-vue-theme-subscription",
  description: "Keep theme subscription stable",
  type: "project",
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-02T00:00:00.000Z",
  source: { kind: "session", sessionId: "session-1" },
  body: "Body with raw markdown.",
});

describe("knowledge document service", () => {
  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "fyllo-knowledge-document-"));
    knowledgeRoot = join(tempRoot, "knowledge");
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("reads the complete markdown file without frontmatter preprocessing", async () => {
    await mkdir(knowledgeRoot, { recursive: true });
    await writeFile(
      join(knowledgeRoot, "markstream-vue-theme-subscription.md"),
      rawContent,
      "utf8"
    );

    await expect(
      readKnowledgeEntry(tempRoot, "markstream-vue-theme-subscription", { knowledgeRoot })
    ).resolves.toEqual({
      name: "markstream-vue-theme-subscription",
      content: rawContent,
    });
  });

  it("saves raw markdown content atomically without parsing frontmatter", async () => {
    const editedContent =
      "---\nname: markstream-vue-theme-subscription\ncustomField: retained\n---\n\nEdited body";

    await expect(
      saveKnowledgeEntry(
        tempRoot,
        {
          name: "markstream-vue-theme-subscription",
          content: editedContent,
        },
        { knowledgeRoot }
      )
    ).resolves.toEqual({
      name: "markstream-vue-theme-subscription",
      content: editedContent,
    });

    await expect(
      readFile(join(knowledgeRoot, "markstream-vue-theme-subscription.md"), "utf8")
    ).resolves.toBe(editedContent);
  });

  it("rejects invalid entry names before touching the filesystem", async () => {
    await expect(
      saveKnowledgeEntry(
        tempRoot,
        {
          name: "../escape",
          content: rawContent,
        },
        { knowledgeRoot }
      )
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    await expect(readFile(join(knowledgeRoot, "../escape.md"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("reports missing entries with a knowledge-specific IPC error code", async () => {
    await expect(
      readKnowledgeEntry(tempRoot, "markstream-vue-theme-subscription", { knowledgeRoot })
    ).rejects.toMatchObject({ code: "KNOWLEDGE_ENTRY_NOT_FOUND" });
  });

  it("returns browser summaries and isolates scanner errors without bodies", async () => {
    await mkdir(knowledgeRoot, { recursive: true });
    await writeFile(
      join(knowledgeRoot, "markstream-vue-theme-subscription.md"),
      indexedContent,
      "utf8"
    );
    await writeFile(join(knowledgeRoot, "broken-entry.md"), "not frontmatter", "utf8");
    await writeFile(join(knowledgeRoot, "broken entry.md"), "still broken", "utf8");

    await expect(getKnowledgeBrowser(tempRoot, { knowledgeRoot })).resolves.toEqual({
      entries: [
        {
          name: "markstream-vue-theme-subscription",
          description: "Keep theme subscription stable",
          type: "project",
          updatedAt: "2026-07-02T00:00:00.000Z",
          status: "active",
        },
      ],
      errors: [
        {
          path: "broken entry.md",
          type: "parse",
          message: "knowledge entry frontmatter is missing",
        },
        {
          path: "broken-entry.md",
          type: "parse",
          message: "knowledge entry frontmatter is missing",
          name: "broken-entry",
        },
      ],
    });
  });

  it("treats a missing knowledge directory as an empty browser", async () => {
    await expect(getKnowledgeBrowser(tempRoot, { knowledgeRoot })).resolves.toEqual({
      entries: [],
      errors: [],
    });
  });

  it("deletes one validated knowledge entry", async () => {
    await mkdir(knowledgeRoot, { recursive: true });
    const filePath = join(knowledgeRoot, "markstream-vue-theme-subscription.md");
    await writeFile(filePath, indexedContent, "utf8");

    await expect(
      deleteKnowledgeEntry(tempRoot, "markstream-vue-theme-subscription", { knowledgeRoot })
    ).resolves.toEqual({ name: "markstream-vue-theme-subscription" });
    await expect(readFile(filePath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects invalid or missing entries during deletion", async () => {
    await expect(
      deleteKnowledgeEntry(tempRoot, "../escape", { knowledgeRoot })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      deleteKnowledgeEntry(tempRoot, "missing-entry", { knowledgeRoot })
    ).rejects.toMatchObject({ code: "KNOWLEDGE_ENTRY_NOT_FOUND" });
  });
});
