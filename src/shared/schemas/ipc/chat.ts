import { z } from "zod";
import { chatPromptPartSchema } from "@shared/types/chat-prompt";

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

function getBase64DecodedByteLength(value: string): number | null {
  const normalized = value.replace(/\s/g, "");
  if (normalized.length === 0 || normalized.length % 4 !== 0) {
    return null;
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
    return null;
  }

  const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
  return (normalized.length / 4) * 3 - padding;
}

const userTextPartSchema = z
  .object({
    type: z.literal("text"),
    text: z.string(),
  })
  .passthrough();

const userFilePartSchema = z
  .object({
    type: z.literal("file"),
    mediaType: z.string().min(1),
    url: z.string().refine((value) => value.startsWith("file://"), {
      message: "file part url must be a file:// URI",
    }),
    filename: z.string().min(1),
  })
  .passthrough();

const userMessagePartsSchema = z
  .array(z.discriminatedUnion("type", [userTextPartSchema, userFilePartSchema]))
  .min(1)
  .refine((parts) => parts.some((part) => part.type === "text"), {
    message: "user message parts must include at least one text part",
  });

export const listSessionsInputSchema = z.object({
  projectId: z.string().min(1),
  page: z.number().int().nonnegative().optional(),
  limit: z.number().int().positive().optional(),
});

export const createSessionInputSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1),
  agentId: z.string().min(1),
  configOptions: z.array(z.unknown()).optional(),
  availableCommands: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        hint: z.string().optional(),
      })
    )
    .optional(),
  acpSessionId: z.string().min(1).optional(),
});

export const updateSessionInputSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  patch: z.object({
    title: z.string().min(1).optional(),
    agentId: z.string().min(1).optional(),
  }),
});

export const removeSessionInputSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
});

export const loadMessagesInputSchema = z.object({
  sessionId: z.string().min(1),
  projectId: z.string().min(1),
});

export const persistMessageInputSchema = z.object({
  sessionId: z.string().min(1),
  projectId: z.string().min(1),
  message: z
    .object({
      id: z.string().min(1),
      role: z.literal("user"),
      parts: userMessagePartsSchema,
      metadata: z.unknown().optional(),
    })
    .passthrough(),
});

export const saveAttachmentInputSchema = z.object({
  projectId: z.string().min(1),
  sessionId: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  base64Data: z
    .string()
    .min(1)
    .refine(
      (value) => {
        const byteLength = getBase64DecodedByteLength(value);
        return byteLength !== null && byteLength <= MAX_ATTACHMENT_BYTES;
      },
      { message: "base64Data must be valid base64 and decode to 25MB or less" }
    ),
});

export const readAttachmentDataUrlInputSchema = z.object({
  uri: z
    .string()
    .min(1)
    .refine((value) => value.startsWith("file://"), {
      message: "uri must be a file:// URI",
    }),
  mediaType: z
    .string()
    .min(1)
    .refine((value) => value.startsWith("image/"), {
      message: "mediaType must be an image/* media type",
    }),
});

export const streamMessageInputSchema = z.object({
  sessionId: z.string().min(1),
  projectId: z.string().min(1),
  agentId: z.string(),
  prompt: z.array(chatPromptPartSchema).min(1),
  acpSessionId: z.string().min(1).optional(),
});

export const streamCancelInputSchema = z.object({
  sessionId: z.string().min(1),
});

const setConfigOptionBaseSchema = z.object({
  projectId: z.string().min(1),
  sessionId: z.string().min(1),
  configId: z.string().min(1),
});

const setConfigOptionSelectSchema = setConfigOptionBaseSchema.extend({
  type: z.literal("select"),
  value: z.string().min(1),
});

const setConfigOptionBooleanSchema = setConfigOptionBaseSchema.extend({
  type: z.literal("boolean"),
  value: z.boolean(),
});

export const setConfigOptionInputSchema = z.discriminatedUnion("type", [
  setConfigOptionSelectSchema,
  setConfigOptionBooleanSchema,
]);

export type SetConfigOptionInput = z.infer<typeof setConfigOptionInputSchema>;

export const probeEnsureInputSchema = z.object({
  agentId: z.string().min(1),
  projectId: z.string().min(1),
});

export const probeCloseInputSchema = z.object({
  agentId: z.string().min(1),
});

const probeSetConfigOptionBaseSchema = z.object({
  agentId: z.string().min(1),
  configId: z.string().min(1),
});

const probeSetConfigOptionSelectSchema = probeSetConfigOptionBaseSchema.extend({
  type: z.literal("select"),
  value: z.string().min(1),
});

const probeSetConfigOptionBooleanSchema = probeSetConfigOptionBaseSchema.extend({
  type: z.literal("boolean"),
  value: z.boolean(),
});

export const probeSetConfigOptionInputSchema = z.discriminatedUnion("type", [
  probeSetConfigOptionSelectSchema,
  probeSetConfigOptionBooleanSchema,
]);

export type ProbeSetConfigOptionInput = z.infer<typeof probeSetConfigOptionInputSchema>;
