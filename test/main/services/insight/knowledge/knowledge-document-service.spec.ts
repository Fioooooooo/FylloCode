import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  readKnowledgeEntry,
  saveKnowledgeEntry,
} from "@main/services/insight/knowledge/knowledge-document-service";

let tempRoot: string;
let knowledgeRoot: string;

const rawContent =
  "---\nname: markstream-vue-theme-subscription\ndescription: Keep theme subscription stable\ntype: project\n---\n\nBody with raw markdown.";

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
});
