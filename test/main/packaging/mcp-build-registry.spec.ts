import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("bundled MCP build registry", () => {
  it("keeps every bundled server in the explicit build and distribution registry", async () => {
    const buildScript = await readFile(
      join(process.cwd(), "scripts/build-mcp-servers.mjs"),
      "utf8"
    );
    for (const name of ["fyllo-specs", "fyllo-cortex", "fyllo-spawn", "fyllo-workflow"]) {
      expect(buildScript).toContain(`name: "${name}"`);
      expect(buildScript).toContain(
        `join(repoRoot, "src", "mcp-servers", server.name, "src", "index.ts")`
      );
      expect(buildScript).toContain(`join(outDir, "index.js")`);
    }

    const builderConfig = await readFile(join(process.cwd(), "electron-builder.yml"), "utf8");
    expect(builderConfig).toContain("from: out/mcp-servers");
    expect(builderConfig).toContain("to: app.asar.unpacked/mcp-servers");
  });
});
