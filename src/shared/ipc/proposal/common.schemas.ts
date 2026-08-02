import { z } from "zod";

export const proposalRefSchema = z.object({
  folderId: z.string().min(1),
  changeId: z.string().min(1),
});

export const workspaceProposalRefSchema = proposalRefSchema.extend({
  workspaceId: z.string().min(1),
});
