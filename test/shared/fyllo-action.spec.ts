import { describe, expect, it } from "vitest";
import { fylloActionContracts, getFylloActionContract } from "@shared/fyllo-action/registry";
import {
  fylloActionStateSchema,
  knowledgeFlagFylloActionPayloadSchema,
  knowledgeReviewFylloActionPayloadSchema,
  planCreateFylloActionPayloadSchema,
  taskCreateFylloActionPayloadSchema,
} from "@shared/fyllo-action/schemas";
import { knowledgeEntryDraftSchema } from "@shared/schemas/knowledge";

describe("Fyllo action shared schemas", () => {
  it("keeps existing task.create and plan.create schemas strict", () => {
    expect(taskCreateFylloActionPayloadSchema.parse({ title: "创建任务" })).toEqual({
      title: "创建任务",
    });
    expect(
      taskCreateFylloActionPayloadSchema.safeParse({
        title: "创建任务",
        confirmLabel: "创建",
      }).success
    ).toBe(false);

    expect(
      planCreateFylloActionPayloadSchema.parse({
        slug: "2026-07-11-add-knowledge-tool",
        goal: "Review implementation plan.",
      })
    ).toEqual({
      slug: "2026-07-11-add-knowledge-tool",
      goal: "Review implementation plan.",
    });
    expect(
      planCreateFylloActionPayloadSchema.safeParse({
        slug: "add-knowledge-tool",
        goal: "Review implementation plan.",
      }).success
    ).toBe(false);
  });

  it("registers knowledge flag and review action contracts with rail presentation", () => {
    expect(Object.values(fylloActionContracts).map((contract) => contract.type)).toEqual([
      "task.create",
      "plan.create",
      "knowledge.flag",
      "knowledge.review",
    ]);

    expect(getFylloActionContract("knowledge.flag")).toMatchObject({
      presentation: "rail",
      interaction: "confirm",
    });
    expect(getFylloActionContract("knowledge.review")).toMatchObject({
      presentation: "rail",
      interaction: "confirm",
    });
  });

  it("validates knowledge.flag payloads as strict low-cost candidates", () => {
    expect(
      knowledgeFlagFylloActionPayloadSchema.parse({
        summary:
          "markstream-vue theme subscriptions are expensive because each text part creates an instance.",
        contextPaths: ["src/renderer/src/components/chat/MessageMarkdown.vue"],
      })
    ).toEqual({
      summary:
        "markstream-vue theme subscriptions are expensive because each text part creates an instance.",
      contextPaths: ["src/renderer/src/components/chat/MessageMarkdown.vue"],
    });

    expect(knowledgeFlagFylloActionPayloadSchema.safeParse({ summary: "" }).success).toBe(false);
    expect(
      knowledgeFlagFylloActionPayloadSchema.safeParse({
        summary: "Valid summary",
        contextPaths: ["../secrets"],
      }).success
    ).toBe(false);
    expect(
      knowledgeFlagFylloActionPayloadSchema.safeParse({
        summary: "Valid summary",
        unexpected: true,
      }).success
    ).toBe(false);
  });

  it("rejects knowledge.flag summaries that span multiple lines", () => {
    expect(
      knowledgeFlagFylloActionPayloadSchema.safeParse({
        summary: "line\nbreak",
      }).success
    ).toBe(false);

    expect(
      knowledgeFlagFylloActionPayloadSchema.safeParse({
        summary: "carriage\rreturn",
      }).success
    ).toBe(false);

    expect(
      knowledgeFlagFylloActionPayloadSchema.safeParse({
        summary: "CRLF\r\npair",
      }).success
    ).toBe(false);
  });

  it("validates knowledge.review payloads by entry name", () => {
    const payload = {
      name: "markstream-vue-theme-subscription",
      summary: "Review the saved MessageMarkdown theme subscription knowledge.",
    };

    expect(knowledgeReviewFylloActionPayloadSchema.parse(payload)).toEqual(payload);
  });

  it("validates knowledge entries with package resolution digests", () => {
    const baseEntry = {
      name: "package-anchor-reference",
      description: "Read before changing the package anchor contract",
      type: "reference",
      createdAt: "2026-07-11T00:00:00.000Z",
      updatedAt: "2026-07-11T00:00:00.000Z",
      anchors: [
        {
          kind: "package",
          package: "@modelcontextprotocol/sdk",
          version: "1.20.0",
          resolutionDigest: "a".repeat(64),
        },
      ],
      body: "Package anchors compare pnpm lockfile package entry digests.",
    };

    expect(knowledgeEntryDraftSchema.parse(baseEntry)).toEqual(baseEntry);
    expect(
      knowledgeEntryDraftSchema.safeParse({
        ...baseEntry,
        anchors: [
          {
            kind: "package",
            package: "@modelcontextprotocol/sdk",
            version: "1.20.0",
            resolution: "sha512-original",
          },
        ],
      }).success
    ).toBe(false);
  });

  it("rejects unsafe knowledge.review payloads", () => {
    expect(
      knowledgeReviewFylloActionPayloadSchema.safeParse({
        name: "../escape",
      }).success
    ).toBe(false);

    expect(
      knowledgeReviewFylloActionPayloadSchema.safeParse({
        name: "valid-entry",
        summary: "   ",
      }).success
    ).toBe(false);

    expect(
      knowledgeReviewFylloActionPayloadSchema.safeParse({
        name: "valid-entry",
        items: [],
      }).success
    ).toBe(false);
  });

  it("allows action state for knowledge flag and review confirm actions", () => {
    expect(
      fylloActionStateSchema.parse({
        type: "knowledge.flag",
        status: "succeeded",
        revision: 1,
        updatedAt: "2026-07-11T00:00:00.000Z",
      })
    ).toEqual({
      type: "knowledge.flag",
      status: "succeeded",
      revision: 1,
      updatedAt: "2026-07-11T00:00:00.000Z",
    });

    expect(
      fylloActionStateSchema.parse({
        type: "knowledge.review",
        status: "succeeded",
        revision: 1,
        updatedAt: "2026-07-11T00:00:00.000Z",
      })
    ).toEqual({
      type: "knowledge.review",
      status: "succeeded",
      revision: 1,
      updatedAt: "2026-07-11T00:00:00.000Z",
    });

    expect(
      fylloActionStateSchema.safeParse({
        type: "unknown.action",
        status: "succeeded",
        revision: 1,
        updatedAt: "2026-07-11T00:00:00.000Z",
      }).success
    ).toBe(false);
  });
});
