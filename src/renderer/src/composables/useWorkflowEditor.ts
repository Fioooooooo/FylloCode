import { dump, load } from "js-yaml";
import type { WorkflowStageType } from "@shared/types/workflow";
import {
  STAGE_TEMPLATES,
  toStringValue,
  type RawStage,
  type RawWorkflow,
} from "@renderer/utils/workflow";

type WritableStringRef = {
  value: string;
};

export type UseWorkflowEditorReturn = {
  appendStage: (type: WorkflowStageType) => void;
  removeStage: (stageId: string) => void;
  updateStageAgent: (stageId: string, agentId: string) => void;
  reorderStages: (newOrder: string[]) => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readWorkflow(source: string): RawWorkflow | null {
  try {
    const document = load(source);
    return isRecord(document) ? (document as RawWorkflow) : {};
  } catch {
    return null;
  }
}

function writeWorkflow(document: RawWorkflow): string {
  return dump(document, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
  });
}

function readStages(document: RawWorkflow | null): RawStage[] {
  if (!document) {
    return [];
  }

  if (!Array.isArray(document.stages)) {
    return [];
  }

  return document.stages.filter((stage): stage is RawStage => isRecord(stage));
}

function createStageId(type: WorkflowStageType, stages: RawStage[]): string {
  const baseId = STAGE_TEMPLATES[type].id;
  const existingIds = new Set(
    stages.map((stage) => toStringValue(stage.id)).filter((id): id is string => Boolean(id))
  );

  if (!existingIds.has(baseId)) {
    return baseId;
  }

  let index = 2;
  let nextId = `${baseId}-${index}`;
  while (existingIds.has(nextId)) {
    index += 1;
    nextId = `${baseId}-${index}`;
  }

  return nextId;
}

export function useWorkflowEditor(source: WritableStringRef): UseWorkflowEditorReturn {
  function write(document: RawWorkflow): void {
    source.value = writeWorkflow(document);
  }

  function appendStage(type: WorkflowStageType): void {
    const document = readWorkflow(source.value);
    if (!document) {
      return;
    }

    const stages = readStages(document);
    const template = STAGE_TEMPLATES[type];

    write({
      ...document,
      stages: [
        ...stages,
        {
          ...template,
          id: createStageId(type, stages),
        },
      ],
    });
  }

  function removeStage(stageId: string): void {
    const document = readWorkflow(source.value);
    if (!document) {
      return;
    }

    const stages = readStages(document);
    const nextStages = stages.filter((stage) => toStringValue(stage.id) !== stageId);

    if (nextStages.length === stages.length) {
      return;
    }

    write({
      ...document,
      stages: nextStages,
    });
  }

  function updateStageAgent(stageId: string, agentId: string): void {
    const document = readWorkflow(source.value);
    if (!document) {
      return;
    }

    const stages = readStages(document);
    let changed = false;

    const nextStages = stages.map((stage) => {
      if (toStringValue(stage.id) !== stageId) {
        return stage;
      }

      if (toStringValue(stage.agent) === agentId) {
        return stage;
      }

      changed = true;
      return {
        ...stage,
        agent: agentId,
      };
    });

    if (!changed) {
      return;
    }

    write({
      ...document,
      stages: nextStages,
    });
  }

  function reorderStages(newOrder: string[]): void {
    const document = readWorkflow(source.value);
    if (!document) {
      return;
    }

    const stages = readStages(document);
    if (stages.length === 0) {
      return;
    }

    const stageMap = new Map(
      stages.map((stage) => {
        const id = toStringValue(stage.id);
        return [id ?? "", stage] as const;
      })
    );

    const reordered: RawStage[] = [];
    for (const id of newOrder) {
      const stage = stageMap.get(id);
      if (!stage) {
        continue;
      }

      reordered.push(stage);
      stageMap.delete(id);
    }

    for (const stage of stages) {
      const id = toStringValue(stage.id);
      if (id && stageMap.has(id)) {
        reordered.push(stage);
        stageMap.delete(id);
      }
    }

    const nextIds = reordered.map((stage) => toStringValue(stage.id));
    const currentIds = stages.map((stage) => toStringValue(stage.id));
    if (
      nextIds.length === currentIds.length &&
      nextIds.every((id, index) => id === currentIds[index])
    ) {
      return;
    }

    write({
      ...document,
      stages: reordered,
    });
  }

  return {
    appendStage,
    removeStage,
    updateStageAgent,
    reorderStages,
  };
}
