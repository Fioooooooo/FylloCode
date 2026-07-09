import { z } from "zod";

export const getSpecsBrowserInputSchema = z.object({
  projectId: z.string().min(1),
});
