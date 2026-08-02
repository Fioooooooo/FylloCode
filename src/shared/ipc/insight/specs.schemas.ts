import { z } from "zod";

export const getSpecsBrowserInputSchema = z.object({
  workspaceId: z.string().min(1),
});
