import { z } from "zod";

export const installAgentInputSchema = z.string().min(1);

export const uninstallAgentInputSchema = z.string().min(1);

export const ensureAgentInputSchema = z.object({
  agentId: z.string().min(1),
});

const promptCapabilitiesSchema = z.object({
  image: z.boolean(),
  audio: z.boolean(),
  embeddedContext: z.boolean(),
});

export const promptCapabilitiesCacheSchema = z.record(z.string(), promptCapabilitiesSchema);
