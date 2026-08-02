import { z } from "zod";
import { workspaceProposalRefSchema } from "./common.schemas";

export const applyInputSchema = workspaceProposalRefSchema.extend({
  workflowId: z.string().min(1),
});

export const stageStreamInputSchema = workspaceProposalRefSchema.extend({
  runId: z.string().min(1),
  stageIndex: z.number().int().nonnegative(),
});

export const stageStreamCancelInputSchema = z.object({
  workspaceId: z.string().min(1),
  runId: z.string().min(1),
});

export const loadRunInputSchema = workspaceProposalRefSchema;

export const loadRunMessagesInputSchema = workspaceProposalRefSchema.extend({
  stageIndex: z.number().int().nonnegative(),
});
