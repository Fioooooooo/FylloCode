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
