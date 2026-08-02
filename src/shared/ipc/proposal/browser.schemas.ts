import { z } from "zod";

export const listProposalsInputSchema = z.object({ workspaceId: z.string().min(1) });

export const readProposalFileInputSchema = z.object({
  workspaceId: z.string().min(1),
  changeId: z.string().min(1),
  filename: z.string().min(1),
});

export const getProposalSpecDeltasInputSchema = z.object({
  workspaceId: z.string().min(1),
  changeId: z.string().min(1),
});

export const watchProposalInputSchema = z.object({
  workspaceId: z.string().min(1),
  changeId: z.string().min(1),
  sessionId: z.string().min(1),
});
