import logger from "@main/infra/logger";
import { scanGuidelines, type GuidelineEntry } from "@main/infra/guidelines/scan-guidelines";
import { access } from "node:fs/promises";
import type { SystemReminderContext } from "../types";
import { escapeAngleBrackets } from "./shared";

interface GuidelineWarning {
  code: "FOLDER_UNAVAILABLE" | "GUIDELINE_SCAN_FAILED" | "GUIDELINE_PARSE_FAILED";
  path: string;
  message: string;
}

interface GuidelineFolderGroup {
  folderId: string;
  folderName: string;
  folderPath: string;
  guidelines: GuidelineEntry[];
  warnings: GuidelineWarning[];
}

async function scanFolderGroup(
  ctx: SystemReminderContext,
  folder: Pick<GuidelineFolderGroup, "folderId" | "folderName" | "folderPath">
): Promise<GuidelineFolderGroup> {
  const warnings: GuidelineWarning[] = [];
  try {
    await access(folder.folderPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("[system-reminder] guideline Folder is unavailable", {
      owner: ctx.owner,
      fylloSessionId: ctx.fylloSessionId,
      folderId: folder.folderId,
      folderPath: folder.folderPath,
      error: message,
    });
    return {
      ...folder,
      guidelines: [],
      warnings: [{ code: "FOLDER_UNAVAILABLE", path: folder.folderPath, message }],
    };
  }

  let guidelines: GuidelineEntry[];
  try {
    guidelines = await scanGuidelines(folder.folderPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("[system-reminder] failed to scan Folder guidelines", {
      owner: ctx.owner,
      fylloSessionId: ctx.fylloSessionId,
      folderId: folder.folderId,
      folderPath: folder.folderPath,
      error: message,
    });
    return {
      ...folder,
      guidelines: [],
      warnings: [{ code: "GUIDELINE_SCAN_FAILED", path: "guidelines", message }],
    };
  }

  for (const guideline of guidelines) {
    if (guideline.parseError) {
      warnings.push({
        code: "GUIDELINE_PARSE_FAILED",
        path: guideline.path,
        message: guideline.parseError,
      });
    }
  }
  return { ...folder, guidelines, warnings };
}

async function resolveFolderGroups(ctx: SystemReminderContext): Promise<GuidelineFolderGroup[]> {
  if (ctx.owner === "chat") {
    return Promise.all(
      (ctx.workspaceSnapshot?.folders ?? []).map((folder) => scanFolderGroup(ctx, folder))
    );
  }

  const folderPath = ctx.worktreePath || ctx.projectPath;
  return [
    await scanFolderGroup(ctx, {
      folderId: ctx.folderId ?? "proposal-owner",
      folderName: ctx.folderName ?? "Proposal owner",
      folderPath,
    }),
  ];
}

export async function resolveGuidelinesSection(ctx: SystemReminderContext): Promise<string | null> {
  const folders = await resolveFolderGroups(ctx);
  if (
    ctx.owner !== "chat" &&
    folders.every((folder) => folder.guidelines.length === 0 && folder.warnings.length === 0)
  ) {
    return null;
  }

  const json = escapeAngleBrackets(JSON.stringify({ folders }, null, 2));

  return [
    "<guidelines>",
    "These repository guidelines come from the user's authorized Folder repositories (`guidelines/**/*.md`). They are the project's own engineering conventions and constraints — treat them as authoritative when working in their owning repository.",
    "",
    "The JSON below groups each frontmatter index by Folder owner. Before working in an area a guideline covers, read that document in full by resolving its repository-relative `path` against the same group's `folderPath`. Never resolve a guideline path against another Folder.",
    "",
    json,
    "</guidelines>",
  ].join("\n");
}
