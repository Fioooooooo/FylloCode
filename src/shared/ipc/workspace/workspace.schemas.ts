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

export const selectWorkspaceFolderInputSchema = z.void().optional();

export const createCollectionWorkspaceInputSchema = z
  .object({
    name: z.string().trim().min(1),
    folderIds: z.array(z.string().min(1)).min(1).max(16),
    primaryFolderId: z.string().min(1),
  })
  .strict();

export const updateWorkspaceDefinitionInputSchema = z
  .object({
    workspaceId: z.string().min(1),
    name: z.string().trim().min(1).optional(),
    folderIds: z.array(z.string().min(1)).min(1).max(16).optional(),
    primaryFolderId: z.string().min(1).optional(),
    confirmHistoricalSessions: z.boolean().optional(),
  })
  .strict();

export const workspaceLifecycleIdInputSchema = z
  .object({ workspaceId: z.string().min(1) })
  .strict();

export const relocateFolderInputSchema = z
  .object({
    folderId: z.string().min(1),
    confirmHistoricalSessions: z.boolean().optional(),
  })
  .strict();
