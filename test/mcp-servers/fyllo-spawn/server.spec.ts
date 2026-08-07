import { afterEach, describe, expect, it } from "vitest";
import { startServer } from "../../../src/mcp-servers/fyllo-spawn/src/server";

const originalTransport = process.env.FYLLO_MCP_TRANSPORT;

afterEach(() => {
  if (originalTransport === undefined) delete process.env.FYLLO_MCP_TRANSPORT;
  else process.env.FYLLO_MCP_TRANSPORT = originalTransport;
});

describe("fyllo-spawn server", () => {
  it("拒绝 stdio transport，不创建降级连接", async () => {
    process.env.FYLLO_MCP_TRANSPORT = "stdio";
    await expect(startServer()).rejects.toThrow("supports HTTP transport only");
  });
});
