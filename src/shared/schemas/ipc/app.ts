import { z } from "zod";

export const openDevToolsInputSchema = z.object({}).strict();

export const reportRendererErrorInputSchema = z
  .object({
    source: z.enum(["vue", "window-error", "unhandledrejection"]),
    message: z.string().min(1).max(8000),
    timestamp: z.string().min(1),
    name: z.string().min(1).max(200).optional(),
    stack: z.string().min(1).max(16000).optional(),
    info: z.string().min(1).max(2000).optional(),
    route: z.string().min(1).max(2000).optional(),
  })
  .strict();
