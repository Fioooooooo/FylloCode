import { z } from "zod";

export const getGuidelinesBrowserInputSchema = z.object({
  projectId: z.string().min(1),
});
