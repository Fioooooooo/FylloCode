import { z } from "zod";

export const getContextInputSchema = z.void().optional();

export const openProjectInputSchema = z.object({
  projectId: z.string().min(1),
});

export const openFolderInputSchema = z.void().optional();

export const openLauncherInputSchema = z.void().optional();

export type OpenProjectInput = z.infer<typeof openProjectInputSchema>;
export type OpenFolderInput = z.infer<typeof openFolderInputSchema>;
export type OpenLauncherInput = z.infer<typeof openLauncherInputSchema>;
