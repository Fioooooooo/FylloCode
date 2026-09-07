import type { WorkflowDefinition } from "@shared/types/workflow";

const mermaidEntities: Record<string, string> = {
  "&": "#38;",
  "<": "#60;",
  ">": "#62;",
  '"': "#34;",
  "[": "#91;",
  "]": "#93;",
  "{": "#123;",
  "}": "#125;",
  "(": "#40;",
  ")": "#41;",
  "|": "#124;",
  "#": "#35;",
  ";": "#59;",
  "\\": "#92;",
};

export function escapeMermaidLabel(value: string): string {
  return value.replace(
    /[&<>"[\]{}()|#;\\]/g,
    (character) => mermaidEntities[character] ?? character
  );
}

function nodeId(index: number): string {
  return `stage_${index}`;
}

export function workflowDefinitionToMermaid(definition: WorkflowDefinition): string {
  const nodeIds = new Map(definition.stages.map((stage, index) => [stage.id, nodeId(index)]));
  const lines = ["flowchart TD"];

  definition.stages.forEach((stage, index) => {
    const title = stage.name?.trim() || stage.id;
    const label = `${escapeMermaidLabel(title)}<br/>${escapeMermaidLabel(stage.id)}<br/>${escapeMermaidLabel(stage.kind)}`;
    lines.push(`  ${nodeId(index)}["${label}"]`);
  });

  definition.stages.forEach((stage) => {
    for (const transition of stage.next ?? []) {
      const targetId = nodeIds.get(transition.goto);
      if (!targetId) continue;
      const loopLabel =
        transition.maxLoops === undefined ? "" : ` (maxLoops=${transition.maxLoops})`;
      const label = escapeMermaidLabel(`${transition.on}${loopLabel}`);
      lines.push(`  ${nodeIds.get(stage.id)} -->|${label}| ${targetId}`);
    }
  });

  return lines.join("\n");
}
