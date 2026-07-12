import { z } from "zod";
import { knowledgeEntryNameSchema } from "@shared/schemas/knowledge";

export const readKnowledgeEntryInputSchema = z.strictObject({
  projectId: z.string().min(1),
  name: knowledgeEntryNameSchema,
});

export const saveKnowledgeEntryInputSchema = readKnowledgeEntryInputSchema.extend({
  content: z.string().max(50_000),
});

export type ReadKnowledgeEntryIpcInput = z.infer<typeof readKnowledgeEntryInputSchema>;
export type SaveKnowledgeEntryIpcInput = z.infer<typeof saveKnowledgeEntryInputSchema>;
