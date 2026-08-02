import { z } from "zod";

export const getGuidelinesBrowserInputSchema = z.object({
  workspaceId: z.string().min(1),
});
