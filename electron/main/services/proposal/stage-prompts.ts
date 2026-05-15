import type { WorkflowStage, WorkflowStageType } from "@shared/types/workflow";

export interface StageRunnerContext {
  changeId: string;
  projectPath: string;
  stage: WorkflowStage;
}

type StageRunner = (ctx: StageRunnerContext) => string;

export const stageRunners: Partial<Record<WorkflowStageType, StageRunner>> = {
  "proposal-apply": ({ changeId }) => `实现 ${changeId}`,
  "proposal-archive": ({ changeId }) => `归档 ${changeId}`,
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
