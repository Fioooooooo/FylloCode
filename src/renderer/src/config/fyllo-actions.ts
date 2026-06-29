import { getFylloActionContract } from "@shared/constants/fyllo-action-contracts";
import TaskCreateAction from "@renderer/components/shared/fyllo-action/TaskCreateAction.vue";
import type { Component } from "vue";
import type { FylloActionPayloadByType, FylloActionType } from "@shared/types/fyllo-action";

type FylloActionDefinitionBase<Type extends FylloActionType> = {
  type: Type;
  title: string;
  icon: string;
  component: Component<{ payload: FylloActionPayloadByType[Type] }>;
  getSummary?: (payload: FylloActionPayloadByType[Type]) => string | undefined;
};

export type FylloActionDefinition = {
  [Type in FylloActionType]: FylloActionDefinitionBase<Type>;
}[FylloActionType];

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
    component: TaskCreateAction,
    getSummary: (payload) => payload.title,
  },
] as const satisfies readonly FylloActionDefinition[];

export function getFylloActionDefinition(type: FylloActionType): FylloActionDefinition {
  const definition = fylloActionDefinitions.find((item) => item.type === type);
  if (!definition) {
    throw new Error(`Missing Fyllo action renderer definition: ${type}`);
  }

  return definition;
}
