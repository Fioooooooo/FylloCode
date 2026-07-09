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

export const listProviderResourcesInputSchema = z.object({
  providerId: z.string().min(1),
  resourceType: z.string().min(1),
  query: z.record(z.string(), z.unknown()).optional(),
});
