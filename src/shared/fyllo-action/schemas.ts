import { z } from "zod";
import type {
  KnowledgeFlagActionPayload,
  KnowledgeReviewActionPayload,
} from "@shared/types/knowledge";
import { knowledgeEntryNameSchema, projectRelativePathSchema } from "@shared/schemas/knowledge";

export const fylloActionTypeSchema = z.enum([
  "task.create",
  "plan.create",
  "knowledge.flag",
  "knowledge.review",
]);

export const fylloActionStateStatusSchema = z.enum(["ready", "succeeded", "failed", "cancelled"]);

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
      .refine((summary) => summary.trim().length > 0, "summary must not be blank")
      .refine(
        (summary) => !summary.includes("\n") && !summary.includes("\r"),
        "summary must be a single line"
      ),
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

export const fylloActionStateSchema = z.strictObject({
  type: fylloActionTypeSchema,
  status: fylloActionStateStatusSchema,
  revision: z.number().int().nonnegative(),
  updatedAt: z.string().datetime(),
  error: z.string().max(1000).optional(),
});

export const persistedFylloActionStatesSchema = z.strictObject({
  version: z.literal(1),
  records: z.record(z.string().min(1), fylloActionStateSchema),
});

export const safeSessionIdSchema = z
  .string()
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    "sessionId must only contain alphanumeric characters, underscores, or hyphens"
  );

export const registerFylloActionInputSchema = z.strictObject({
  projectId: z.string().min(1),
  sessionId: safeSessionIdSchema,
  actionId: z.string().min(1),
  type: fylloActionTypeSchema,
});

export const fylloActionCommandSchema = z.enum(["succeed", "fail", "cancel"]);

export const transitionFylloActionInputSchema = z.strictObject({
  projectId: z.string().min(1),
  sessionId: safeSessionIdSchema,
  actionId: z.string().min(1),
  command: fylloActionCommandSchema,
  expectedRevision: z.number().int().nonnegative(),
  error: z.string().max(1000).optional(),
});

export const transitionFylloActionsInputSchema = z.strictObject({
  projectId: z.string().min(1),
  sessionId: safeSessionIdSchema,
  actionIds: z.array(z.string().min(1)).min(1),
  command: fylloActionCommandSchema,
  expectedRevisions: z.record(z.string().min(1), z.number().int().nonnegative()),
  error: z.string().max(1000).optional(),
});

export const transitionFylloActionResultSchema = z.strictObject({
  actionId: z.string().min(1),
  success: z.boolean(),
  record: fylloActionStateSchema.optional(),
  error: z.string().optional(),
});
