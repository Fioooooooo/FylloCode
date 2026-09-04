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

export const workflowRpcMethodSchema = z.enum([
  "list_workflows",
  "trigger_workflow",
  "describe_workflow_schema",
  "propose_workflow",
]);
export const listWorkflowsParamsSchema = z.object({}).strict();
export const triggerWorkflowParamsSchema = z.object({ workflowId: identitySchema }).strict();
export const describeWorkflowSchemaParamsSchema = z
  .object({ withExamples: z.boolean().optional() })
  .strict();
export const describeWorkflowSchemaResultSchema = z.object({ schema: z.string() }).strict();

const workflowProposalPersistSchema = z
  .enum(["session", "workspace"])
  .describe(
    "Agent-suggested persistence scope: session keeps a parent-session shadow that is not returned by list_workflows; workspace saves a reusable Workspace workflow that is returned by list_workflows. The user's confirmation choice is final."
  );
const workflowProposalCreateParamsSchema = z
  .object({
    yaml: z
      .string()
      .min(1)
      .describe(
        "Complete v2 workflow YAML. Schema-valid definitions may still be rejected later if the current runtime cannot execute a feature."
      ),
    persist: workflowProposalPersistSchema,
    mode: z
      .literal("create")
      .describe("Create a new workflow; workflowId must be omitted in this mode."),
    workflowId: z
      .never()
      .optional()
      .describe(
        "Must be omitted when mode is create. Use mode=update and provide workflowId to revise an existing workflow."
      ),
  })
  .strict()
  .describe(
    "Create mode: omit workflowId. Use update mode with workflowId when changing an existing workflow."
  );
const workflowProposalUpdateParamsSchema = z
  .object({
    yaml: z
      .string()
      .min(1)
      .describe(
        "Complete v2 workflow YAML. Schema-valid definitions may still be rejected later if the current runtime cannot execute a feature."
      ),
    persist: workflowProposalPersistSchema,
    mode: z
      .literal("update")
      .describe("Update an existing workflow; workflowId is required in this mode."),
    workflowId: identitySchema.describe(
      "Required when mode is update. Identify the existing session shadow or Workspace workflow to revise; omit this field for mode=create."
    ),
  })
  .strict()
  .describe(
    "Update mode: provide workflowId for the existing workflow being revised. For a new workflow, use create mode and omit workflowId."
  );
export const proposeWorkflowParamsSchema = z
  .discriminatedUnion("mode", [
    workflowProposalCreateParamsSchema,
    workflowProposalUpdateParamsSchema,
  ])
  .describe(
    "Field relationship: mode=create creates a new workflow and requires workflowId to be omitted; mode=update revises an existing workflow and requires workflowId. persist is only the Agent's suggestion; the user chooses the final session or workspace scope when confirming."
  );

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
  requestBaseSchema.extend({
    method: z.literal("describe_workflow_schema"),
    params: describeWorkflowSchemaParamsSchema,
  }),
  requestBaseSchema.extend({
    method: z.literal("propose_workflow"),
    params: proposeWorkflowParamsSchema,
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
  "WORKFLOW_PROPOSAL_INVALID_STATE",
  "WORKFLOW_PROPOSAL_NOT_FOUND",
  "WORKFLOW_PROPOSAL_PERSIST_FAILED",
  "WORKFLOW_PROPOSAL_TARGET_NOT_UPGRADABLE",
  "WORKFLOW_PROPOSAL_OWNER_MISMATCH",
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

export const proposeWorkflowResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("accepted"),
      proposalId: identitySchema,
    })
    .strict(),
  z
    .object({
      status: z.literal("rejected"),
      errors: z
        .array(
          z
            .object({
              rule: z.string().min(1),
              detail: z.string().min(1),
            })
            .strict()
        )
        .min(1),
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
export type DescribeWorkflowSchemaParams = z.infer<typeof describeWorkflowSchemaParamsSchema>;
export type DescribeWorkflowSchemaResult = z.infer<typeof describeWorkflowSchemaResultSchema>;
export type ProposeWorkflowParams = z.infer<typeof proposeWorkflowParamsSchema>;
export type ProposeWorkflowResult = z.infer<typeof proposeWorkflowResultSchema>;
