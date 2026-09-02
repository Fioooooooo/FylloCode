import { z } from "zod";

const storageIdentitySchema = z.string().min(1);

export const listWorkflowRunsInputSchema = z
  .object({
    workspaceId: storageIdentitySchema,
    parentSessionId: storageIdentitySchema,
  })
  .strict();

export const getWorkflowRunDetailInputSchema = z
  .object({
    workspaceId: storageIdentitySchema,
    parentSessionId: storageIdentitySchema,
    runId: storageIdentitySchema,
  })
  .strict();

export const decideWorkflowRunInputSchema = z
  .object({
    workspaceId: storageIdentitySchema,
    parentSessionId: storageIdentitySchema,
    runId: storageIdentitySchema,
    decision: z.enum(["approve", "reject"]),
  })
  .strict();

export const workflowRunWakePayloadSchema = z
  .object({
    workspaceId: storageIdentitySchema,
    runId: storageIdentitySchema,
  })
  .strict();
