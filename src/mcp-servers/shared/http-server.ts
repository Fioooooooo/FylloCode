import {
  createServer,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { parseRequestContext, runWithRequestContext } from "./request-context";

export type McpServerFactory = () => McpServer;

export interface McpHttpServerHandle {
  port: number;
  close: () => Promise<void>;
}

interface ActiveRequest {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
}

function sendError(res: ServerResponse, statusCode: number, message: string): void {
  if (res.headersSent) {
    res.end();
    return;
  }
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: message }));
}

async function closeHttpServer(server: HttpServer): Promise<void> {
  if (!server.listening) {
    return;
  }
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
}

export async function startHttpServer(
  createMcpServer: McpServerFactory,
  signal?: AbortSignal
): Promise<McpHttpServerHandle> {
  const token = process.env.FYLLO_MCP_AUTH_TOKEN;
  if (!token) {
    throw new Error("FYLLO_MCP_AUTH_TOKEN is required for HTTP transport");
  }

  const activeRequests = new Set<ActiveRequest>();
  let closing = false;

  const httpServer = createServer((req, res) => {
    void handleRequest(req, res);
  });

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (closing) {
      sendError(res, 503, "MCP server is shutting down");
      return;
    }
    if (new URL(req.url ?? "/", "http://127.0.0.1").pathname !== "/mcp") {
      sendError(res, 404, "Not found");
      return;
    }
    if (req.headers.authorization !== `Bearer ${token}`) {
      sendError(res, 401, "Unauthorized");
      return;
    }

    let context;
    try {
      context = parseRequestContext(req.headers);
    } catch (error: unknown) {
      sendError(res, 400, error instanceof Error ? error.message : "Invalid request context");
      return;
    }

    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const activeRequest = { server, transport };
    activeRequests.add(activeRequest);

    try {
      await runWithRequestContext(context, async () => {
        await server.connect(transport);
        await transport.handleRequest(req, res);
      });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : "MCP request failed");
    } finally {
      activeRequests.delete(activeRequest);
      await server.close().catch(() => undefined);
    }
  }

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      httpServer.off("listening", onListening);
      reject(error);
    };
    const onListening = (): void => {
      httpServer.off("error", onError);
      resolve();
    };
    httpServer.once("error", onError);
    httpServer.once("listening", onListening);
    httpServer.listen(0, "127.0.0.1");
  });

  const address = httpServer.address() as AddressInfo | null;
  if (!address) {
    await closeHttpServer(httpServer);
    throw new Error("MCP HTTP server did not expose a listening address");
  }

  let closePromise: Promise<void> | null = null;
  const close = (): Promise<void> => {
    closePromise ??= (async () => {
      closing = true;
      const listenerClosed = closeHttpServer(httpServer);
      await Promise.allSettled(
        [...activeRequests].map(async ({ server }) => {
          await server.close();
        })
      );
      activeRequests.clear();
      await listenerClosed;
    })();
    return closePromise;
  };

  signal?.addEventListener("abort", () => void close(), { once: true });
  process.send?.({ type: "ready", port: address.port });

  return { port: address.port, close };
}
