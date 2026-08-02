import { z } from "zod";

export const prepareLocalFilePreviewInputSchema = z
  .object({
    requestedPath: z.string().min(1),
    sessionId: z.string().min(1).optional(),
  })
  .strict();

export const confirmLocalFilePreviewInputSchema = z
  .object({
    authorizationId: z.string().uuid(),
    rememberForWindow: z.boolean(),
    sessionId: z.string().min(1).optional(),
  })
  .strict();
