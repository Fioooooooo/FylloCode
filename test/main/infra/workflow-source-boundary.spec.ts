import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const activeSourceRoots = [
  "src/main",
  "src/preload",
  "src/renderer/src",
  "src/shared",
  "src/mcp-servers",
];

const sourceExtensions = new Set([".cjs", ".js", ".mjs", ".mts", ".ts", ".tsx", ".vue"]);

const forbiddenPatterns = [
  { label: "WorkflowStage", pattern: /\bWorkflowStage\b/ },
  { label: "WorkflowStageType", pattern: /\bWorkflowStageType\b/ },
  { label: "WorkflowTemplate", pattern: /\bWorkflowTemplate\b/ },
  { label: "ApplyRunMeta", pattern: /\bApplyRunMeta\b/ },
  { label: "ArchiveRunMeta", pattern: /\bArchiveRunMeta\b/ },
  { label: "proposal apply IPC", pattern: /proposal:(?:apply|archive)/ },
  {
    label: "old workflow template loader",
    pattern: /loadAllWorkflowTemplates|findWorkflowTemplate/,
  },
  { label: "built-in workflow loader", pattern: /built-in-loader|initBuiltInWorkflows/ },
  { label: "removed workflow error code", pattern: /BUILT_IN_WORKFLOW|INVALID_WORKFLOW_NAME/ },
  {
    label: "legacy proposal stream helper",
    pattern: /startProposalStream|getDataSubPath\(\s*["'](?:workflows|apply-runs)["']/,
  },
];

const deletedPaths = [
  "src/main/ipc/proposal/apply.ts",
  "src/main/ipc/proposal/archive.ts",
  "src/main/infra/storage/apply-run-store.ts",
  "src/main/infra/storage/apply-stage-acp-session-store.ts",
  "src/main/infra/storage/archive-acp-session-store.ts",
  "src/main/services/proposal/runtime/apply-run-service.ts",
  "src/main/services/proposal/runtime/stage-prompts.ts",
  "src/preload/api/proposal/apply.ts",
  "src/preload/api/proposal/archive.ts",
  "src/preload/api/proposal/stream.ts",
  "src/renderer/src/api/proposal/apply.ts",
  "src/renderer/src/api/proposal/archive.ts",
  "src/renderer/src/components/proposal/ProposalApplySidePanel.vue",
  "src/renderer/src/stores/proposal/run.ts",
];

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return sourceExtensions.has(path.slice(path.lastIndexOf("."))) ? [path] : [];
  });
}

describe("active workflow source boundary", () => {
  it("does not retain the removed WorkflowStage or Proposal stage-stream chain", () => {
    const violations = activeSourceRoots.flatMap((root) =>
      sourceFiles(join(process.cwd(), root)).flatMap((path) => {
        const source = readFileSync(path, "utf8");
        return forbiddenPatterns.flatMap(({ label, pattern }) =>
          pattern.test(source) ? [`${relative(process.cwd(), path)}: ${label}`] : []
        );
      })
    );

    expect(violations).toEqual([]);
  });

  it("keeps the old stage-stream implementation paths absent", () => {
    expect(deletedPaths.filter((path) => existsSync(join(process.cwd(), path)))).toEqual([]);
  });
});
