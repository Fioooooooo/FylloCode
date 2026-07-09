import { z } from "zod";

export const getProjectOverviewInputSchema = z.object({
  projectId: z.string().min(1),
});
