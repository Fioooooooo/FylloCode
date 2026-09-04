import { z } from "zod";

const storageIdentitySchema = z.string().min(1);
const proposalPersistSchema = z.enum(["session", "workspace"]);

export const listWorkflowProposalsInputSchema = z
  .object({
    workspaceId: storageIdentitySchema,
    parentSessionId: storageIdentitySchema,
  })
  .strict();

export const getWorkflowProposalDetailInputSchema = z
  .object({
    workspaceId: storageIdentitySchema,
    parentSessionId: storageIdentitySchema,
    proposalId: storageIdentitySchema,
  })
  .strict();

export const confirmWorkflowProposalInputSchema = z
  .object({
    workspaceId: storageIdentitySchema,
    parentSessionId: storageIdentitySchema,
    proposalId: storageIdentitySchema,
    persist: proposalPersistSchema,
  })
  .strict();

export const dispatchWorkflowProposalConfirmInputSchema = z
  .object({
    workspaceId: storageIdentitySchema,
    parentSessionId: storageIdentitySchema,
    proposalId: storageIdentitySchema,
    persist: proposalPersistSchema,
    streamId: storageIdentitySchema,
  })
  .strict();

export const cancelWorkflowProposalInputSchema = z
  .object({
    workspaceId: storageIdentitySchema,
    parentSessionId: storageIdentitySchema,
    proposalId: storageIdentitySchema,
  })
  .strict();

export const workflowProposalWakePayloadSchema = z
  .object({
    workspaceId: storageIdentitySchema,
    parentSessionId: storageIdentitySchema,
    proposalId: storageIdentitySchema,
  })
  .strict();
