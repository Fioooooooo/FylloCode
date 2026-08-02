import { z } from "zod";
import { workspaceProposalRefSchema } from "./common.schemas";

export const listProposalsInputSchema = z.object({ workspaceId: z.string().min(1) });

export const readProposalFileInputSchema = workspaceProposalRefSchema.extend({
  filename: z.string().min(1),
});

export const getProposalSpecDeltasInputSchema = workspaceProposalRefSchema;

export const watchProposalInputSchema = workspaceProposalRefSchema.extend({
  sessionId: z.string().min(1),
});
