import { z } from "zod";

export const listSessionsInputSchema = z.object({
  projectId: z.string().min(1),
  page: z.number().int().nonnegative().optional(),
  limit: z.number().int().positive().optional(),
});

export const createSessionInputSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1),
  agentId: z.string().min(1),
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
      parts: z.array(z.unknown()),
      metadata: z.unknown().optional(),
    })
    .passthrough(),
});

export const streamMessageInputSchema = z.object({
  sessionId: z.string().min(1),
  projectId: z.string().min(1),
  agentId: z.string(),
  prompt: z.string(),
});

export const streamCancelInputSchema = z.object({
  sessionId: z.string().min(1),
});
