import logger from "@main/infra/logger";
import { scanGuidelines, type GuidelineEntry } from "@main/infra/guidelines/scan-guidelines";
import type { SystemReminderContext } from "../types";

// Guideline frontmatter is user-authored text; escape angle brackets so a crafted
// value cannot close the <guidelines> section. The escaped form stays valid JSON.
function escapeAngleBrackets(json: string): string {
  return json.replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
}

export async function resolveGuidelinesSection(ctx: SystemReminderContext): Promise<string | null> {
  const workspaceRoot = ctx.worktreePath || ctx.projectPath;

  let guidelines: GuidelineEntry[];
  try {
    guidelines = await scanGuidelines(workspaceRoot);
  } catch (error) {
    logger.warn("[system-reminder] failed to scan project guidelines", {
      owner: ctx.owner,
      fylloSessionId: ctx.fylloSessionId,
      workspaceRoot,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }

  if (guidelines.length === 0) {
    return null;
  }

  const json = escapeAngleBrackets(JSON.stringify({ guidelines }, null, 2));

  return [
    "<guidelines>",
    "These repository guidelines come from the user's project (`guidelines/**/*.md`). They are the project's own engineering conventions and constraints — treat them as authoritative when working in this repository.",
    "",
    "The JSON below is an index built from each guideline file's frontmatter. Before analysis, design, implementation, refactoring, or testing in an area a guideline covers, read that document in full via its `path` (relative to the current workspace root).",
    "",
    json,
    "</guidelines>",
  ].join("\n");
}
