import { z } from "zod";

export const getByIdInputSchema = z.object({ id: z.string().min(1) }).strict();

export const updateWorkspaceInputSchema = z
  .object({
    id: z.string().min(1),
    patch: z
      .object({
        name: z.string().min(1).optional(),
        healthScore: z.number().min(0).max(100).optional(),
      })
      .strict(),
  })
  .strict();

export const removeWorkspaceInputSchema = z.object({ id: z.string().min(1) }).strict();
