import { z } from "zod";

const storageIdentitySchema = z.string().min(1);

export const listWorkflowProposalDecisionsInputSchema = z
  .object({ workspaceId: storageIdentitySchema })
  .strict();

export const dispatchWorkflowProposalDecisionInputSchema = z
  .object({
    workspaceId: storageIdentitySchema,
    notificationId: storageIdentitySchema,
    streamId: storageIdentitySchema,
  })
  .strict();

export const workflowProposalDecisionWakePayloadSchema = z
  .object({ workspaceId: storageIdentitySchema })
  .strict();
