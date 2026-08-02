import { z } from "zod";

export const getContextInputSchema = z.void().optional();

export const openWorkspaceInputSchema = z
  .object({
    workspaceId: z.string().min(1),
  })
  .strict();

export const openFolderInputSchema = z.void().optional();

export const openLauncherInputSchema = z.void().optional();

export type OpenWorkspaceInput = z.infer<typeof openWorkspaceInputSchema>;
export type OpenFolderInput = z.infer<typeof openFolderInputSchema>;
export type OpenLauncherInput = z.infer<typeof openLauncherInputSchema>;
