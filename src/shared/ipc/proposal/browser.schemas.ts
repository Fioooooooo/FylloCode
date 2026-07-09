import { z } from "zod";

export const listProposalsInputSchema = z.object({ projectId: z.string().min(1) });

export const readProposalFileInputSchema = z.object({
  projectId: z.string().min(1),
  changeId: z.string().min(1),
  filename: z.string().min(1),
});

export const getProposalSpecDeltasInputSchema = z.object({
  projectId: z.string().min(1),
  changeId: z.string().min(1),
});

export const watchProposalInputSchema = z.object({
  projectId: z.string().min(1),
  changeId: z.string().min(1),
  sessionId: z.string().min(1),
});
