import { z } from "zod";

export const prepareLocalFilePreviewInputSchema = z
  .object({
    requestedPath: z.string().min(1),
  })
  .strict();

export const confirmLocalFilePreviewInputSchema = z
  .object({
    authorizationId: z.string().uuid(),
    rememberForWindow: z.boolean(),
  })
  .strict();
