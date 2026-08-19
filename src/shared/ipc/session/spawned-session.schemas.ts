import { z } from "zod";

const sessionIdSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[^/\\\0]+$/);
const isoDateTimeSchema = z.string().datetime();

export const spawnedSessionDisplayStatusSchema = z.enum([
  "starting",
  "running",
  "idle",
  "error",
  "expired",
  "interrupted",
]);

export const spawnedSessionListInputSchema = z
  .object({
    workspaceId: z.string().min(1),
    parentSessionId: z.string().min(1),
  })
  .strict();

export const spawnedSessionDetailInputSchema = spawnedSessionListInputSchema.extend({
  sessionId: sessionIdSchema,
});

export const spawnedSessionWakePayloadSchema = spawnedSessionDetailInputSchema;

export const spawnedSessionAgentSchema = z
  .object({
    agentId: z.string().min(1),
    name: z.string().min(1),
  })
  .strict();

export const spawnedSessionErrorSchema = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1),
  })
  .strict();

export const spawnedSessionPromptSchema = z
  .object({
    text: z.string(),
  })
  .strict();

export const spawnedSessionRecentActivitySchema = z
  .object({
    kind: z.string().min(1),
    at: isoDateTimeSchema,
    message: z.string().optional(),
  })
  .strict();

const spawnedUserTextPartSchema = z.object({ type: z.literal("text"), text: z.string() }).strict();
const spawnedAssistantTextPartSchema = spawnedUserTextPartSchema;
const spawnedAssistantReasoningPartSchema = z
  .object({ type: z.literal("reasoning"), text: z.string() })
  .strict();
const spawnedAssistantToolPartSchema = z
  .object({
    type: z.literal("dynamic-tool"),
    toolCallId: z.string().min(1),
    toolName: z.string().min(1),
    title: z.string().optional(),
    state: z.enum(["input-streaming", "input-available", "output-available", "output-error"]),
    input: z.unknown().optional(),
    output: z.unknown().optional(),
    errorText: z.string().optional(),
    toolMetadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const spawnedSessionMessageSchema = z.discriminatedUnion("role", [
  z
    .object({
      id: z.string().min(1),
      role: z.literal("user"),
      createdAt: isoDateTimeSchema,
      durable: z.literal(true),
      parts: z.array(spawnedUserTextPartSchema),
    })
    .strict(),
  z
    .object({
      id: z.string().min(1),
      role: z.literal("assistant"),
      createdAt: isoDateTimeSchema,
      durable: z.boolean(),
      parts: z.array(
        z.discriminatedUnion("type", [
          spawnedAssistantTextPartSchema,
          spawnedAssistantReasoningPartSchema,
          spawnedAssistantToolPartSchema,
        ])
      ),
    })
    .strict(),
]);

export const spawnedSessionTurnSummarySchema = z
  .object({
    turnId: z.string().min(1),
    ordinal: z.number().int().positive(),
    mode: z.enum(["sync", "background"]),
    status: spawnedSessionDisplayStatusSchema,
    startedAt: isoDateTimeSchema,
    lastActivityAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
    responseId: z.string().min(1).optional(),
    error: spawnedSessionErrorSchema.optional(),
    recentActivity: z.array(spawnedSessionRecentActivitySchema),
  })
  .strict();

export const spawnedSessionTurnDetailSchema = spawnedSessionTurnSummarySchema
  .extend({
    prompt: spawnedSessionPromptSchema.optional(),
    messages: z.array(spawnedSessionMessageSchema),
  })
  .strict();

export const spawnedSessionSummarySchema = z
  .object({
    sessionId: sessionIdSchema,
    agent: spawnedSessionAgentSchema,
    status: spawnedSessionDisplayStatusSchema,
    mode: z.enum(["sync", "background"]).optional(),
    currentTurnId: z.string().min(1).optional(),
    startedAt: isoDateTimeSchema.optional(),
    lastActivityAt: isoDateTimeSchema.optional(),
    updatedAt: isoDateTimeSchema,
    promptPreview: z.string().optional(),
    latestResponseId: z.string().min(1).optional(),
    error: spawnedSessionErrorSchema.optional(),
  })
  .strict();

export const spawnedSessionListResultSchema = z.array(spawnedSessionSummarySchema);

export const spawnedSessionDetailSchema = z
  .object({
    status: z.literal("ready"),
    summary: spawnedSessionSummarySchema,
    turns: z.array(spawnedSessionTurnDetailSchema),
  })
  .strict();

export const spawnedSessionDetailResultSchema = z.discriminatedUnion("status", [
  spawnedSessionDetailSchema,
  z.object({ status: z.literal("not_found") }).strict(),
]);

export type SpawnedSessionDisplayStatus = z.infer<typeof spawnedSessionDisplayStatusSchema>;
export type SpawnedSessionListInput = z.infer<typeof spawnedSessionListInputSchema>;
export type SpawnedSessionDetailInput = z.infer<typeof spawnedSessionDetailInputSchema>;
export type SpawnedSessionWakePayload = z.infer<typeof spawnedSessionWakePayloadSchema>;
export type SpawnedSessionAgent = z.infer<typeof spawnedSessionAgentSchema>;
export type SpawnedSessionError = z.infer<typeof spawnedSessionErrorSchema>;
export type SpawnedSessionRecentActivity = z.infer<typeof spawnedSessionRecentActivitySchema>;
export type SpawnedSessionMessage = z.infer<typeof spawnedSessionMessageSchema>;
export type SpawnedSessionTurnSummary = z.infer<typeof spawnedSessionTurnSummarySchema>;
export type SpawnedSessionTurnDetail = z.infer<typeof spawnedSessionTurnDetailSchema>;
export type SpawnedSessionSummary = z.infer<typeof spawnedSessionSummarySchema>;
export type SpawnedSessionDetail = z.infer<typeof spawnedSessionDetailSchema>;
export type SpawnedSessionDetailResult = z.infer<typeof spawnedSessionDetailResultSchema>;
