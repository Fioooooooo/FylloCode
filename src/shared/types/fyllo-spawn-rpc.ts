import { z } from "zod";

export const FYLLO_SPAWN_RPC_PROTOCOL = "fyllo-spawn-rpc";
export const FYLLO_SPAWN_RPC_VERSION = 1;
export const DEFAULT_RESPONSE_CHUNK_BYTES = 24 * 1024;
export const MAX_RESPONSE_CHUNK_BYTES = 64 * 1024;
export const MAX_INLINE_RESPONSE_BYTES = 24 * 1024;

const identitySchema = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => !/[\\/\0]/.test(value), {
    message: "Identity must not contain path separators",
  });

export const spawnCallerSchema = z
  .object({
    workspaceId: identitySchema,
    parentSessionId: identitySchema,
  })
  .strict();

export const spawnConfigValueSchema = z.union([z.string(), z.boolean()]);
export const spawnConfigOverrideSchema = z.record(z.string().min(1), spawnConfigValueSchema);
export const spawnTurnModeSchema = z.enum(["sync", "background"]);

export const spawnMethodSchema = z.enum([
  "available_agents",
  "prompt_to_agent",
  "check_session_status",
  "read_response",
  "cancel_session",
]);

export const availableAgentsParamsSchema = z.object({}).strict();
export const promptToAgentParamsSchema = z
  .object({
    agentId: z.string().min(1),
    prompt: z.string().min(1),
    sessionId: identitySchema.optional(),
    config: spawnConfigOverrideSchema.optional(),
    background: z.boolean().default(true),
  })
  .strict();
export const checkSessionStatusParamsSchema = z.object({ sessionId: identitySchema }).strict();
export const readResponseParamsSchema = z
  .object({
    sessionId: identitySchema,
    responseId: identitySchema,
    cursor: z.string().min(1).max(256).optional(),
    maxBytes: z.number().int().min(4).max(MAX_RESPONSE_CHUNK_BYTES).optional(),
  })
  .strict();
export const cancelSessionParamsSchema = z.object({ sessionId: identitySchema }).strict();
export const cancelSessionResultSchema = z
  .object({ cancelled: z.boolean(), reason: z.string().optional() })
  .strict();

const requestBaseSchema = z.object({
  protocol: z.literal(FYLLO_SPAWN_RPC_PROTOCOL),
  version: z.literal(FYLLO_SPAWN_RPC_VERSION),
  kind: z.literal("request"),
  requestId: identitySchema,
  caller: spawnCallerSchema,
});

export const fylloSpawnRpcRequestSchema = z.discriminatedUnion("method", [
  requestBaseSchema.extend({
    method: z.literal("available_agents"),
    params: availableAgentsParamsSchema,
  }),
  requestBaseSchema.extend({
    method: z.literal("prompt_to_agent"),
    params: promptToAgentParamsSchema,
  }),
  requestBaseSchema.extend({
    method: z.literal("check_session_status"),
    params: checkSessionStatusParamsSchema,
  }),
  requestBaseSchema.extend({
    method: z.literal("read_response"),
    params: readResponseParamsSchema,
  }),
  requestBaseSchema.extend({
    method: z.literal("cancel_session"),
    params: cancelSessionParamsSchema,
  }),
]);

export const fylloSpawnRpcCancelSchema = z
  .object({
    protocol: z.literal(FYLLO_SPAWN_RPC_PROTOCOL),
    version: z.literal(FYLLO_SPAWN_RPC_VERSION),
    kind: z.literal("cancel"),
    requestId: identitySchema,
  })
  .strict();

export const spawnRpcErrorCodeSchema = z.enum([
  "SPAWN_PARENT_SESSION_REQUIRED",
  "SPAWN_PARENT_SESSION_NOT_FOUND",
  "SPAWN_NOT_FOUND",
  "SPAWN_AGENT_NOT_FOUND",
  "SPAWN_INVALID_REQUEST",
  "SPAWN_RPC_UNAVAILABLE",
  "SPAWN_RPC_CANCELLED",
  "SPAWN_INTERNAL_ERROR",
  "SESSION_FOLDER_REMOVED",
  "SESSION_FOLDER_RELOCATED",
  "SESSION_FOLDER_PATH_MISSING",
  "PROMPT_CAPABILITY_MISMATCH",
]);

export const spawnRpcErrorSchema = z
  .object({
    code: spawnRpcErrorCodeSchema,
    message: z.string().min(1),
    retryable: z.boolean().optional(),
  })
  .strict();

export const fylloSpawnRpcSuccessSchema = z
  .object({
    protocol: z.literal(FYLLO_SPAWN_RPC_PROTOCOL),
    version: z.literal(FYLLO_SPAWN_RPC_VERSION),
    kind: z.literal("response"),
    requestId: identitySchema,
    ok: z.literal(true),
    result: z.unknown(),
  })
  .strict();

export const fylloSpawnRpcFailureSchema = z
  .object({
    protocol: z.literal(FYLLO_SPAWN_RPC_PROTOCOL),
    version: z.literal(FYLLO_SPAWN_RPC_VERSION),
    kind: z.literal("response"),
    requestId: identitySchema,
    ok: z.literal(false),
    error: spawnRpcErrorSchema,
  })
  .strict();

export const fylloSpawnRpcResponseSchema = z.union([
  fylloSpawnRpcSuccessSchema,
  fylloSpawnRpcFailureSchema,
]);

export const fylloSpawnRpcMessageSchema = z.union([
  fylloSpawnRpcRequestSchema,
  fylloSpawnRpcCancelSchema,
  fylloSpawnRpcResponseSchema,
]);

export const availableAgentSchema = z
  .object({
    agentId: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
  })
  .strict();

export const availableAgentsResultSchema = z
  .object({ agents: z.array(availableAgentSchema) })
  .strict();

export const spawnConfigOptionSummarySchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    type: z.enum(["select", "boolean"]),
    currentValue: spawnConfigValueSchema,
  })
  .strict();

export const spawnWarningSchema = z
  .object({
    optionId: z.string().min(1),
    message: z.string().min(1),
  })
  .strict();

const promptSessionBaseSchema = z.object({ sessionId: identitySchema });
const spawnTerminalErrorCodeSchema = z.enum([
  "TURN_INACTIVITY_TIMEOUT",
  "TURN_CANCEL_UNCONFIRMED",
  "TURN_FAILED",
  "TURN_PERSIST_FAILED",
  "AGENT_PROCESS_INVALIDATED",
  "APP_SHUTDOWN",
  "APP_RESTARTED",
  "TURN_CANCELLED_BY_PARENT",
]);

export const promptToAgentResultSchema = z.discriminatedUnion("status", [
  promptSessionBaseSchema
    .extend({
      status: z.literal("accepted"),
      turnId: identitySchema,
      startedAt: z.string().datetime(),
      config: z.array(spawnConfigOptionSummarySchema),
      warnings: z.array(spawnWarningSchema),
    })
    .strict(),
  promptSessionBaseSchema
    .extend({
      status: z.literal("completed"),
      responseId: identitySchema,
      content: z.string(),
      truncated: z.boolean(),
      nextCursor: z.string().min(1).optional(),
      config: z.array(spawnConfigOptionSummarySchema),
      warnings: z.array(spawnWarningSchema),
    })
    .strict(),
  promptSessionBaseSchema
    .extend({
      status: z.literal("busy"),
      startedAt: z.string().datetime(),
      lastActivityAt: z.string().datetime(),
    })
    .strict(),
  z
    .object({
      status: z.literal("capacity_exceeded"),
      code: z.literal("SPAWN_CAPACITY_EXCEEDED"),
      retryable: z.literal(true),
    })
    .strict(),
  promptSessionBaseSchema
    .extend({
      status: z.literal("expired"),
      code: z.literal("AGENT_PROCESS_INVALIDATED").optional(),
      message: z.string().min(1).optional(),
    })
    .strict(),
  promptSessionBaseSchema.extend({ status: z.literal("not_found") }).strict(),
  promptSessionBaseSchema
    .extend({
      status: z.literal("error"),
      code: spawnTerminalErrorCodeSchema,
      message: z.string().min(1),
    })
    .strict(),
]);

export const spawnRecentActivitySchema = z
  .object({
    kind: z.string().min(1),
    at: z.string().datetime(),
    message: z.string().optional(),
  })
  .strict();

export const checkSessionStatusResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("not_found") }).strict(),
  z
    .object({
      status: z.literal("running"),
      turnId: identitySchema,
      mode: spawnTurnModeSchema,
      startedAt: z.string().datetime(),
      lastActivityAt: z.string().datetime(),
      recentActivity: z.array(spawnRecentActivitySchema).max(3),
    })
    .strict(),
  z
    .object({
      status: z.literal("idle"),
      latestTurnId: identitySchema.optional(),
      latestResponseId: identitySchema.optional(),
    })
    .strict(),
  z
    .object({
      status: z.literal("error"),
      code: z.string().min(1),
      message: z.string().min(1),
    })
    .strict(),
  z
    .object({
      status: z.literal("expired"),
      code: z.literal("AGENT_PROCESS_INVALIDATED").optional(),
      message: z.string().min(1).optional(),
    })
    .strict(),
  z
    .object({
      status: z.literal("interrupted"),
      code: z.enum(["APP_SHUTDOWN", "APP_RESTARTED"]),
      message: z.string().min(1),
    })
    .strict(),
]);

export const readResponseResultSchema = z
  .object({
    content: z.string(),
    done: z.boolean(),
    nextCursor: z.string().min(1).optional(),
  })
  .strict();

export type SpawnCaller = z.infer<typeof spawnCallerSchema>;
export type SpawnMethod = z.infer<typeof spawnMethodSchema>;
export type AvailableAgentsParams = z.infer<typeof availableAgentsParamsSchema>;
export type PromptToAgentParams = z.input<typeof promptToAgentParamsSchema>;
export type CheckSessionStatusParams = z.infer<typeof checkSessionStatusParamsSchema>;
export type ReadResponseParams = z.infer<typeof readResponseParamsSchema>;
export type CancelSessionParams = z.infer<typeof cancelSessionParamsSchema>;
export type CancelSessionResult = z.infer<typeof cancelSessionResultSchema>;
export type SpawnRpcErrorCode = z.infer<typeof spawnRpcErrorCodeSchema>;
export type SpawnRpcError = z.infer<typeof spawnRpcErrorSchema>;
export type FylloSpawnRpcRequest = z.input<typeof fylloSpawnRpcRequestSchema>;
export type FylloSpawnRpcCancel = z.infer<typeof fylloSpawnRpcCancelSchema>;
export type FylloSpawnRpcResponse = z.infer<typeof fylloSpawnRpcResponseSchema>;
export type FylloSpawnRpcMessage = z.infer<typeof fylloSpawnRpcMessageSchema>;
export type AvailableAgent = z.infer<typeof availableAgentSchema>;
export type AvailableAgentsResult = z.infer<typeof availableAgentsResultSchema>;
export type SpawnConfigOptionSummary = z.infer<typeof spawnConfigOptionSummarySchema>;
export type SpawnWarning = z.infer<typeof spawnWarningSchema>;
export type SpawnTurnMode = z.infer<typeof spawnTurnModeSchema>;
export type SpawnRecentActivity = z.infer<typeof spawnRecentActivitySchema>;
export type PromptToAgentResult = z.infer<typeof promptToAgentResultSchema>;
export type PromptToAgentAcceptedResult = Extract<PromptToAgentResult, { status: "accepted" }>;
export type CheckSessionStatusResult = z.infer<typeof checkSessionStatusResultSchema>;
export type ReadResponseResult = z.infer<typeof readResponseResultSchema>;

export function parseFylloSpawnRpcMessage(input: unknown): FylloSpawnRpcMessage {
  return fylloSpawnRpcMessageSchema.parse(input);
}
