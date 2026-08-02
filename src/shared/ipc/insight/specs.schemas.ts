import { z } from "zod";

export const specRefSchema = z.object({
  folderId: z.string().min(1),
  specId: z.string().min(1),
});

export const getSpecsBrowserInputSchema = z.object({
  workspaceId: z.string().min(1),
});
