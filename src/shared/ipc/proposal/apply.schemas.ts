import { z } from "zod";

export const applyInputSchema = z.object({
  projectId: z.string().min(1),
  changeId: z.string().min(1),
  workflowId: z.string().min(1),
});

export const stageStreamInputSchema = z.object({
  runId: z.string().min(1),
  stageIndex: z.number().int().nonnegative(),
  projectId: z.string().min(1),
  changeId: z.string().min(1),
});

export const stageStreamCancelInputSchema = z.object({
  projectId: z.string().min(1),
  runId: z.string().min(1),
});

export const loadRunInputSchema = z.object({
  projectId: z.string().min(1),
  changeId: z.string().min(1),
});

export const loadRunMessagesInputSchema = z.object({
  projectId: z.string().min(1),
  changeId: z.string().min(1),
  stageIndex: z.number().int().nonnegative(),
});
