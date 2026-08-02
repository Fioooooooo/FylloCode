import { z } from "zod";

export const getProjectOverviewInputSchema = z.object({
  workspaceId: z.string().min(1),
});
