import { promises as fs } from "fs";
import { join } from "path";
import { ipcMain, MessageChannelMain, type MessagePortMain } from "electron";
import { load, dump } from "js-yaml";
import { ProposalChannels } from "@shared/types/channels";
import type { MessageChunkData } from "@shared/types/ipc";
import type { ApplyRunMeta, ProposalStatus } from "@shared/types/proposal";
import type { WorkflowStage, WorkflowTemplate } from "@shared/types/workflow";
import type { SessionEvent } from "@main/chat-agent/types";
import { AcpSession } from "@main/chat-agent/acp-session";
import { MessageAssembler } from "@main/chat-agent/message-assembler";
import { loadSessionMeta } from "@main/chat-agent/session-store";
import { loadProject } from "@main/services/project-store";
import { getUserWorkflowDirectory, listBuiltInWorkflowFileNames } from "@main/workflows";
import { readWorkflowDirectory, resolveProjectWorkflowDirectory } from "./workflow";
import { wrapHandler } from "./utils";
import logger from "@main/utils/logger";
import {
  appendApplyRunMessage,
  loadApplyRunMessages,
  loadApplyRunMeta,
  saveApplyRunMeta,
} from "./proposal-apply/apply-run-store";
import { buildStagePrompt } from "./proposal-apply/stage-runners";

const activeApplySessions = new Map<string, AcpSession>();
const activeArchiveSessions = new Map<string, AcpSession>();

function createError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

async function resolveProjectPath(projectId: string): Promise<string> {
  const project = await loadProject(projectId);
  if (!project) {
    throw createError("PROJECT_NOT_FOUND", `Project not found: ${projectId}`);
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
    throw createError("PROPOSAL_NOT_FOUND", `Proposal not found: ${changeId}`);
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

function safePostPortMessage(port: MessagePortMain, payload: unknown): void {
  try {
    port.postMessage(payload);
  } catch (error) {
    logger.warn("[proposal-apply] failed to post message to port", error);
  }
}

function closePort(port: MessagePortMain): void {
  try {
    port.close();
  } catch {
    // ignore
  }
}

function toChunkData(ev: SessionEvent): MessageChunkData | null {
  if (ev.type === "text_delta") {
    return { kind: "text_delta", text: ev.text };
  }

  if (ev.type === "tool_call_start") {
    return {
      kind: "tool_call_start",
      toolCallId: ev.toolCallId,
      title: ev.title,
      toolKind: ev.kind,
    };
  }

  if (ev.type === "tool_call_update") {
    return {
      kind: "tool_call_update",
      toolCallId: ev.toolCallId,
      status: ev.status,
      input: ev.input ? JSON.parse(JSON.stringify(ev.input)) : undefined,
      content: ev.content,
    };
  }

  return null;
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

export function registerProposalApplyHandlers(): void {
  ipcMain.handle(
    ProposalChannels.apply,
    (_event, input: { projectId: string; changeId: string; workflowId: string }) =>
      wrapHandler(async () => {
        const projectPath = await resolveProjectPath(input.projectId);
        const template = await findWorkflowTemplate(input.projectId, input.workflowId);
        if (!template) {
          throw createError("WORKFLOW_NOT_FOUND", `Workflow not found: ${input.workflowId}`);
        }

        const runId = `run-${Date.now()}`;
        const startedAt = new Date().toISOString();
        const runMeta: ApplyRunMeta = {
          runId,
          changeId: input.changeId,
          workflowId: input.workflowId,
          stages: template.stages,
          currentStageIndex: 0,
          stageAcpSessionIds: {},
          status: "running",
          startedAt,
          updatedAt: startedAt,
        };

        await saveApplyRunMeta(projectPath, runMeta);
        await updateChangeStatus(projectPath, input.changeId, "applying");

        return {
          runId,
          stages: template.stages,
        };
      })
  );

  ipcMain.handle(
    ProposalChannels.stageStream,
    async (
      event,
      input: { runId: string; stageIndex: number; projectId: string; changeId: string }
    ) => {
      try {
        const { port1, port2 } = new MessageChannelMain();
        event.sender.postMessage(ProposalChannels.stageStreamPort, null, [port2]);

        const portClosed = { value: false };
        const sendError = (code: string, message: string): void => {
          if (portClosed.value) {
            return;
          }

          safePostPortMessage(port1, { type: "error", data: { code, message } });
          portClosed.value = true;
          closePort(port1);
        };
        const sendDone = (totalTokens: number): void => {
          if (portClosed.value) {
            return;
          }

          safePostPortMessage(port1, { type: "done", data: { totalTokens } });
          portClosed.value = true;
          closePort(port1);
        };

        const sendChunk = (data: unknown): void => {
          if (portClosed.value) {
            return;
          }

          safePostPortMessage(port1, { type: "chunk", data });
        };

        void (async () => {
          try {
            const projectPath = await resolveProjectPath(input.projectId);
            const runMeta = await loadApplyRunMeta(projectPath, input.changeId);
            if (!runMeta || runMeta.runId !== input.runId) {
              sendError("APPLY_RUN_NOT_FOUND", `Apply run not found: ${input.runId}`);
              return;
            }

            const stage = runMeta.stages[input.stageIndex];
            if (!stage) {
              sendError("STAGE_NOT_FOUND", `Stage not found: ${input.stageIndex}`);
              return;
            }

            let prompt: string;
            try {
              prompt = buildStagePrompt({ changeId: input.changeId, projectPath, stage });
            } catch (error) {
              const e = error as Error & { code?: string };
              sendError(e.code ?? "STAGE_TYPE_NOT_IMPLEMENTED", e.message);
              return;
            }

            const agentId = stage.agent ?? "claude-acp";
            const assembler = new MessageAssembler(input.runId);
            const session = new AcpSession({
              fylloSessionId: `${input.runId}-${input.stageIndex}`,
              agentId,
              projectPath,
              cwd: projectPath,
            });

            activeApplySessions.set(input.runId, session);

            session.on("event", (ev: SessionEvent) => {
              switch (ev.type) {
                case "session_id_resolved":
                  void updateRunMetaIfCurrent(projectPath, input.changeId, input.runId, (meta) => ({
                    ...meta,
                    stageAcpSessionIds: {
                      ...meta.stageAcpSessionIds,
                      [input.stageIndex]: ev.acpSessionId,
                    },
                    updatedAt: new Date().toISOString(),
                  })).catch((error: unknown) => {
                    logger.error("[proposal-apply] failed to persist acp session id", error);
                  });
                  break;
                case "text_delta":
                case "tool_call_start":
                case "tool_call_update":
                  assembler.apply(ev);
                  sendChunk({
                    kind:
                      ev.type === "text_delta"
                        ? "text_delta"
                        : ev.type === "tool_call_start"
                          ? "tool_call_start"
                          : "tool_call_update",
                    ...(ev.type === "text_delta"
                      ? { text: ev.text }
                      : ev.type === "tool_call_start"
                        ? { toolCallId: ev.toolCallId, title: ev.title, toolKind: ev.kind }
                        : {
                            toolCallId: ev.toolCallId,
                            status: ev.status,
                            input: ev.input ? JSON.parse(JSON.stringify(ev.input)) : undefined,
                            content: ev.content,
                          }),
                  });
                  break;
                case "done":
                  void (async () => {
                    const message = assembler.flush();
                    if (message) {
                      await appendApplyRunMessage(
                        projectPath,
                        input.changeId,
                        input.stageIndex,
                        message
                      );
                    }

                    await updateRunMetaIfCurrent(
                      projectPath,
                      input.changeId,
                      input.runId,
                      (meta) => {
                        const nextIndex = input.stageIndex + 1;
                        return {
                          ...meta,
                          currentStageIndex: nextIndex,
                          status: nextIndex >= meta.stages.length ? "done" : "running",
                          updatedAt: new Date().toISOString(),
                        };
                      }
                    );

                    sendDone(ev.totalTokens);
                    activeApplySessions.delete(input.runId);
                  })().catch((error: unknown) => {
                    logger.error("[proposal-apply] failed to persist completed message", error);
                    sendError(
                      "APPLY_RUN_PERSIST_FAILED",
                      error instanceof Error ? error.message : String(error)
                    );
                    activeApplySessions.delete(input.runId);
                  });
                  break;
                case "error":
                  void updateRunMetaIfCurrent(projectPath, input.changeId, input.runId, (meta) => ({
                    ...meta,
                    status: "error",
                    updatedAt: new Date().toISOString(),
                  })).catch((error: unknown) => {
                    logger.error("[proposal-apply] failed to persist run error status", error);
                  });
                  sendError(ev.code, ev.message);
                  activeApplySessions.delete(input.runId);
                  break;
                case "session_info_update":
                  break;
              }
            });

            port1.once("message", (msg) => {
              const payload = msg.data as { type?: string } | undefined;
              if (payload?.type === "ready") {
                session.start(prompt).catch((error: unknown) => {
                  const message = error instanceof Error ? error.message : String(error);
                  void updateRunMetaIfCurrent(projectPath, input.changeId, input.runId, (meta) => ({
                    ...meta,
                    status: "error",
                    updatedAt: new Date().toISOString(),
                  })).catch((persistError: unknown) => {
                    logger.error(
                      "[proposal-apply] failed to persist start error status",
                      persistError
                    );
                  });
                  sendError("ACP_ERROR", message);
                  activeApplySessions.delete(input.runId);
                });
              }
            });
            port1.start();
          } catch (error) {
            const e = error as Error & { code?: string };
            sendError(e.code ?? "UNKNOWN_ERROR", e.message);
            activeApplySessions.delete(input.runId);
          }
        })();

        return { ok: true, data: null };
      } catch (error) {
        const e = error as Error & { code?: string };
        return {
          ok: false,
          error: {
            code: e.code ?? "UNKNOWN_ERROR",
            message: e.message,
          },
        };
      }
    }
  );

  ipcMain.handle(ProposalChannels.stageStreamCancel, (_event, input: { runId: string }) =>
    wrapHandler(async () => {
      const session = activeApplySessions.get(input.runId);
      if (!session) {
        return;
      }

      session.cancel();
      activeApplySessions.delete(input.runId);
    })
  );

  ipcMain.handle(
    ProposalChannels.archive,
    async (event, input: { projectId: string; changeId: string }) => {
      try {
        const projectPath = await resolveProjectPath(input.projectId);
        const runMeta = await loadApplyRunMeta(projectPath, input.changeId);
        if (!runMeta || runMeta.status !== "done") {
          throw createError("APPLY_RUN_NOT_READY", `Apply run not ready: ${input.changeId}`);
        }

        const completedStageIndex = getCompletedApplyStageIndex(runMeta);
        if (completedStageIndex < 0) {
          throw createError("APPLY_RUN_NOT_READY", `Apply run not ready: ${input.changeId}`);
        }

        const fylloSessionId = `${runMeta.runId}-${completedStageIndex}`;
        const sessionMeta = await loadSessionMeta(projectPath, fylloSessionId);
        if (!sessionMeta?.acpSessionId) {
          throw createError(
            "APPLY_SESSION_NOT_READY",
            `Apply session not ready for archive: ${input.changeId}`
          );
        }

        const stage = buildArchiveStage(sessionMeta.agentId);
        const prompt = buildStagePrompt({
          changeId: input.changeId,
          projectPath,
          stage,
        });

        const { port1, port2 } = new MessageChannelMain();
        event.sender.postMessage(ProposalChannels.archivePort, null, [port2]);

        const portClosed = { value: false };
        const sessionKey = `${input.projectId}:${input.changeId}`;
        const sendError = (code: string, message: string): void => {
          if (portClosed.value) {
            return;
          }

          safePostPortMessage(port1, { type: "error", data: { code, message } });
          portClosed.value = true;
          closePort(port1);
        };
        const sendDone = (totalTokens: number): void => {
          if (portClosed.value) {
            return;
          }

          safePostPortMessage(port1, { type: "done", data: { totalTokens } });
          portClosed.value = true;
          closePort(port1);
        };
        const sendChunk = (data: MessageChunkData): void => {
          if (portClosed.value) {
            return;
          }

          safePostPortMessage(port1, { type: "chunk", data });
        };

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
            ev.type === "tool_call_update"
          ) {
            const chunkData = toChunkData(ev);
            if (chunkData) {
              sendChunk(chunkData);
            }
            return;
          }

          if (ev.type === "done") {
            sendDone(ev.totalTokens);
            activeArchiveSessions.delete(sessionKey);
            return;
          }

          if (ev.type === "error") {
            sendError(ev.code, ev.message);
            activeArchiveSessions.delete(sessionKey);
          }
        });

        port1.once("message", (msg) => {
          const payload = msg.data as { type?: string } | undefined;
          if (payload?.type === "ready") {
            session.start(prompt).catch((error: unknown) => {
              sendError("ACP_ERROR", error instanceof Error ? error.message : String(error));
              activeArchiveSessions.delete(sessionKey);
            });
          }
        });
        port1.start();

        return { ok: true, data: null };
      } catch (error) {
        const e = error as Error & { code?: string };
        return {
          ok: false,
          error: {
            code: e.code ?? "UNKNOWN_ERROR",
            message: e.message,
          },
        };
      }
    }
  );

  ipcMain.handle(
    ProposalChannels.archiveCancel,
    (_event, input: { projectId: string; changeId: string }) =>
      wrapHandler(async () => {
        const sessionKey = `${input.projectId}:${input.changeId}`;
        const session = activeArchiveSessions.get(sessionKey);
        if (!session) {
          return;
        }

        session.cancel();
        activeArchiveSessions.delete(sessionKey);
      })
  );

  ipcMain.handle(
    ProposalChannels.loadRun,
    (_event, input: { projectId: string; changeId: string }) =>
      wrapHandler(async () => {
        const projectPath = await resolveProjectPath(input.projectId);
        return await loadApplyRunMeta(projectPath, input.changeId);
      })
  );

  ipcMain.handle(
    ProposalChannels.loadRunMessages,
    (_event, input: { projectId: string; changeId: string; stageIndex: number }) =>
      wrapHandler(async () => {
        const projectPath = await resolveProjectPath(input.projectId);
        return await loadApplyRunMessages(projectPath, input.changeId, input.stageIndex);
      })
  );
}
