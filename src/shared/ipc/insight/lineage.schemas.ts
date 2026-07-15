import { z } from "zod";
import type { LineageTaskRef, LineageTaskSnapshot } from "@shared/types/lineage";

// Task reference format: `<source>:<id>`, e.g. `local:task-123` or `yunxiao:ABC-123`.
// Sources are limited to the TaskSource values supported by the lineage service.
const taskRefPattern = /^(local|yunxiao|github):.+$/;

export const lineageTaskRefSchema = z.custom<LineageTaskRef>(
  (value) => typeof value === "string" && taskRefPattern.test(value),
  { message: "task ref must match <source>:<id>" }
);

const taskSnapshotObjectSchema = z.custom<LineageTaskSnapshot["snapshot"]>(
  (value) => typeof value === "object" && value !== null && !Array.isArray(value),
  { message: "snapshot must be an object" }
);

// Plan slug format: `yyyy-MM-dd-slug-word`, e.g. `2026-07-11-add-knowledge-tool`.
// Kept in sync with src/shared/schemas/fyllo-action.ts.
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

// sessionId is used as a directory name under `data/projects/<encoded>/sessions`,
// so it must be a safe path segment.
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

export const getBrowserInputSchema = z.object({
  projectId: z.string().min(1),
});

export const createSessionTaskInputSchema = z.object({
  projectId: z.string().min(1),
  sessionId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  actionId: z.string().optional(),
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
