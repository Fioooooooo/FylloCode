import { z } from "zod";

export const guidelineRefSchema = z.object({
  folderId: z.string().min(1),
  path: z.string().min(1),
});

export const getGuidelinesBrowserInputSchema = z.object({
  workspaceId: z.string().min(1),
});
