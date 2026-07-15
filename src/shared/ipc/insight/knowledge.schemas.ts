import { z } from "zod";
import { knowledgeEntryNameSchema } from "@shared/schemas/knowledge";

export const getKnowledgeBrowserInputSchema = z.strictObject({
  projectId: z.string().min(1),
});

export const readKnowledgeEntryInputSchema = getKnowledgeBrowserInputSchema.extend({
  name: knowledgeEntryNameSchema,
});

export const saveKnowledgeEntryInputSchema = readKnowledgeEntryInputSchema.extend({
  content: z.string().max(50_000),
});

export const deleteKnowledgeEntryInputSchema = readKnowledgeEntryInputSchema;

export type GetKnowledgeBrowserIpcInput = z.infer<typeof getKnowledgeBrowserInputSchema>;
export type ReadKnowledgeEntryIpcInput = z.infer<typeof readKnowledgeEntryInputSchema>;
export type SaveKnowledgeEntryIpcInput = z.infer<typeof saveKnowledgeEntryInputSchema>;
export type DeleteKnowledgeEntryIpcInput = z.infer<typeof deleteKnowledgeEntryInputSchema>;
