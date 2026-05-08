import { z } from "zod";

export const listProposalsInputSchema = z.object({ projectId: z.string().min(1) });

export const readProposalFileInputSchema = z.object({
  projectId: z.string().min(1),
  changeId: z.string().min(1),
  filename: z.string().min(1),
});

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
  runId: z.string().min(1),
});

export const archiveInputSchema = z.object({
  projectId: z.string().min(1),
  changeId: z.string().min(1),
});

export const archiveCancelInputSchema = archiveInputSchema;

export const loadRunInputSchema = z.object({
  projectId: z.string().min(1),
  changeId: z.string().min(1),
});

export const loadRunMessagesInputSchema = z.object({
  projectId: z.string().min(1),
  changeId: z.string().min(1),
  stageIndex: z.number().int().nonnegative(),
});

export const loadArchiveInputSchema = z.object({
  projectId: z.string().min(1),
  changeId: z.string().min(1),
});

export const loadArchiveMessagesInputSchema = loadArchiveInputSchema;
