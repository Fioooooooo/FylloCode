import { z } from "zod";

export const FYLLO_WORKFLOW_RPC_PROTOCOL = "fyllo-workflow-rpc";
export const FYLLO_WORKFLOW_RPC_VERSION = 1;

const identitySchema = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => !/[\\/\0]/.test(value), {
    message: "Identity must not contain path separators",
  });

export const workflowRpcCallerTypeSchema = z.enum(["chat", "workflow", "spawned", "unknown"]);
export const workflowRpcCallerSchema = z
  .object({
    workspaceId: identitySchema,
    parentSessionId: identitySchema,
    callerType: workflowRpcCallerTypeSchema,
  })
  .strict();

export const workflowRpcMethodSchema = z.enum(["list_workflows", "trigger_workflow"]);
export const listWorkflowsParamsSchema = z.object({}).strict();
export const triggerWorkflowParamsSchema = z.object({ workflowId: identitySchema }).strict();

const requestBaseSchema = z.object({
  protocol: z.literal(FYLLO_WORKFLOW_RPC_PROTOCOL),
  version: z.literal(FYLLO_WORKFLOW_RPC_VERSION),
  kind: z.literal("request"),
  requestId: identitySchema,
  caller: workflowRpcCallerSchema,
});

export const workflowRpcRequestSchema = z.discriminatedUnion("method", [
  requestBaseSchema.extend({
    method: z.literal("list_workflows"),
    params: listWorkflowsParamsSchema,
  }),
  requestBaseSchema.extend({
    method: z.literal("trigger_workflow"),
    params: triggerWorkflowParamsSchema,
  }),
]);

export const workflowRpcCancelSchema = z
  .object({
    protocol: z.literal(FYLLO_WORKFLOW_RPC_PROTOCOL),
    version: z.literal(FYLLO_WORKFLOW_RPC_VERSION),
    kind: z.literal("cancel"),
    requestId: identitySchema,
  })
  .strict();

export const workflowRpcErrorCodeSchema = z.enum([
  "WORKFLOW_NOT_FOUND",
  "WORKFLOW_RUN_CONFLICT",
  "WORKFLOW_CONTEXT_UNSUPPORTED",
  "WORKFLOW_FEATURE_NOT_IMPLEMENTED",
  "WORKFLOW_INVALID_CALLER",
  "WORKFLOW_ENGINE_SHUTTING_DOWN",
  "WORKFLOW_RPC_UNAVAILABLE",
  "WORKFLOW_RPC_CANCELLED",
  "WORKFLOW_INVALID_REQUEST",
  "WORKFLOW_INTERNAL_ERROR",
]);

export const workflowRpcErrorSchema = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1),
    retryable: z.boolean().optional(),
  })
  .strict();

const responseBaseSchema = z.object({
  protocol: z.literal(FYLLO_WORKFLOW_RPC_PROTOCOL),
  version: z.literal(FYLLO_WORKFLOW_RPC_VERSION),
  kind: z.literal("response"),
  requestId: identitySchema,
});

export const workflowRpcSuccessSchema = responseBaseSchema
  .extend({
    ok: z.literal(true),
    result: z.unknown(),
  })
  .strict();

export const workflowRpcFailureSchema = responseBaseSchema
  .extend({
    ok: z.literal(false),
    error: workflowRpcErrorSchema,
  })
  .strict();

export const workflowRpcResponseSchema = z.union([
  workflowRpcSuccessSchema,
  workflowRpcFailureSchema,
]);

export const workflowRpcRunStatusSchema = z.enum([
  "running",
  "awaiting_start_confirmation",
  "awaiting_gate_decision",
  "awaiting_action_confirmation",
  "succeeded",
  "failed",
  "cancelled",
  "interrupted",
]);

export const workflowDefinitionSummarySchema = z
  .object({
    workflowId: identitySchema,
    name: z.string().min(1),
    description: z.string().optional(),
  })
  .strict();

export const listWorkflowsResultSchema = z
  .object({ workflows: z.array(workflowDefinitionSummarySchema) })
  .strict();

export const workflowRejectedReasonSchema = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1),
    stageId: identitySchema.optional(),
    feature: z.string().min(1).optional(),
    refs: z.array(z.string().min(1)).optional(),
  })
  .strict();

export const triggerWorkflowResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("accepted"),
      runId: identitySchema,
      runStatus: workflowRpcRunStatusSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal("rejected"),
      reason: workflowRejectedReasonSchema,
    })
    .strict(),
]);

export type WorkflowRpcCaller = z.infer<typeof workflowRpcCallerSchema>;
export type WorkflowRpcMethod = z.infer<typeof workflowRpcMethodSchema>;
export type WorkflowRpcRequest = z.infer<typeof workflowRpcRequestSchema>;
export type WorkflowRpcCancel = z.infer<typeof workflowRpcCancelSchema>;
export type WorkflowRpcResponse = z.infer<typeof workflowRpcResponseSchema>;
export type WorkflowRpcError = z.infer<typeof workflowRpcErrorSchema>;
export type WorkflowRpcErrorCode = z.infer<typeof workflowRpcErrorCodeSchema>;
export type ListWorkflowsResult = z.infer<typeof listWorkflowsResultSchema>;
export type TriggerWorkflowResult = z.infer<typeof triggerWorkflowResultSchema>;
