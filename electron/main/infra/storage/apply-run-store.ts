import { promises as fs } from "fs";
import { join } from "path";
import { applyRunsDir } from "@main/infra/storage/project-paths";
import type { ApplyRunMeta } from "@shared/types/proposal";
import type { MessageMeta } from "@shared/types/chat";
import type { UIMessage } from "ai";

export function applyRunDir(projectPath: string, changeId: string): string {
  return join(applyRunsDir(projectPath), changeId);
}

function runMetaPath(projectPath: string, changeId: string): string {
  return join(applyRunDir(projectPath, changeId), "run.json");
}

function stageMessagesPath(projectPath: string, changeId: string, stageIndex: number): string {
  return join(applyRunDir(projectPath, changeId), `stage-${stageIndex}.messages.jsonl`);
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function saveApplyRunMeta(projectPath: string, meta: ApplyRunMeta): Promise<void> {
  await ensureDir(applyRunDir(projectPath, meta.changeId));
  await fs.writeFile(
    runMetaPath(projectPath, meta.changeId),
    JSON.stringify(meta, null, 2),
    "utf8"
  );
}

export async function loadApplyRunMeta(
  projectPath: string,
  changeId: string
): Promise<ApplyRunMeta | null> {
  try {
    const content = await fs.readFile(runMetaPath(projectPath, changeId), "utf8");
    return JSON.parse(content) as ApplyRunMeta;
  } catch {
    return null;
  }
}

export async function appendApplyRunMessage(
  projectPath: string,
  changeId: string,
  stageIndex: number,
  message: UIMessage<MessageMeta>
): Promise<void> {
  await ensureDir(applyRunDir(projectPath, changeId));
  await fs.appendFile(
    stageMessagesPath(projectPath, changeId, stageIndex),
    `${JSON.stringify(message)}\n`,
    "utf8"
  );
}

export async function loadApplyRunMessages(
  projectPath: string,
  changeId: string,
  stageIndex: number
): Promise<UIMessage<MessageMeta>[]> {
  try {
    const content = await fs.readFile(stageMessagesPath(projectPath, changeId, stageIndex), "utf8");
    return content
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as UIMessage<MessageMeta>);
  } catch {
    return [];
  }
}
