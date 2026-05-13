import { z } from "zod";

export const toolIdInputSchema = z.object({ toolId: z.string().min(1) });
export const providerIdInputSchema = z.object({ providerId: z.string().min(1) });

export const connectInputSchema = z.object({
  toolId: z.string().min(1),
  credentials: z.record(z.string(), z.string()),
});

export const providerConnectInputSchema = z.object({
  providerId: z.string().min(1),
  credentials: z.record(z.string(), z.string()),
});

export const listProjectConfigsInputSchema = z.object({ projectId: z.string().min(1) });

export const getProjectIntegrationInputSchema = z.object({ projectId: z.string().min(1) });

export const setProjectConfigInputSchema = z.object({
  projectId: z.string().min(1),
  toolId: z.string().min(1),
  enabled: z.boolean(),
  overrides: z.record(z.string(), z.unknown()),
});

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

export const listProviderResourcesInputSchema = z.object({
  providerId: z.string().min(1),
  resourceType: z.string().min(1),
  query: z.record(z.string(), z.unknown()).optional(),
});

export const yunxiaoSetTokenInputSchema = z.object({ token: z.string().min(1) });

export const yunxiaoSetOrganizationInputSchema = z.object({
  organizationId: z.string().min(1),
});
