import { z } from "zod";

export const getByIdInputSchema = z.object({ id: z.string().min(1) });

export const updateProjectInputSchema = z.object({
  id: z.string().min(1),
  patch: z.object({
    name: z.string().min(1).optional(),
    path: z.string().min(1).optional(),
    healthScore: z.number().min(0).max(100).optional(),
    createdAt: z.union([z.date(), z.string()]).optional(),
    lastOpenedAt: z.union([z.date(), z.string()]).optional(),
    pathMissing: z.boolean().optional(),
  }),
});

export const removeProjectInputSchema = z.object({ id: z.string().min(1) });
