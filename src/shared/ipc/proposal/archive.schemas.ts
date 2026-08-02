import { z } from "zod";

export const archiveInputSchema = z.object({
  workspaceId: z.string().min(1),
  changeId: z.string().min(1),
});

export const archiveCancelInputSchema = archiveInputSchema;

export const loadArchiveInputSchema = z.object({
  workspaceId: z.string().min(1),
  changeId: z.string().min(1),
});

export const loadArchiveMessagesInputSchema = loadArchiveInputSchema;
