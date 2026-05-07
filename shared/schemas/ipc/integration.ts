import { z } from "zod";

export const toolIdInputSchema = z.object({ toolId: z.string().min(1) });

export const connectInputSchema = z.object({
  toolId: z.string().min(1),
  credentials: z.record(z.string(), z.string()),
});

export const listProjectConfigsInputSchema = z.object({ projectId: z.string().min(1) });

export const setProjectConfigInputSchema = z.object({
  projectId: z.string().min(1),
  toolId: z.string().min(1),
  enabled: z.boolean(),
  overrides: z.record(z.string(), z.unknown()),
});

export const createCustomInputSchema = z.object({
  name: z.string().min(1),
  mcpServerUrl: z.string().min(1),
  skillConfig: z.string(),
});

export const removeCustomInputSchema = z.object({ id: z.string().min(1) });

export const yunxiaoSetTokenInputSchema = z.object({ token: z.string().min(1) });

export const yunxiaoSetOrganizationInputSchema = z.object({
  organizationId: z.string().min(1),
});
