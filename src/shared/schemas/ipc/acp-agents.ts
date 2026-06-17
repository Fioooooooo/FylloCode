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

const customAgentConfigSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

export const saveCustomAgentsInputSchema = z.object({
  agent_servers: z.record(z.string(), customAgentConfigSchema),
});

export const promptCapabilitiesCacheSchema = z.record(z.string(), promptCapabilitiesSchema);
