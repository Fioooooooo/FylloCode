import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  computeKnowledgeAnchorStatus,
  readKnowledgeIndex,
  serializeKnowledgeEntry,
  sha256StableJson,
  writeKnowledgeEntry,
} from "../../../src/mcp-servers/fyllo-cortex/src/utils/knowledge";
import type { KnowledgeEntryDraft } from "../../../src/shared/types/knowledge";

const hashA = "a".repeat(64);
const hashB = "b".repeat(64);

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "fyllo-knowledge-"));
});

afterEach(async () => {
  await import("node:fs/promises").then(({ rm }) => rm(root, { recursive: true, force: true }));
});

function entry(overrides: Partial<KnowledgeEntryDraft> = {}): KnowledgeEntryDraft {
  return {
    name: "message-markdown-theme-subscription",
    description: "Read before changing markstream-vue theme subscription wiring",
    type: "project",
    createdAt: "2026-07-11T00:00:00.000Z",
    updatedAt: "2026-07-11T00:00:00.000Z",
    anchors: [
      {
        kind: "file",
        file: "src/renderer/src/components/chat/MessageMarkdown.vue",
        hash: hashA,
      },
    ],
    body: "Theme subscriptions must stay outside leaf markdown instances.",
    ...overrides,
  };
}

describe("knowledge storage utils", () => {
  it("returns an empty index when the knowledge directory is missing", async () => {
    await expect(readKnowledgeIndex(join(root, "knowledge"), root)).resolves.toEqual({
      entries: [],
      errors: [],
    });
  });

  it("scans markdown entries in stable order and isolates malformed frontmatter", async () => {
    const knowledgeRoot = join(root, "knowledge");
    await mkdir(knowledgeRoot, { recursive: true });
    await writeFile(
      join(knowledgeRoot, "message-markdown-theme-subscription.md"),
      serializeKnowledgeEntry(entry())
    );
    await writeFile(
      join(knowledgeRoot, "broken.md"),
      ["---", "name: [", "---", "body"].join("\n"),
      "utf8"
    );
    await writeFile(
      join(knowledgeRoot, "api-contract-reference.md"),
      serializeKnowledgeEntry(
        entry({
          name: "api-contract-reference",
          description: "Reference entry",
          type: "reference",
          body: "Reference content.",
        })
      )
    );
    await writeFile(
      join(knowledgeRoot, "wrong-name.md"),
      serializeKnowledgeEntry(
        entry({
          name: "right-name",
          description: "Mismatched filename",
          body: "This file should not enter the index.",
        })
      )
    );

    const index = await readKnowledgeIndex(knowledgeRoot, root);

    expect(index.entries.map((item) => item.name)).toEqual([
      "api-contract-reference",
      "message-markdown-theme-subscription",
    ]);
    expect(index.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "broken.md",
          type: "parse",
        }),
        expect.objectContaining({
          path: "wrong-name.md",
          type: "parse",
          message: expect.stringContaining("filename does not match"),
        }),
      ])
    );
  });

  it("normalizes unambiguous frontmatter shorthand while scanning entries", async () => {
    const knowledgeRoot = join(root, "knowledge");
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(knowledgeRoot, { recursive: true });
    await writeFile(join(root, "src", "example.ts"), "export const value = 1;\n", "utf8");
    await writeFile(
      join(knowledgeRoot, "chat-markdown-streaming-lifecycle.md"),
      [
        "---",
        "name: chat-markdown-streaming-lifecycle",
        "description: Read before changing streaming markdown rendering",
        "type: project",
        "createdAt: 2026-07-12T16:43:47Z",
        "updatedAt: 2026-07-12T16:43:47Z",
        "asOf: 2026-07-13",
        "anchors:",
        "  - file: src/example.ts",
        "    hash: 5d8f65d2774e206bc9f7a7a4ad39ca2dc563b5c31e46ab57ef4874961237ce29",
        "  - url: https://example.com/streaming",
        "    verifiedAt: 2026-07-13T00:43:47+08:00",
        '    maxAgeDays: "180"',
        "---",
        "Streaming markdown has separate transport, visibility, and final parse phases.",
        "",
      ].join("\n"),
      "utf8"
    );

    const index = await readKnowledgeIndex(knowledgeRoot, root);

    expect(index.errors).toEqual([]);
    expect(index.entries).toHaveLength(1);
    expect(index.entries[0]).toMatchObject({
      name: "chat-markdown-streaming-lifecycle",
      createdAt: "2026-07-12T16:43:47.000Z",
      updatedAt: "2026-07-12T16:43:47.000Z",
      asOf: "2026-07-13T00:00:00.000Z",
      anchors: [
        {
          kind: "file",
          file: "src/example.ts",
          hash: "5d8f65d2774e206bc9f7a7a4ad39ca2dc563b5c31e46ab57ef4874961237ce29",
        },
        {
          kind: "url",
          url: "https://example.com/streaming",
          verifiedAt: "2026-07-12T16:43:47.000Z",
          maxAgeDays: 180,
        },
      ],
    });
  });

  it("serializes entries with YAML frontmatter and rejects unsafe names", async () => {
    expect(serializeKnowledgeEntry(entry())).toMatch(
      /^---\nname: message-markdown-theme-subscription\n/
    );

    expect(() => serializeKnowledgeEntry(entry({ name: "../escape" }))).toThrow(/invalid/i);
  });

  it("writes entries atomically and rejects duplicate names", async () => {
    const knowledgeRoot = join(root, "knowledge");
    await writeKnowledgeEntry(knowledgeRoot, entry());

    const file = await readFile(
      join(knowledgeRoot, "message-markdown-theme-subscription.md"),
      "utf8"
    );
    expect(file).toContain("Theme subscriptions must stay outside leaf markdown instances.");

    await expect(writeKnowledgeEntry(knowledgeRoot, entry())).rejects.toThrow(/already exists/i);
  });

  it("computes active, suspect, unknown, and audit-exempt anchor status", async () => {
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "example.ts"), "export const value = 1;\n", "utf8");
    await writeFile(
      join(root, "pnpm-lock.yaml"),
      [
        "packages:",
        "  '@modelcontextprotocol/sdk@1.20.0':",
        "    resolution: {integrity: sha512-original}",
      ].join("\n"),
      "utf8"
    );

    const activeFile = await computeKnowledgeAnchorStatus(root, [
      {
        kind: "file",
        file: "src/example.ts",
        hash: "5d8f65d2774e206bc9f7a7a4ad39ca2dc563b5c31e46ab57ef4874961237ce29",
      },
    ]);
    const changedFile = await computeKnowledgeAnchorStatus(root, [
      { kind: "file", file: "src/example.ts", hash: hashB },
    ]);
    const missingFile = await computeKnowledgeAnchorStatus(root, [
      { kind: "file", file: "src/missing.ts", hash: hashB },
    ]);
    const activePackage = await computeKnowledgeAnchorStatus(root, [
      {
        kind: "package",
        package: "@modelcontextprotocol/sdk",
        version: "1.20.0",
        resolutionDigest: sha256StableJson({
          resolution: { integrity: "sha512-original" },
        }),
      },
    ]);
    const changedPackage = await computeKnowledgeAnchorStatus(root, [
      {
        kind: "package",
        package: "@modelcontextprotocol/sdk",
        version: "1.20.0",
        resolutionDigest: hashB,
      },
    ]);
    const staleUrl = await computeKnowledgeAnchorStatus(root, [
      { kind: "url", url: "https://example.com", verifiedAt: "2026-01-01T00:00:00.000Z" },
    ]);
    const auditExempt = await computeKnowledgeAnchorStatus(root, undefined);

    expect(activeFile.status).toBe("active");
    expect(changedFile.status).toBe("suspect");
    expect(missingFile.status).toBe("unknown");
    expect(activePackage.status).toBe("active");
    expect(changedPackage.status).toBe("suspect");
    expect(staleUrl.status).toBe("suspect");
    expect(auditExempt).toEqual({ status: "active", details: [] });
  });
});
