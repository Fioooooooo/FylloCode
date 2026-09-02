import { z } from "zod";

const storageIdentitySchema = z.string().min(1);

export const listWorkflowsInputSchema = z.object({ workspaceId: storageIdentitySchema }).strict();

export const saveWorkflowInputSchema = z
  .object({
    workspaceId: storageIdentitySchema,
    workflowId: storageIdentitySchema.optional(),
    yaml: z.string(),
  })
  .strict();

export const deleteWorkflowInputSchema = z
  .object({
    workspaceId: storageIdentitySchema,
    workflowId: storageIdentitySchema,
  })
  .strict();
