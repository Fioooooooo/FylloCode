<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from "vue";
import { useColorMode } from "@vueuse/core";
import { detectLanguage, useMonaco } from "stream-monaco";
import type { TurnFileChange } from "../model/turn-file-changes";

const props = defineProps<{
  change: TurnFileChange;
}>();

const colorMode = useColorMode();
const editorContainer = ref<HTMLElement | null>(null);
const { createDiffEditor, updateDiff, cleanupEditor, setTheme } = useMonaco({
  readOnly: true,
  MAX_HEIGHT: Number.MAX_SAFE_INTEGER,
  minimap: { enabled: false },
  lineNumbers: "on",
  renderOverviewRuler: false,
  scrollBeyondLastLine: false,
  automaticLayout: true,
  autoScrollInitial: false,
  autoScrollOnUpdate: false,
});
let editorGeneration = 0;
let editorCreated = false;

function changeLanguage(change: TurnFileChange): string {
  return detectLanguage(change.modified || change.original);
}

function isSupersededEditorCreation(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === "AbortError" ||
    (error as Error & { code?: string }).code === "STREAM_MONACO_CREATE_SUPERSEDED"
  );
}

async function syncChange(change: TurnFileChange): Promise<void> {
  const language = changeLanguage(change);
  if (editorCreated) {
    updateDiff(change.original, change.modified, language);
    return;
  }

  const generation = ++editorGeneration;
  await nextTick();
  if (generation !== editorGeneration || !editorContainer.value) return;

  let editor: Awaited<ReturnType<typeof createDiffEditor>>;
  try {
    editor = await createDiffEditor(
      editorContainer.value,
      change.original,
      change.modified,
      language
    );
  } catch (error) {
    if (generation !== editorGeneration && isSupersededEditorCreation(error)) return;
    throw error;
  }

  if (generation !== editorGeneration) {
    editor.dispose();
    return;
  }

  editorCreated = true;
}

watch(
  () => props.change,
  (change) => {
    void syncChange(change);
  },
  { immediate: true }
);

watch(
  () => colorMode.value,
  (mode) => {
    void setTheme(mode === "dark" ? "vitesse-dark" : "vitesse-light");
  },
  { immediate: true }
);

onUnmounted(() => {
  editorGeneration += 1;
  editorCreated = false;
  cleanupEditor();
});
</script>

<template>
  <div
    ref="editorContainer"
    class="w-full"
    :data-path="change.path"
    data-test="turn-file-change-diff-editor"
  />
</template>
