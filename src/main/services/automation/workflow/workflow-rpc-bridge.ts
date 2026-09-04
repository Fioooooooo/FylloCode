import {
  registerBundledMcpRpcHandler,
  type BundledMcpRpcCodec,
} from "@main/infra/mcp/bundled-mcp-host";
import logger from "@main/infra/logger";
import { getSessionExecutionContext } from "@main/services/session/_public";
import type { WorkflowEngine } from "./workflow-engine";
import { workflowEngine } from "./workflow-engine";
import { listWorkflowDefinitions } from "./workflow-service";
import { workflowProposalService, type WorkflowProposalService } from "./workflow-proposal-service";
import {
  FYLLO_WORKFLOW_RPC_PROTOCOL,
  FYLLO_WORKFLOW_RPC_VERSION,
  listWorkflowsResultSchema,
  describeWorkflowSchemaResultSchema,
  proposeWorkflowResultSchema,
  triggerWorkflowResultSchema,
  workflowRpcCancelSchema,
  workflowRpcErrorCodeSchema,
  workflowRpcErrorSchema,
  workflowRpcRequestSchema,
  type ListWorkflowsResult,
  type DescribeWorkflowSchemaResult,
  type ProposeWorkflowResult,
  type TriggerWorkflowResult,
  type WorkflowRpcError,
  type WorkflowRpcRequest,
} from "../../../../mcp-servers/fyllo-workflow/src/rpc-schema";
import {
  WorkflowCapabilityPreflightError,
  type WorkflowCapabilityIssue,
} from "@main/domain/automation/workflow/preflight";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import type { WorkflowCallerContext } from "./workflow-engine";

export interface WorkflowRpcHandlerDependencies {
  engine: Pick<WorkflowEngine, "triggerWorkflow">;
  listDefinitions: typeof listWorkflowDefinitions;
  getSessionExecutionContext: typeof getSessionExecutionContext;
  proposalService?: Pick<WorkflowProposalService, "describeWorkflowSchema" | "proposeWorkflow">;
}

const defaultDependencies: WorkflowRpcHandlerDependencies = {
  engine: workflowEngine,
  listDefinitions: listWorkflowDefinitions,
  getSessionExecutionContext,
  proposalService: workflowProposalService,
};

let unregisterBridge: (() => void) | null = null;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = (error as { code?: unknown }).code;
  return typeof candidate === "string" && candidate.length > 0 ? candidate : undefined;
}

function toRpcError(error: unknown, signal: AbortSignal): WorkflowRpcError {
  if (signal.aborted) {
    return { code: "WORKFLOW_RPC_CANCELLED", message: "Workflow RPC request was cancelled" };
  }

  const code = errorCode(error);
  const parsedCode = code ? workflowRpcErrorCodeSchema.safeParse(code) : null;
  if (parsedCode?.success) {
    const candidate = error as { message?: unknown; retryable?: unknown };
    return workflowRpcErrorSchema.parse({
      code: parsedCode.data,
      message:
        typeof candidate.message === "string" && candidate.message
          ? candidate.message
          : "Workflow RPC failed",
      ...(typeof candidate.retryable === "boolean" ? { retryable: candidate.retryable } : {}),
    });
  }
  return {
    code: "WORKFLOW_INTERNAL_ERROR",
    message: errorMessage(error),
  };
}

export const workflowRpcCodec: BundledMcpRpcCodec<WorkflowRpcRequest> = {
  parseRequest(input) {
    const parsed = workflowRpcRequestSchema.safeParse(input);
    return parsed.success ? parsed.data : null;
  },
  parseCancel(input) {
    const parsed = workflowRpcCancelSchema.safeParse(input);
    return parsed.success ? parsed.data : null;
  },
  success(requestId, result) {
    return {
      protocol: FYLLO_WORKFLOW_RPC_PROTOCOL,
      version: FYLLO_WORKFLOW_RPC_VERSION,
      kind: "response",
      requestId,
      ok: true,
      result,
    };
  },
  failure(requestId, error) {
    return {
      protocol: FYLLO_WORKFLOW_RPC_PROTOCOL,
      version: FYLLO_WORKFLOW_RPC_VERSION,
      kind: "response",
      requestId,
      ok: false,
      error: workflowRpcErrorSchema.parse(error),
    };
  },
  toError: toRpcError,
};

function callerFromRequest(request: WorkflowRpcRequest): WorkflowCallerContext {
  return {
    callerType: request.caller.callerType,
    workspaceId: request.caller.workspaceId,
    parentSessionId: request.caller.parentSessionId,
  };
}

function invalidCallerReason(caller: WorkflowCallerContext, detail?: string): WorkflowRpcError {
  return {
    code: IpcErrorCodes.WORKFLOW_INVALID_CALLER,
    message: `Workflow caller is not an allowed Chat owner: ${caller.callerType}${
      detail ? ` (${detail})` : ""
    }`,
  };
}

async function requireChatCaller(
  caller: WorkflowCallerContext,
  dependencies: WorkflowRpcHandlerDependencies
): Promise<void> {
  if (caller.callerType !== "chat") {
    logger.warn(
      `[workflow-rpc] rejected non-chat caller type=${caller.callerType} workspaceId=${caller.workspaceId} parentSessionId=${caller.parentSessionId}`
    );
    throw invalidCallerReason(caller);
  }

  try {
    await dependencies.getSessionExecutionContext(caller.workspaceId, caller.parentSessionId);
  } catch (error: unknown) {
    logger.warn(
      `[workflow-rpc] rejected caller without a Chat Session workspaceId=${caller.workspaceId} parentSessionId=${caller.parentSessionId}`,
      error
    );
    throw invalidCallerReason(caller, "parent session is not a trusted Chat Session");
  }
}

function issueReason(issue: WorkflowCapabilityIssue): WorkflowRpcError {
  return {
    code: issue.code,
    message: issue.message,
    ...(issue.stageId ? { stageId: issue.stageId } : {}),
    ...(issue.feature ? { feature: issue.feature } : {}),
    ...(issue.refs && issue.refs.length > 0 ? { refs: issue.refs } : {}),
  };
}

function rejectionReason(error: unknown): WorkflowRpcError {
  if (error instanceof WorkflowCapabilityPreflightError) {
    return issueReason(error.issues[0]);
  }
  if (error && typeof error === "object") {
    const candidate = error as {
      code?: unknown;
      message?: unknown;
      details?: { issues?: unknown };
    };
    const code = typeof candidate.code === "string" ? candidate.code : undefined;
    const message =
      typeof candidate.message === "string" && candidate.message
        ? candidate.message
        : "Workflow request was rejected";
    if (code === IpcErrorCodes.WORKFLOW_INVALID_CALLER) {
      return { code, message };
    }
    const issues = candidate.details?.issues;
    if (Array.isArray(issues) && issues.length > 0) {
      const first = issues[0];
      if (first && typeof first === "object") {
        const issue = first as Partial<WorkflowCapabilityIssue>;
        if (typeof issue.code === "string" && typeof issue.message === "string") {
          return issueReason(issue as WorkflowCapabilityIssue);
        }
      }
    }
    if (code && code.startsWith("WORKFLOW_")) {
      return {
        code,
        message,
        ...("stageId" in candidate && typeof candidate.stageId === "string"
          ? { stageId: candidate.stageId }
          : {}),
        ...("feature" in candidate && typeof candidate.feature === "string"
          ? { feature: candidate.feature }
          : {}),
      };
    }
  }
  return { code: "WORKFLOW_INTERNAL_ERROR", message: errorMessage(error) };
}

function listResult(
  result: Awaited<ReturnType<typeof listWorkflowDefinitions>>
): ListWorkflowsResult {
  return listWorkflowsResultSchema.parse({
    workflows: result.workflows.map(({ workflowId, name, description }) => ({
      workflowId,
      name,
      ...(description ? { description } : {}),
    })),
  });
}

export async function handleWorkflowRpc(
  request: WorkflowRpcRequest,
  signal: AbortSignal,
  dependencies: WorkflowRpcHandlerDependencies = defaultDependencies
): Promise<
  ListWorkflowsResult | TriggerWorkflowResult | DescribeWorkflowSchemaResult | ProposeWorkflowResult
> {
  const caller = callerFromRequest(request);
  const proposalService = dependencies.proposalService ?? workflowProposalService;
  if (request.method === "describe_workflow_schema") {
    if (signal.aborted) {
      throw Object.assign(new Error("Workflow RPC request was cancelled"), {
        code: "WORKFLOW_RPC_CANCELLED",
      });
    }
    return describeWorkflowSchemaResultSchema.parse(
      proposalService.describeWorkflowSchema(request.params.withExamples ?? false)
    );
  }
  if (request.method === "list_workflows") {
    await requireChatCaller(caller, dependencies);
    if (signal.aborted) {
      throw Object.assign(new Error("Workflow RPC request was cancelled"), {
        code: "WORKFLOW_RPC_CANCELLED",
      });
    }
    return listResult(await dependencies.listDefinitions(caller.workspaceId));
  }

  if (request.method === "propose_workflow") {
    await requireChatCaller(caller, dependencies);
    if (signal.aborted) {
      throw Object.assign(new Error("Workflow RPC request was cancelled"), {
        code: "WORKFLOW_RPC_CANCELLED",
      });
    }
    return proposeWorkflowResultSchema.parse(
      await proposalService.proposeWorkflow({ ...request.params, caller })
    );
  }

  try {
    await requireChatCaller(caller, dependencies);
    if (signal.aborted) {
      throw Object.assign(new Error("Workflow RPC request was cancelled"), {
        code: "WORKFLOW_RPC_CANCELLED",
      });
    }
    return triggerWorkflowResultSchema.parse(
      await dependencies.engine.triggerWorkflow({
        workflowId: request.params.workflowId,
        caller,
      })
    );
  } catch (error: unknown) {
    const reason = rejectionReason(error);
    if (reason.code === IpcErrorCodes.WORKFLOW_INVALID_CALLER) {
      logger.warn(
        `[workflow-rpc] trigger rejected caller type=${caller.callerType} workspaceId=${caller.workspaceId} parentSessionId=${caller.parentSessionId}`
      );
    }
    return triggerWorkflowResultSchema.parse({ status: "rejected", reason });
  }
}

export function registerWorkflowRpcBridge(): void {
  if (unregisterBridge) return;
  unregisterBridge = registerBundledMcpRpcHandler(
    "fyllo-workflow",
    (request, signal) => handleWorkflowRpc(request, signal),
    workflowRpcCodec
  );
}

export function unregisterWorkflowRpcBridge(): void {
  unregisterBridge?.();
  unregisterBridge = null;
}
