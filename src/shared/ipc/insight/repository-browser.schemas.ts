import { z } from "zod";

export const repositoryFolderStatusSchema = z.enum(["ready", "missing", "error"]);

export const repositoryAggregateCompletenessSchema = z.enum(["complete", "partial"]);

export const repositoryItemWarningSchema = z.object({
  message: z.string().min(1),
  itemPath: z.string().min(1).optional(),
});

export function repositoryAggregateSchema<T extends z.ZodType>(itemSchema: T) {
  const folderSchema = z.object({
    folderId: z.string().min(1),
    folderName: z.string().min(1),
    folderPath: z.string().min(1),
    isPrimary: z.boolean(),
    status: repositoryFolderStatusSchema,
    items: z.array(itemSchema),
    warnings: z.array(repositoryItemWarningSchema),
    error: z.string().min(1).optional(),
  });

  return z.object({
    folders: z.array(folderSchema),
    items: z.array(itemSchema),
    completeness: repositoryAggregateCompletenessSchema,
    excludedFolderIds: z.array(z.string().min(1)),
  });
}
