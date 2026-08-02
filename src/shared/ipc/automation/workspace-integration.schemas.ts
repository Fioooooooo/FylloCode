import { z } from "zod";

export const getWorkspaceIntegrationInputSchema = z.object({ workspaceId: z.string().min(1) });

export const providerResourceEntrySchema = z.object({
  providerId: z.string().min(1),
  resourceType: z.string().min(1),
  resourceId: z.string().min(1),
  folderId: z.string().min(1).optional(),
});

export const setWorkspaceIntegrationInputSchema = z.object({
  workspaceId: z.string().min(1),
  stage: z.string().min(1),
  resources: z.array(providerResourceEntrySchema),
});
