import { z } from "zod";

export const taskCreateFylloActionPayloadSchema = z.strictObject({
  title: z.string().min(1),
  description: z.string().optional(),
});

const fullPlanSlugPattern = /^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*$/;

export const planCreateFylloActionPayloadSchema = z.strictObject({
  slug: z
    .string()
    .min(1)
    .regex(fullPlanSlugPattern)
    .refine(
      (slug) =>
        !slug.includes("/") && !slug.includes("\\") && !slug.includes(".") && !/\s/.test(slug),
      "plan slug must not contain path separators, dots, or whitespace"
    ),
  goal: z.string().min(1),
});

export const fylloActionStateStatusSchema = z.enum(["succeeded", "failed", "cancelled"]);

export const fylloActionStateSchema = z.strictObject({
  type: z.enum(["task.create", "plan.create"]),
  status: fylloActionStateStatusSchema,
  updatedAt: z.string().datetime(),
});
