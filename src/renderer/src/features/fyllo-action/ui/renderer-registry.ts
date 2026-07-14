import type { Component } from "vue";
import { getFylloActionContract } from "@shared/fyllo-action/registry";
import type { FylloActionPayloadByType, FylloActionType } from "@shared/fyllo-action/protocol";

type PayloadOf<Type extends FylloActionType> = FylloActionPayloadByType[Type];
import TaskCreateAction from "./actions/TaskCreateAction.vue";
import PlanCreateAction from "./actions/PlanCreateAction.vue";
import KnowledgeFlagAction from "./actions/KnowledgeFlagAction.vue";
import KnowledgeReviewAction from "./actions/KnowledgeReviewAction.vue";

export interface RendererActionDefinitionBase<Type extends FylloActionType> {
  type: Type;
  title: string;
  icon: string;
  component: Component<{ payload: FylloActionPayloadByType[Type] }>;
  confirmLabel?: string;
  showCancel?: boolean;
  getSummary?: (payload: FylloActionPayloadByType[Type]) => string | undefined;
}

export type RendererActionDefinition = {
  [Type in FylloActionType]: RendererActionDefinitionBase<Type>;
}[FylloActionType];

function assertContractEnabled<Type extends FylloActionType>(type: Type): Type {
  if (!getFylloActionContract(type)) {
    throw new Error(`Fyllo action renderer definition has no shared contract: ${type}`);
  }

  return type;
}

export function createRendererActionDefinitions(
  components: Record<FylloActionType, Component>
): Record<FylloActionType, RendererActionDefinition> {
  return {
    "task.create": {
      type: assertContractEnabled("task.create"),
      title: "创建任务",
      icon: "i-lucide-list-plus",
      component: components["task.create"],
      getSummary: (payload: PayloadOf<"task.create">) => payload.title,
    },
    "plan.create": {
      type: assertContractEnabled("plan.create"),
      title: "审阅规划",
      icon: "i-lucide-clipboard-check",
      component: components["plan.create"],
      confirmLabel: "审阅方案",
      showCancel: false,
      getSummary: (payload: PayloadOf<"plan.create">) => payload.goal,
    },
    "knowledge.flag": {
      type: assertContractEnabled("knowledge.flag"),
      title: "发现可沉淀知识",
      icon: "i-lucide-bookmark-plus",
      component: components["knowledge.flag"],
      confirmLabel: "沉淀知识",
      showCancel: true,
      getSummary: (payload: PayloadOf<"knowledge.flag">) => payload.summary,
    },
    "knowledge.review": {
      type: assertContractEnabled("knowledge.review"),
      title: "审阅知识",
      icon: "i-lucide-book-open-check",
      component: components["knowledge.review"],
      confirmLabel: "审阅知识",
      showCancel: true,
      getSummary: (payload: PayloadOf<"knowledge.review">) => payload.summary ?? payload.name,
    },
  };
}

export function getRendererActionDefinition<Type extends FylloActionType>(
  definitions: Record<FylloActionType, RendererActionDefinition>,
  type: Type
): Extract<RendererActionDefinition, { type: Type }> {
  const definition = definitions[type];
  if (!definition) {
    throw new Error(`Missing Fyllo action renderer definition: ${type}`);
  }

  return definition as unknown as Extract<RendererActionDefinition, { type: Type }>;
}

export const rendererActionDefinitions = createRendererActionDefinitions({
  "task.create": TaskCreateAction,
  "plan.create": PlanCreateAction,
  "knowledge.flag": KnowledgeFlagAction,
  "knowledge.review": KnowledgeReviewAction,
});
