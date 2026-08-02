import { z } from "zod";

export const listWorkflowsInputSchema = z.object({ workspaceId: z.string().min(1) });

export const saveWorkflowInputSchema = z.object({
  name: z.string().min(1),
  yaml: z.string(),
  workspaceId: z.string().min(1),
});

export const deleteWorkflowInputSchema = z.object({
  name: z.string().min(1),
  workspaceId: z.string().min(1),
});
