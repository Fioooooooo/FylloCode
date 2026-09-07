<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import mermaid from "mermaid";
import type { WorkflowDefinition } from "@shared/types/workflow";
import { workflowDefinitionToMermaid } from "../model/workflow-graph";

const props = defineProps<{
  definition: WorkflowDefinition | null;
  parseError: string | null;
}>();

const svgContainer = ref<HTMLElement | null>(null);
const renderError = ref<string | null>(null);
const rendering = ref(false);
let renderGeneration = 0;

async function renderGraph(definition: WorkflowDefinition | null, parseError: string | null) {
  const generation = ++renderGeneration;
  if (svgContainer.value) svgContainer.value.innerHTML = "";
  renderError.value = null;
  rendering.value = false;

  if (parseError || !definition) return;

  rendering.value = true;
  try {
    await nextTick();
    mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });
    const result = await mermaid.render(
      `workflow-graph-${generation}`,
      workflowDefinitionToMermaid(definition)
    );
    if (generation !== renderGeneration) return;
    if (svgContainer.value) svgContainer.value.innerHTML = result.svg;
  } catch (error: unknown) {
    if (generation !== renderGeneration) return;
    renderError.value = error instanceof Error ? error.message : String(error);
  } finally {
    if (generation === renderGeneration) rendering.value = false;
  }
}

watch(
  () => [props.definition, props.parseError] as const,
  ([definition, parseError]) => void renderGraph(definition, parseError),
  { immediate: true }
);
</script>

<template>
  <section
    data-test="workflow-graph"
    class="flex h-full min-h-0 flex-col rounded-md border border-default bg-default"
    aria-label="Workflow Graph"
  >
    <div
      v-if="parseError"
      data-test="workflow-graph-parse-error"
      class="m-4 rounded-md border border-error/30 bg-error/10 px-3 py-2 text-sm text-error"
    >
      YAML 解析失败：{{ parseError }}
    </div>
    <div
      v-else-if="renderError"
      data-test="workflow-graph-render-error"
      class="m-4 rounded-md border border-error/30 bg-error/10 px-3 py-2 text-sm text-error"
    >
      Graph 渲染失败：{{ renderError }}
    </div>
    <p v-else-if="!definition" class="px-4 py-3 text-sm text-muted">输入有效 YAML 后显示 Graph</p>
    <div v-else class="min-h-0 flex-1 overflow-auto p-4">
      <p v-if="rendering" class="mb-3 text-sm text-muted">正在生成 Graph…</p>
      <div ref="svgContainer" data-test="workflow-graph-svg" />
    </div>
  </section>
</template>
