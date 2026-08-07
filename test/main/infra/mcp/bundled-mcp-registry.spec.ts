import { describe, expect, it } from "vitest";
import {
  bundledMcpServers,
  getBundledMcpTransportPolicy,
} from "@main/infra/mcp/bundled-mcp-registry";

describe("bundled MCP registry", () => {
  it("keeps existing servers on stdio fallback and makes fyllo-spawn HTTP-only", () => {
    expect(
      bundledMcpServers.map((server) => [server.name, getBundledMcpTransportPolicy(server)])
    ).toEqual([
      ["fyllo-specs", "http-or-stdio"],
      ["fyllo-cortex", "http-or-stdio"],
      ["fyllo-spawn", "http-only"],
    ]);
  });
});
