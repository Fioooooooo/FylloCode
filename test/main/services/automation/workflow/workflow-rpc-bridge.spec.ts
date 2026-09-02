import { describe, expect, it, vi } from "vitest";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import {
  FYLLO_WORKFLOW_RPC_PROTOCOL,
  FYLLO_WORKFLOW_RPC_VERSION,
  workflowRpcRequestSchema,
  type WorkflowRpcRequest,
} from "../../../../../src/mcp-servers/fyllo-workflow/src/rpc-schema";
import { WorkflowCapabilityPreflightError } from "@main/domain/automation/workflow/preflight";
import { WorkflowEngineError } from "@main/services/automation/workflow/workflow-engine";
import {
  handleWorkflowRpc,
  workflowRpcCodec,
  type WorkflowRpcHandlerDependencies,
} from "@main/services/automation/workflow/workflow-rpc-bridge";

vi.mock("@main/infra/logger", () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const sessionContext = {
  agentId: "fyllocode",
  workspaceSnapshot: {} as never,
};

function request(
  method: WorkflowRpcRequest["method"],
  callerType: "chat" | "workflow" | "spawned" | "unknown" = "chat"
): WorkflowRpcRequest {
  return workflowRpcRequestSchema.parse({
    protocol: FYLLO_WORKFLOW_RPC_PROTOCOL,
    version: FYLLO_WORKFLOW_RPC_VERSION,
    kind: "request",
    requestId: `${method}-request`,
    caller: {
      workspaceId: "workspace-1",
      parentSessionId: "parent-1",
      callerType,
    },
    method,
    params: method === "list_workflows" ? {} : { workflowId: "workflow-1" },
  });
}

function dependencies(overrides: Partial<WorkflowRpcHandlerDependencies> = {}) {
  return {
    engine: { triggerWorkflow: vi.fn() },
    listDefinitions: vi.fn(),
    getSessionExecutionContext: vi.fn().mockResolvedValue(sessionContext),
    ...overrides,
  } as WorkflowRpcHandlerDependencies;
}

describe("workflow RPC bridge", () => {
  it("uses trusted Chat context, projects live definition summaries, and accepts a Run", async () => {
    const engine = {
      triggerWorkflow: vi.fn().mockResolvedValue({
        status: "accepted",
        runId: "run-1",
        runStatus: "awaiting_start_confirmation",
      }),
    };
    const listDefinitions = vi.fn().mockResolvedValue({
      workflows: [
        {
          workflowId: "workflow-1",
          name: "Review",
          description: "Review current changes",
          yaml: "version: 2",
          definition: { name: "Review", version: 2, stages: [] },
        },
      ],
    });
    const deps = dependencies({ engine, listDefinitions });

    await expect(
      handleWorkflowRpc(request("list_workflows"), new AbortController().signal, deps)
    ).resolves.toEqual({
      workflows: [
        {
          workflowId: "workflow-1",
          name: "Review",
          description: "Review current changes",
        },
      ],
    });
    expect(listDefinitions).toHaveBeenCalledWith("workspace-1");

    await expect(
      handleWorkflowRpc(request("trigger_workflow"), new AbortController().signal, deps)
    ).resolves.toEqual({
      status: "accepted",
      runId: "run-1",
      runStatus: "awaiting_start_confirmation",
    });
    expect(engine.triggerWorkflow).toHaveBeenCalledWith({
      workflowId: "workflow-1",
      caller: {
        workspaceId: "workspace-1",
        parentSessionId: "parent-1",
        callerType: "chat",
      },
    });
  });

  it.each([
    ["workflow", "workflow"],
    ["spawned", "spawned"],
    ["unknown", "unknown"],
  ] as const)("rejects %s caller before creating a Run", async (_label, callerType) => {
    const engine = { triggerWorkflow: vi.fn() };
    const getSessionExecutionContext = vi.fn();
    const result = await handleWorkflowRpc(
      request("trigger_workflow", callerType),
      new AbortController().signal,
      dependencies({ engine, getSessionExecutionContext })
    );

    expect(result).toEqual({
      status: "rejected",
      reason: {
        code: IpcErrorCodes.WORKFLOW_INVALID_CALLER,
        message: expect.stringContaining(callerType),
      },
    });
    expect(engine.triggerWorkflow).not.toHaveBeenCalled();
    expect(getSessionExecutionContext).not.toHaveBeenCalled();
  });

  it("rejects a Chat-shaped request when the parent is not a stored Chat Session", async () => {
    const engine = { triggerWorkflow: vi.fn() };
    const result = await handleWorkflowRpc(
      request("trigger_workflow"),
      new AbortController().signal,
      dependencies({
        engine,
        getSessionExecutionContext: vi.fn().mockRejectedValue(new Error("missing session")),
      })
    );

    expect(result).toMatchObject({
      status: "rejected",
      reason: {
        code: IpcErrorCodes.WORKFLOW_INVALID_CALLER,
        message: expect.stringContaining("parent session"),
      },
    });
    expect(engine.triggerWorkflow).not.toHaveBeenCalled();
  });

  it("returns stable structured reasons for not-found, conflict, and preflight errors", async () => {
    const errors = [
      new WorkflowEngineError(IpcErrorCodes.WORKFLOW_NOT_FOUND, "missing workflow"),
      new WorkflowEngineError(IpcErrorCodes.WORKFLOW_RUN_CONFLICT, "active run exists"),
      new WorkflowCapabilityPreflightError([
        {
          code: IpcErrorCodes.WORKFLOW_FEATURE_NOT_IMPLEMENTED,
          message: "Phase 1 does not support wait",
          stageId: "wait-stage",
          feature: "wait",
          refs: ["wait"],
        },
      ]),
    ];

    for (const error of errors) {
      const result = await handleWorkflowRpc(
        request("trigger_workflow"),
        new AbortController().signal,
        dependencies({
          engine: { triggerWorkflow: vi.fn().mockRejectedValue(error) },
        })
      );
      expect(result).toMatchObject({ status: "rejected", reason: { code: error.code } });
    }
  });

  it("keeps the workflow codec separate from fyllo-spawn and rejects forged tool fields", () => {
    const valid = request("trigger_workflow");
    expect(workflowRpcCodec.parseRequest(valid)).toEqual(valid);
    expect(
      workflowRpcCodec.parseRequest({
        ...valid,
        params: { workflowId: "workflow-1", parentSessionId: "forged" },
      })
    ).toBeNull();
    expect(
      workflowRpcRequestSchema.safeParse({
        ...valid,
        caller: {
          ...valid.caller,
          parentSessionId: "../../other-parent",
        },
      }).success
    ).toBe(false);
  });
});
