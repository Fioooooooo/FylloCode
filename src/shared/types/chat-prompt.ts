import { z } from "zod";

export const chatPromptPartSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text"),
    text: z.string(),
  }),
  z.object({
    type: z.literal("image"),
    mediaType: z.string().min(1),
    uri: z.string().min(1),
    filename: z.string().min(1),
  }),
  z.object({
    type: z.literal("resource_link"),
    uri: z.string().min(1),
    mediaType: z.string().min(1),
    filename: z.string().min(1),
  }),
]);

export type ChatPromptPart = z.infer<typeof chatPromptPartSchema>;
