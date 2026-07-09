import { z } from "zod";

export const listWorkflowsInputSchema = z
  .object({ projectId: z.string().min(1).optional() })
  .optional()
  .default({});

export const saveWorkflowInputSchema = z.object({
  name: z.string().min(1),
  yaml: z.string(),
  projectId: z.string().min(1).optional(),
});

export const deleteWorkflowInputSchema = z.object({
  name: z.string().min(1),
  projectId: z.string().min(1).optional(),
});
