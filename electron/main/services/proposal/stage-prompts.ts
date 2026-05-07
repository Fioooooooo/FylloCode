import type { WorkflowStage, WorkflowStageType } from "@shared/types/workflow";

export interface StageRunnerContext {
  changeId: string;
  projectPath: string;
  stage: WorkflowStage;
}

type StageRunner = (ctx: StageRunnerContext) => string;

export const stageRunners: Partial<Record<WorkflowStageType, StageRunner>> = {
  "proposal-apply": ({ changeId }) => `加载 skill fyllo-apply-change，实现 ${changeId}`,
  "proposal-archive": ({ changeId }) =>
    `加载 skill fyllo-archive-change，归档 ${changeId}，先同步主 spec 再完成归档。归档完成后将 worktree 的所有变更文件做一次 commit，commit message 模仿最近的 commit 记录`,
};

export function buildStagePrompt(ctx: StageRunnerContext): string {
  const runner = stageRunners[ctx.stage.type];
  if (!runner) {
    const error = new Error(`Stage type "${ctx.stage.type}" not yet implemented`);
    (error as Error & { code?: string }).code = "STAGE_TYPE_NOT_IMPLEMENTED";
    throw error;
  }

  return runner(ctx);
}
