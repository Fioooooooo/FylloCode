import { z } from "zod";
import type {
  KnowledgeFlagActionPayload,
  KnowledgeReviewActionPayload,
} from "@shared/types/knowledge";
import { knowledgeEntryNameSchema, projectRelativePathSchema } from "@shared/schemas/knowledge";

export const taskCreateFylloActionPayloadSchema = z.strictObject({
  title: z.string().min(1),
  description: z.string().optional(),
});

// Plan slug format: `yyyy-MM-dd-slug-word`, e.g. `2026-07-11-add-knowledge-tool`.
// Kept in sync with src/shared/ipc/insight/lineage.schemas.ts and src/main/services/insight/lineage/plan.ts.
const fullPlanSlugPattern = /^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*$/;

export const planCreateFylloActionPayloadSchema = z.strictObject({
  slug: z
    .string()
    .min(1)
    .regex(fullPlanSlugPattern)
    // Slugs are used as file/directory names; reject characters that would break paths
    // or allow traversal, even though the regex already limits the alphabet.
    .refine(
      (slug) =>
        !slug.includes("/") && !slug.includes("\\") && !slug.includes(".") && !/\s/.test(slug),
      "plan slug must not contain path separators, dots, or whitespace"
    ),
  goal: z.string().min(1),
});

export const knowledgeFlagFylloActionPayloadSchema: z.ZodType<KnowledgeFlagActionPayload> =
  z.strictObject({
    summary: z
      .string()
      .min(1)
      .max(500)
      .refine((summary) => summary.trim().length > 0, "summary must not be blank"),
    contextPaths: z.array(projectRelativePathSchema).max(20).optional(),
  });

export const knowledgeReviewFylloActionPayloadSchema: z.ZodType<KnowledgeReviewActionPayload> =
  z.strictObject({
    name: knowledgeEntryNameSchema,
    summary: z
      .string()
      .min(1)
      .max(500)
      .refine((summary) => summary.trim().length > 0, "summary must not be blank")
      .optional(),
  });

export const fylloActionStateStatusSchema = z.enum(["succeeded", "failed", "cancelled"]);

export const fylloActionStateSchema = z.strictObject({
  type: z.enum(["task.create", "plan.create", "knowledge.flag", "knowledge.review"]),
  status: fylloActionStateStatusSchema,
  updatedAt: z.string().datetime(),
});
