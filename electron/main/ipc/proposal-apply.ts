import { promises as fs } from "fs";
import { join } from "path";
import { ipcMain } from "electron";
import { load, dump } from "js-yaml";
import { ProposalChannels } from "@shared/types/channels";
import type { ApplyRunMeta, ProposalStatus } from "@shared/types/proposal";
import type { WorkflowStage, WorkflowTemplate } from "@shared/types/workflow";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { DEFAULT_ACP_AGENT_ID } from "@shared/constants/agents";
import {
  applyInputSchema,
  archiveCancelInputSchema,
  archiveInputSchema,
  loadRunInputSchema,
  loadRunMessagesInputSchema,
  stageStreamCancelInputSchema,
  stageStreamInputSchema,
} from "@shared/schemas/ipc/proposal";
import type { SessionEvent } from "@main/chat-agent/types";
import { AcpSession } from "@main/chat-agent/acp-session";
import { MessageAssembler } from "@main/chat-agent/message-assembler";
import { loadSessionMeta } from "@main/chat-agent/session-store";
import { toMessageChunk } from "@main/chat-agent/session-event-mapper";
import { loadProject } from "@main/services/project-store";
import { getUserWorkflowDirectory, listBuiltInWorkflowFileNames } from "@main/workflows";
import { readWorkflowDirectory, resolveProjectWorkflowDirectory } from "./workflow";
import { wrapHandler } from "./_kit/wrap-handler";
import { validate } from "./_kit/schema";
import { ipcError } from "./_kit/errors";
import { makeStreamChannel } from "./_kit/stream-channel";
import logger from "@main/utils/logger";
import {
  appendApplyRunMessage,
  loadApplyRunMessages,
  loadApplyRunMeta,
  saveApplyRunMeta,
} from "./proposal-apply/apply-run-store";
import { buildStagePrompt } from "./proposal-apply/stage-runners";
import type { IpcErrorCode } from "@shared/constants/error-codes";

const activeApplySessions = new Map<string, AcpSession>();
const activeArchiveSessions = new Map<string, AcpSession>();

async function resolveProjectPath(projectId: string): Promise<string> {
  const project = await loadProject(projectId);
  if (!project) {
    throw ipcError(IpcErrorCodes.PROJECT_NOT_FOUND, `Project not found: ${projectId}`);
  }

  return project.path;
}

async function resolveChangeDir(projectPath: string, changeId: string): Promise<string | null> {
  const rootDir = join(projectPath, "openspec", "changes", changeId);
  const archiveDir = join(projectPath, "openspec", "changes", "archive", changeId);

  try {
    await fs.access(join(rootDir, ".openspec.yaml"));
    return rootDir;
  } catch {
    try {
      await fs.access(join(archiveDir, ".openspec.yaml"));
      return archiveDir;
    } catch {
      return null;
    }
  }
}

async function loadWorkflowTemplates(projectId: string): Promise<WorkflowTemplate[]> {
  const builtInFileNames = new Set(await listBuiltInWorkflowFileNames());
  const userTemplates = await readWorkflowDirectory(getUserWorkflowDirectory(), "custom");
  const projectWorkflowDirectory = await resolveProjectWorkflowDirectory(projectId);
  const projectTemplates = projectWorkflowDirectory
    ? await readWorkflowDirectory(projectWorkflowDirectory, "custom")
    : [];

  const builtInTemplates = userTemplates
    .filter((template) => builtInFileNames.has(`${template.id}.yaml`))
    .map((template) => ({ ...template, source: "built-in" as const }));
  const customUserTemplates = userTemplates.filter(
    (template) => !builtInFileNames.has(`${template.id}.yaml`)
  );

  return [...customUserTemplates, ...projectTemplates, ...builtInTemplates];
}

async function findWorkflowTemplate(
  projectId: string,
  workflowId: string
): Promise<WorkflowTemplate | null> {
  const templates = await loadWorkflowTemplates(projectId);
  return templates.find((template) => template.id === workflowId) ?? null;
}

async function updateChangeStatus(
  projectPath: string,
  changeId: string,
  nextStatus: ProposalStatus
): Promise<void> {
  const changeDir = await resolveChangeDir(projectPath, changeId);
  if (!changeDir) {
    throw ipcError(IpcErrorCodes.PROPOSAL_NOT_FOUND, `Proposal not found: ${changeId}`);
  }

  const yamlPath = join(changeDir, ".openspec.yaml");
  const content = await fs.readFile(yamlPath, "utf8");
  const parsed = load(content);
  const nextDoc = parsed && typeof parsed === "object" ? parsed : {};
  (nextDoc as Record<string, unknown>).status = nextStatus;
  await fs.writeFile(yamlPath, dump(nextDoc), "utf8");
}

async function updateRunMetaIfCurrent(
  projectPath: string,
  changeId: string,
  runId: string,
  updater: (meta: ApplyRunMeta) => ApplyRunMeta
): Promise<void> {
  const current = await loadApplyRunMeta(projectPath, changeId);
  if (!current || current.runId !== runId) {
    return;
  }

  await saveApplyRunMeta(projectPath, updater(current));
}

function getCompletedApplyStageIndex(runMeta: ApplyRunMeta): number {
  const completedUntil = Math.min(runMeta.currentStageIndex, runMeta.stages.length) - 1;
  for (let index = completedUntil; index >= 0; index -= 1) {
    if (runMeta.stages[index]?.type === "proposal-apply") {
      return index;
    }
  }

  return -1;
}

function buildArchiveStage(agentId: string): WorkflowStage {
  return {
    id: "archive",
    name: "归档",
    type: "proposal-archive",
    agent: agentId,
  };
}

function mapAcpErrorCode(raw: string): IpcErrorCode {
  if (raw === IpcErrorCodes.ACP_NOT_READY) return IpcErrorCodes.ACP_NOT_READY;
  if (raw === IpcErrorCodes.ACP_EXIT_GIVEUP) return IpcErrorCodes.ACP_EXIT_GIVEUP;
  if (raw === IpcErrorCodes.SPAWN_ERROR) return IpcErrorCodes.SPAWN_ERROR;
  return IpcErrorCodes.ACP_ERROR;
}

export function registerProposalApplyHandlers(): void {
  ipcMain.handle(ProposalChannels.apply, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(applyInputSchema, input);
      const projectPath = await resolveProjectPath(form.projectId);
      const template = await findWorkflowTemplate(form.projectId, form.workflowId);
      if (!template) {
        throw ipcError(IpcErrorCodes.WORKFLOW_NOT_FOUND, `Workflow not found: ${form.workflowId}`);
      }

      const runId = `run-${Date.now()}`;
      const startedAt = new Date().toISOString();
      const runMeta: ApplyRunMeta = {
        runId,
        changeId: form.changeId,
        workflowId: form.workflowId,
        stages: template.stages,
        currentStageIndex: 0,
        stageAcpSessionIds: {},
        status: "running",
        startedAt,
        updatedAt: startedAt,
      };

      await saveApplyRunMeta(projectPath, runMeta);
      await updateChangeStatus(projectPath, form.changeId, "applying");

      return {
        runId,
        stages: template.stages,
      };
    })
  );

  ipcMain.handle(ProposalChannels.stageStream, (event, input: unknown) => {
    const form = validate(stageStreamInputSchema, input);

    return makeStreamChannel({
      event,
      portChannel: ProposalChannels.stageStreamPort,
      logTag: "proposal-apply",
      onReady: async (sink) => {
        const projectPath = await resolveProjectPath(form.projectId);
        const runMeta = await loadApplyRunMeta(projectPath, form.changeId);
        if (!runMeta || runMeta.runId !== form.runId) {
          throw ipcError(IpcErrorCodes.APPLY_RUN_NOT_FOUND, `Apply run not found: ${form.runId}`);
        }

        const stage = runMeta.stages[form.stageIndex];
        if (!stage) {
          throw ipcError(IpcErrorCodes.STAGE_NOT_FOUND, `Stage not found: ${form.stageIndex}`);
        }

        const prompt = buildStagePrompt({ changeId: form.changeId, projectPath, stage });

        const agentId = stage.agent ?? DEFAULT_ACP_AGENT_ID;
        const assembler = new MessageAssembler(form.runId);
        const session = new AcpSession({
          fylloSessionId: `${form.runId}-${form.stageIndex}`,
          agentId,
          projectPath,
          cwd: projectPath,
        });

        activeApplySessions.set(form.runId, session);

        session.on("event", (ev: SessionEvent) => {
          switch (ev.type) {
            case "session_id_resolved":
              void updateRunMetaIfCurrent(projectPath, form.changeId, form.runId, (meta) => ({
                ...meta,
                stageAcpSessionIds: {
                  ...meta.stageAcpSessionIds,
                  [form.stageIndex]: ev.acpSessionId,
                },
                updatedAt: new Date().toISOString(),
              })).catch((error: unknown) => {
                logger.error("[proposal-apply] failed to persist acp session id", error);
              });
              break;
            case "text_delta":
            case "tool_call_start":
            case "tool_call_update": {
              assembler.apply(ev);
              const chunk = toMessageChunk(ev);
              if (chunk) sink.sendChunk(chunk);
              break;
            }
            case "session_info_update":
              // Apply run does not surface title updates to renderer.
              break;
            case "done":
              void (async () => {
                const message = assembler.flush();
                if (message) {
                  await appendApplyRunMessage(projectPath, form.changeId, form.stageIndex, message);
                }

                await updateRunMetaIfCurrent(projectPath, form.changeId, form.runId, (meta) => {
                  const nextIndex = form.stageIndex + 1;
                  return {
                    ...meta,
                    currentStageIndex: nextIndex,
                    status: nextIndex >= meta.stages.length ? "done" : "running",
                    updatedAt: new Date().toISOString(),
                  };
                });

                sink.sendDone(ev.totalTokens);
                activeApplySessions.delete(form.runId);
              })().catch((error: unknown) => {
                logger.error("[proposal-apply] failed to persist completed message", error);
                sink.sendError(
                  IpcErrorCodes.APPLY_RUN_PERSIST_FAILED,
                  error instanceof Error ? error.message : String(error)
                );
                activeApplySessions.delete(form.runId);
              });
              break;
            case "error":
              void updateRunMetaIfCurrent(projectPath, form.changeId, form.runId, (meta) => ({
                ...meta,
                status: "error",
                updatedAt: new Date().toISOString(),
              })).catch((error: unknown) => {
                logger.error("[proposal-apply] failed to persist run error status", error);
              });
              sink.sendError(mapAcpErrorCode(ev.code), ev.message);
              activeApplySessions.delete(form.runId);
              break;
          }
        });

        return {
          start: async () => {
            try {
              await session.start(prompt);
            } catch (error: unknown) {
              const message = error instanceof Error ? error.message : String(error);
              void updateRunMetaIfCurrent(projectPath, form.changeId, form.runId, (meta) => ({
                ...meta,
                status: "error",
                updatedAt: new Date().toISOString(),
              })).catch((persistError: unknown) => {
                logger.error("[proposal-apply] failed to persist start error status", persistError);
              });
              throw ipcError(IpcErrorCodes.ACP_ERROR, message);
            }
          },
          cancel: () => {
            session.cancel();
            activeApplySessions.delete(form.runId);
          },
        };
      },
    });
  });

  ipcMain.handle(ProposalChannels.stageStreamCancel, (_event, input: unknown) =>
    wrapHandler(async () => {
      const { runId } = validate(stageStreamCancelInputSchema, input);
      const session = activeApplySessions.get(runId);
      if (!session) {
        return;
      }

      session.cancel();
      activeApplySessions.delete(runId);
    })
  );

  ipcMain.handle(ProposalChannels.archive, (event, input: unknown) => {
    const form = validate(archiveInputSchema, input);
    const sessionKey = `${form.projectId}:${form.changeId}`;

    return makeStreamChannel({
      event,
      portChannel: ProposalChannels.archivePort,
      logTag: "proposal-archive",
      onReady: async (sink) => {
        const projectPath = await resolveProjectPath(form.projectId);
        const runMeta = await loadApplyRunMeta(projectPath, form.changeId);
        if (!runMeta || runMeta.status !== "done") {
          throw ipcError(
            IpcErrorCodes.APPLY_RUN_NOT_READY,
            `Apply run not ready: ${form.changeId}`
          );
        }

        const completedStageIndex = getCompletedApplyStageIndex(runMeta);
        if (completedStageIndex < 0) {
          throw ipcError(
            IpcErrorCodes.APPLY_RUN_NOT_READY,
            `Apply run not ready: ${form.changeId}`
          );
        }

        const fylloSessionId = `${runMeta.runId}-${completedStageIndex}`;
        const sessionMeta = await loadSessionMeta(projectPath, fylloSessionId);
        if (!sessionMeta?.acpSessionId) {
          throw ipcError(
            IpcErrorCodes.APPLY_SESSION_NOT_READY,
            `Apply session not ready for archive: ${form.changeId}`
          );
        }

        const stage = buildArchiveStage(sessionMeta.agentId);
        const prompt = buildStagePrompt({
          changeId: form.changeId,
          projectPath,
          stage,
        });

        const session = new AcpSession({
          fylloSessionId,
          agentId: sessionMeta.agentId,
          projectPath,
          cwd: projectPath,
        });
        activeArchiveSessions.set(sessionKey, session);

        session.on("event", (ev: SessionEvent) => {
          if (
            ev.type === "text_delta" ||
            ev.type === "tool_call_start" ||
            ev.type === "tool_call_update" ||
            ev.type === "session_info_update"
          ) {
            const chunk = toMessageChunk(ev);
            if (chunk) sink.sendChunk(chunk);
            return;
          }

          if (ev.type === "done") {
            sink.sendDone(ev.totalTokens);
            activeArchiveSessions.delete(sessionKey);
            return;
          }

          if (ev.type === "error") {
            sink.sendError(mapAcpErrorCode(ev.code), ev.message);
            activeArchiveSessions.delete(sessionKey);
          }
        });

        return {
          start: async () => {
            await session.start(prompt);
          },
          cancel: () => {
            session.cancel();
            activeArchiveSessions.delete(sessionKey);
          },
        };
      },
    });
  });

  ipcMain.handle(ProposalChannels.archiveCancel, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(archiveCancelInputSchema, input);
      const sessionKey = `${form.projectId}:${form.changeId}`;
      const session = activeArchiveSessions.get(sessionKey);
      if (!session) {
        return;
      }

      session.cancel();
      activeArchiveSessions.delete(sessionKey);
    })
  );

  ipcMain.handle(ProposalChannels.loadRun, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(loadRunInputSchema, input);
      const projectPath = await resolveProjectPath(form.projectId);
      return await loadApplyRunMeta(projectPath, form.changeId);
    })
  );

  ipcMain.handle(ProposalChannels.loadRunMessages, (_event, input: unknown) =>
    wrapHandler(async () => {
      const form = validate(loadRunMessagesInputSchema, input);
      const projectPath = await resolveProjectPath(form.projectId);
      return await loadApplyRunMessages(projectPath, form.changeId, form.stageIndex);
    })
  );
}
