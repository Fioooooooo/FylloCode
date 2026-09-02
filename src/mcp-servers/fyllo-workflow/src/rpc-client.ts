import type { ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import {
  FYLLO_WORKFLOW_RPC_PROTOCOL,
  FYLLO_WORKFLOW_RPC_VERSION,
  workflowRpcCancelSchema,
  workflowRpcRequestSchema,
  workflowRpcResponseSchema,
  type WorkflowRpcCaller,
  type WorkflowRpcCancel,
  type WorkflowRpcErrorCode,
  type WorkflowRpcMethod,
  type WorkflowRpcRequest,
} from "./rpc-schema";

type IpcProcess = Pick<NodeJS.Process, "connected" | "send" | "on" | "off">;

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
  cleanup(): void;
}

export class WorkflowRpcClientError extends Error {
  constructor(
    public readonly code: WorkflowRpcErrorCode | string,
    message: string,
    public readonly retryable = false
  ) {
    super(message);
    this.name = "WorkflowRpcClientError";
  }
}

export class WorkflowRpcClient {
  private readonly pending = new Map<string, PendingRequest>();
  private closed = false;

  private readonly onMessage = (message: unknown): void => {
    const parsed = workflowRpcResponseSchema.safeParse(message);
    if (!parsed.success) return;
    const response = parsed.data;
    const pending = this.pending.get(response.requestId);
    if (!pending) return;
    this.pending.delete(response.requestId);
    pending.cleanup();
    if (response.ok) {
      pending.resolve(response.result);
      return;
    }
    pending.reject(
      new WorkflowRpcClientError(
        response.error.code,
        response.error.message,
        response.error.retryable ?? false
      )
    );
  };

  private readonly onDisconnect = (): void => {
    this.close("Main process workflow RPC channel disconnected");
  };

  constructor(private readonly ipc: IpcProcess = process) {
    this.ipc.on("message", this.onMessage);
    this.ipc.on("disconnect", this.onDisconnect);
  }

  async call<TSchema extends z.ZodType>(input: {
    method: WorkflowRpcMethod;
    caller: WorkflowRpcCaller;
    params: unknown;
    resultSchema: TSchema;
    signal?: AbortSignal;
  }): Promise<z.output<TSchema>> {
    if (this.closed || !this.ipc.connected || !this.ipc.send) {
      throw new WorkflowRpcClientError(
        "WORKFLOW_RPC_UNAVAILABLE",
        "Main process workflow RPC is unavailable",
        true
      );
    }

    const requestId = randomUUID();
    const request = workflowRpcRequestSchema.parse({
      protocol: FYLLO_WORKFLOW_RPC_PROTOCOL,
      version: FYLLO_WORKFLOW_RPC_VERSION,
      kind: "request",
      requestId,
      method: input.method,
      caller: input.caller,
      params: input.params,
    }) as WorkflowRpcRequest;

    const result = await new Promise<unknown>((resolve, reject) => {
      const onAbort = (): void => {
        this.pending.delete(requestId);
        const cancel: WorkflowRpcCancel = {
          protocol: FYLLO_WORKFLOW_RPC_PROTOCOL,
          version: FYLLO_WORKFLOW_RPC_VERSION,
          kind: "cancel",
          requestId,
        };
        this.send(cancel);
        reject(new WorkflowRpcClientError("WORKFLOW_RPC_CANCELLED", "MCP request was cancelled"));
      };
      const cleanup = (): void => input.signal?.removeEventListener("abort", onAbort);
      this.pending.set(requestId, { resolve, reject, cleanup });
      input.signal?.addEventListener("abort", onAbort, { once: true });
      if (input.signal?.aborted) {
        onAbort();
        return;
      }
      try {
        this.send(request);
      } catch (error) {
        this.pending.delete(requestId);
        cleanup();
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });

    return input.resultSchema.parse(result);
  }

  close(reason = "fyllo-workflow RPC client closed"): void {
    if (this.closed) return;
    this.closed = true;
    this.ipc.off("message", this.onMessage);
    this.ipc.off("disconnect", this.onDisconnect);
    for (const pending of this.pending.values()) {
      pending.cleanup();
      pending.reject(new WorkflowRpcClientError("WORKFLOW_RPC_UNAVAILABLE", reason, true));
    }
    this.pending.clear();
  }

  private send(message: WorkflowRpcRequest | WorkflowRpcCancel): void {
    if (!this.ipc.connected || !this.ipc.send) {
      throw new WorkflowRpcClientError(
        "WORKFLOW_RPC_UNAVAILABLE",
        "Main process workflow RPC is unavailable",
        true
      );
    }
    this.ipc.send(message as Parameters<ChildProcess["send"]>[0]);
  }
}

export function isWorkflowRpcCancel(input: unknown): input is WorkflowRpcCancel {
  return workflowRpcCancelSchema.safeParse(input).success;
}
