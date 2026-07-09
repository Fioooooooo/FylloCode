import { z } from "zod";

export const getProjectIntegrationInputSchema = z.object({ projectId: z.string().min(1) });

export const providerResourceEntrySchema = z.object({
  providerId: z.string().min(1),
  resourceType: z.string().min(1),
  resourceId: z.string().min(1),
});

export const setProjectIntegrationInputSchema = z.object({
  projectId: z.string().min(1),
  stage: z.string().min(1),
  resources: z.array(providerResourceEntrySchema),
});
