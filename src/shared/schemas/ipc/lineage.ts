import { z } from "zod";
import type { LineageTaskRef, LineageTaskSnapshot } from "@shared/types/lineage";

const taskRefPattern = /^(local|yunxiao|github):.+$/;

export const lineageTaskRefSchema = z.custom<LineageTaskRef>(
  (value) => typeof value === "string" && taskRefPattern.test(value),
  { message: "task ref must match <source>:<id>" }
);

const taskSnapshotObjectSchema = z.custom<LineageTaskSnapshot["snapshot"]>(
  (value) => typeof value === "object" && value !== null && !Array.isArray(value),
  { message: "snapshot must be an object" }
);

const fullPlanSlugPattern = /^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*$/;

export const lineagePlanSlugSchema = z
  .string()
  .min(1)
  .regex(fullPlanSlugPattern)
  .refine(
    (slug) =>
      !slug.includes("/") && !slug.includes("\\") && !slug.includes(".") && !/\s/.test(slug),
    "plan slug must not contain path separators, dots, or whitespace"
  );

const lineagePlanSessionIdSchema = z
  .string()
  .min(1)
  .refine(
    (sessionId) =>
      !sessionId.includes("/") &&
      !sessionId.includes("\\") &&
      !sessionId.includes(".") &&
      !/\s/.test(sessionId),
    "sessionId must not contain path separators, dots, or whitespace"
  );

const lineageTaskSnapshotSchema = z.object({
  ref: lineageTaskRefSchema,
  snapshot: taskSnapshotObjectSchema,
  capturedAt: z.string().min(1),
});

export const ensureTaskSubjectInputSchema = z.object({
  projectId: z.string().min(1),
  snapshot: lineageTaskSnapshotSchema,
});

export const linkTaskSessionInputSchema = z.object({
  projectId: z.string().min(1),
  taskRef: lineageTaskRefSchema,
  sessionId: z.string().min(1),
});

export const getByTaskInputSchema = z.object({
  projectId: z.string().min(1),
  ref: lineageTaskRefSchema,
});

export const getBySessionInputSchema = z.object({
  projectId: z.string().min(1),
  sessionId: z.string().min(1),
});

export const createSessionTaskInputSchema = z.object({
  projectId: z.string().min(1),
  sessionId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
});

export const readPlanInputSchema = z.object({
  projectId: z.string().min(1),
  sessionId: lineagePlanSessionIdSchema,
  slug: lineagePlanSlugSchema,
});

export const savePlanBodyInputSchema = readPlanInputSchema.extend({
  body: z.string(),
});

export const approvePlanInputSchema = readPlanInputSchema;
