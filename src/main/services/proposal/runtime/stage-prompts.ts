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
  "code-review": ({ stage }) => stage.prompt ?? `审查当前变更的正确性、可维护性与测试覆盖。`,
  "security-check": ({ stage }) => stage.prompt ?? `检查当前变更是否存在安全风险。`,
  "create-pr": ({ stage }) => stage.prompt ?? `创建 Pull Request。`,
  custom: ({ stage }) => {
    if (!stage.prompt) {
      const error = new Error(`Custom stage "${stage.name}" requires a prompt`);
      (error as Error & { code?: string }).code = "STAGE_PROMPT_REQUIRED";
      throw error;
    }
    return stage.prompt;
  },
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
