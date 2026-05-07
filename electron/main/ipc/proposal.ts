import { promises as fs } from "fs";
import { basename, join } from "path";
import { ipcMain } from "electron";
import { ProposalChannels } from "@shared/types/channels";
import type { ProposalMeta, ProposalStatus } from "@shared/types/proposal";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import {
  listProposalsInputSchema,
  readProposalFileInputSchema,
} from "@shared/schemas/ipc/proposal";
import { wrapHandler } from "./_kit/wrap-handler";
import { validate } from "./_kit/schema";
import { ipcError } from "./_kit/errors";
import { loadProject } from "@main/services/project-store";

type ProposalFileLocation = {
  changeId: string;
  directory: string;
  archived: boolean;
};

function toTitleCase(input: string): string {
  return input
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function stripArchivePrefix(changeId: string): string {
  return changeId.replace(/^\d{4}-\d{2}-\d{2}-/, "");
}

function parseYamlStatus(content: string): ProposalStatus {
  const match = content.match(/^\s*status:\s*(creating|draft|applying|archived)\s*$/m);
  return (match?.[1] as ProposalStatus | undefined) ?? "draft";
}

function parseYamlCreated(content: string): string {
  const match = content.match(/^\s*created:\s*(.+)\s*$/m);
  return match?.[1]?.trim() ?? "";
}

function parseWhySummary(content: string): string {
  const whyMatch = content.match(/^\s*##\s+Why\s*$/m);
  if (!whyMatch) {
    return "";
  }

  const startIndex = (whyMatch.index ?? 0) + whyMatch[0].length;
  const tail = content.slice(startIndex);
  const lines = tail.split(/\r?\n/);
  const paragraphs: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (/^\s*##\s+/.test(line)) {
      break;
    }

    if (line.trim() === "") {
      if (current.length > 0) {
        paragraphs.push(current.join(" ").trim());
        current = [];
      }
      continue;
    }

    if (/^\s*-\s+\[[ x]\]/.test(line) || /^\s*-\s+/.test(line)) {
      continue;
    }

    current.push(line.trim());
  }

  if (current.length > 0) {
    paragraphs.push(current.join(" ").trim());
  }

  const summary = paragraphs.find(Boolean) ?? "";
  return summary.length > 300 ? `${summary.slice(0, 300)}...` : summary;
}

function countTasks(content: string): { totalTasks: number; doneTasks: number } {
  const doneTasks = (content.match(/^\s*-\s+\[x\]\s+/gim) ?? []).length;
  const pendingTasks = (content.match(/^\s*-\s+\[\s\]\s+/gim) ?? []).length;
  return { totalTasks: doneTasks + pendingTasks, doneTasks };
}

function normalizeChangeId(dirname: string): ProposalFileLocation {
  if (/^\d{4}-\d{2}-\d{2}-/.test(dirname)) {
    return {
      changeId: dirname,
      directory: dirname,
      archived: true,
    };
  }

  return {
    changeId: dirname,
    directory: dirname,
    archived: false,
  };
}

async function readIfExists(targetPath: string): Promise<string | null> {
  try {
    return await fs.readFile(targetPath, "utf8");
  } catch {
    return null;
  }
}

async function readProposalFiles(projectPath: string): Promise<ProposalMeta[]> {
  const baseChangesDir = join(projectPath, "openspec", "changes");
  try {
    const entries = await fs.readdir(baseChangesDir, { withFileTypes: true });
    const metas: ProposalMeta[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === "archive") {
        continue;
      }

      const location = normalizeChangeId(entry.name);
      const changeDir = join(baseChangesDir, location.directory);
      const yamlContent = await readIfExists(join(changeDir, ".openspec.yaml"));
      if (!yamlContent) {
        continue;
      }

      const proposalContent = await readIfExists(join(changeDir, "proposal.md"));
      const tasksContent = await readIfExists(join(changeDir, "tasks.md"));
      const status = parseYamlStatus(yamlContent);
      const date = parseYamlCreated(yamlContent);
      const why = proposalContent ? parseWhySummary(proposalContent) : "";
      const taskCounts = tasksContent ? countTasks(tasksContent) : { totalTasks: 0, doneTasks: 0 };

      metas.push({
        id: location.changeId,
        title: toTitleCase(stripArchivePrefix(entry.name)),
        status: location.archived ? "archived" : status,
        why,
        totalTasks: taskCounts.totalTasks,
        doneTasks: taskCounts.doneTasks,
        hasDesign: Boolean(await readIfExists(join(changeDir, "design.md"))),
        date,
      });
    }

    const archiveDir = join(baseChangesDir, "archive");
    try {
      const archiveEntries = await fs.readdir(archiveDir, { withFileTypes: true });
      for (const entry of archiveEntries) {
        if (!entry.isDirectory()) {
          continue;
        }

        const location = normalizeChangeId(entry.name);
        const changeDir = join(archiveDir, location.directory);
        const yamlContent = await readIfExists(join(changeDir, ".openspec.yaml"));
        if (!yamlContent) {
          continue;
        }

        const proposalContent = await readIfExists(join(changeDir, "proposal.md"));
        const tasksContent = await readIfExists(join(changeDir, "tasks.md"));
        const date = parseYamlCreated(yamlContent);
        const taskCounts = tasksContent
          ? countTasks(tasksContent)
          : { totalTasks: 0, doneTasks: 0 };

        metas.push({
          id: location.changeId,
          title: toTitleCase(stripArchivePrefix(entry.name)),
          status: "archived",
          why: proposalContent ? parseWhySummary(proposalContent) : "",
          totalTasks: taskCounts.totalTasks,
          doneTasks: taskCounts.doneTasks,
          hasDesign: Boolean(await readIfExists(join(changeDir, "design.md"))),
          date,
        });
      }
    } catch {
      // archive 目录不存在时返回根目录 change 列表即可
    }

    return metas.sort((left, right) => {
      const leftTime = new Date(left.date).getTime();
      const rightTime = new Date(right.date).getTime();
      return rightTime - leftTime;
    });
  } catch {
    return [];
  }
}

async function resolveChangeDir(projectPath: string, changeId: string): Promise<string | null> {
  const rootDir = join(projectPath, "openspec", "changes", changeId);
  const archiveDir = join(projectPath, "openspec", "changes", "archive", changeId);

  if (await readIfExists(join(rootDir, ".openspec.yaml"))) {
    return rootDir;
  }

  if (await readIfExists(join(archiveDir, ".openspec.yaml"))) {
    return archiveDir;
  }

  return null;
}

export function registerProposalHandlers(): void {
  ipcMain.handle(ProposalChannels.list, (_event, input: unknown) =>
    wrapHandler(async () => {
      const { projectId } = validate(listProposalsInputSchema, input);
      const project = await loadProject(projectId);
      if (!project) {
        throw ipcError(IpcErrorCodes.PROJECT_NOT_FOUND, `Project not found: ${projectId}`);
      }

      return await readProposalFiles(project.path);
    })
  );

  ipcMain.handle(ProposalChannels.readFile, (_event, input: unknown) =>
    wrapHandler(async () => {
      const { projectId, changeId, filename } = validate(readProposalFileInputSchema, input);
      const project = await loadProject(projectId);
      if (!project) {
        throw ipcError(IpcErrorCodes.PROJECT_NOT_FOUND, `Project not found: ${projectId}`);
      }

      const changeDir = await resolveChangeDir(project.path, changeId);
      if (!changeDir) {
        return null;
      }

      const fileContent = await readIfExists(join(changeDir, basename(filename)));
      return fileContent;
    })
  );
}
