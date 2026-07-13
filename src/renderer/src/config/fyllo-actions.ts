import { getFylloActionContract } from "@shared/constants/fyllo-action-contracts";
import KnowledgeFlagAction from "@renderer/components/shared/fyllo-action/KnowledgeFlagAction.vue";
import KnowledgeReviewAction from "@renderer/components/shared/fyllo-action/KnowledgeReviewAction.vue";
import PlanCreateAction from "@renderer/components/shared/fyllo-action/PlanCreateAction.vue";
import TaskCreateAction from "@renderer/components/shared/fyllo-action/TaskCreateAction.vue";
import type { Component } from "vue";
import type {
  FylloActionPayloadByType,
  FylloActionType,
  KnowledgeFlagActionPayload,
  KnowledgeReviewActionPayload,
  PlanCreateActionPayload,
  TaskCreateActionPayload,
} from "@shared/types/fyllo-action";

type FylloActionDefinitionBase<Type extends FylloActionType> = {
  type: Type;
  title: string;
  icon: string;
  presentation: "inline" | "rail";
  interaction: "passive" | "confirm";
  component: Component<{ payload: FylloActionPayloadByType[Type] }>;
  confirmLabel?: string;
  showCancel?: boolean;
  getSummary?: (payload: FylloActionPayloadByType[Type]) => string | undefined;
};

export type FylloActionDefinition = {
  [Type in FylloActionType]: FylloActionDefinitionBase<Type>;
}[FylloActionType];

// 每个 renderer 侧 action 定义必须在 shared contract 中存在对应项，防止 UI 暴露未经验证的 action。
function assertContractEnabled<Type extends FylloActionType>(type: Type): Type {
  if (!getFylloActionContract(type)) {
    throw new Error(`Fyllo action renderer definition has no shared contract: ${type}`);
  }

  return type;
}

export const fylloActionDefinitions = [
  {
    type: assertContractEnabled("task.create"),
    title: "创建任务",
    icon: "i-lucide-list-plus",
    presentation: "inline",
    interaction: "confirm",
    component: TaskCreateAction,
    getSummary: (payload: TaskCreateActionPayload) => payload.title,
  },
  {
    type: assertContractEnabled("plan.create"),
    title: "审阅规划",
    icon: "i-lucide-clipboard-check",
    presentation: "inline",
    interaction: "confirm",
    component: PlanCreateAction,
    confirmLabel: "审阅方案",
    showCancel: false,
    getSummary: (payload: PlanCreateActionPayload) => payload.goal,
  },
  {
    type: assertContractEnabled("knowledge.flag"),
    title: "发现可沉淀知识",
    icon: "i-lucide-bookmark-plus",
    presentation: "rail",
    interaction: "confirm",
    component: KnowledgeFlagAction,
    confirmLabel: "沉淀知识",
    showCancel: true,
    getSummary: (payload: KnowledgeFlagActionPayload) => payload.summary,
  },
  {
    type: assertContractEnabled("knowledge.review"),
    title: "审阅知识",
    icon: "i-lucide-book-open-check",
    presentation: "rail",
    interaction: "confirm",
    component: KnowledgeReviewAction,
    confirmLabel: "审阅知识",
    showCancel: true,
    getSummary: (payload: KnowledgeReviewActionPayload) => payload.summary ?? payload.name,
  },
] as const satisfies readonly FylloActionDefinition[];

export function getFylloActionDefinition<Type extends FylloActionType>(
  type: Type
): Extract<FylloActionDefinition, { type: Type }> {
  const definition = fylloActionDefinitions.find((item) => item.type === type);
  if (!definition) {
    throw new Error(`Missing Fyllo action renderer definition: ${type}`);
  }

  return definition as unknown as Extract<FylloActionDefinition, { type: Type }>;
}
