import type { ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import {
  FYLLO_SPAWN_RPC_PROTOCOL,
  FYLLO_SPAWN_RPC_VERSION,
  fylloSpawnRpcResponseSchema,
  type FylloSpawnRpcCancel,
  type FylloSpawnRpcRequest,
  type SpawnCaller,
  type SpawnMethod,
  type SpawnRpcError,
} from "@shared/types/fyllo-spawn-rpc";

type IpcProcess = Pick<NodeJS.Process, "connected" | "send" | "on" | "off">;

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
  cleanup(): void;
}

export class SpawnRpcClientError extends Error {
  constructor(
    public readonly code: SpawnRpcError["code"],
    message: string,
    public readonly retryable = false
  ) {
    super(message);
    this.name = "SpawnRpcClientError";
  }
}

export class SpawnRpcClient {
  private readonly pending = new Map<string, PendingRequest>();
  private closed = false;

  private readonly onMessage = (message: unknown): void => {
    const parsed = fylloSpawnRpcResponseSchema.safeParse(message);
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
      new SpawnRpcClientError(
        response.error.code,
        response.error.message,
        response.error.retryable ?? false
      )
    );
  };

  private readonly onDisconnect = (): void => {
    this.close("Main process IPC channel disconnected");
  };

  constructor(private readonly ipc: IpcProcess = process) {
    this.ipc.on("message", this.onMessage);
    this.ipc.on("disconnect", this.onDisconnect);
  }

  async call<TSchema extends z.ZodType>(input: {
    method: SpawnMethod;
    caller: SpawnCaller;
    params: unknown;
    resultSchema: TSchema;
    signal?: AbortSignal;
  }): Promise<z.output<TSchema>> {
    if (this.closed || !this.ipc.connected || !this.ipc.send) {
      throw new SpawnRpcClientError(
        "SPAWN_RPC_UNAVAILABLE",
        "Main process RPC is unavailable",
        true
      );
    }

    const requestId = randomUUID();
    const request = {
      protocol: FYLLO_SPAWN_RPC_PROTOCOL,
      version: FYLLO_SPAWN_RPC_VERSION,
      kind: "request",
      requestId,
      method: input.method,
      caller: input.caller,
      params: input.params,
    } as FylloSpawnRpcRequest;

    const result = await new Promise<unknown>((resolve, reject) => {
      const onAbort = (): void => {
        this.pending.delete(requestId);
        const cancel: FylloSpawnRpcCancel = {
          protocol: FYLLO_SPAWN_RPC_PROTOCOL,
          version: FYLLO_SPAWN_RPC_VERSION,
          kind: "cancel",
          requestId,
        };
        this.send(cancel);
        reject(new SpawnRpcClientError("SPAWN_RPC_CANCELLED", "MCP request was cancelled"));
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

  close(reason = "fyllo-spawn RPC client closed"): void {
    if (this.closed) return;
    this.closed = true;
    this.ipc.off("message", this.onMessage);
    this.ipc.off("disconnect", this.onDisconnect);
    for (const pending of this.pending.values()) {
      pending.cleanup();
      pending.reject(new SpawnRpcClientError("SPAWN_RPC_UNAVAILABLE", reason, true));
    }
    this.pending.clear();
  }

  private send(message: FylloSpawnRpcRequest | FylloSpawnRpcCancel): void {
    if (!this.ipc.connected || !this.ipc.send) {
      throw new SpawnRpcClientError(
        "SPAWN_RPC_UNAVAILABLE",
        "Main process RPC is unavailable",
        true
      );
    }
    this.ipc.send(message as Parameters<ChildProcess["send"]>[0]);
  }
}
