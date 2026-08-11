<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from "vue";
import { useColorMode } from "@vueuse/core";
import { detectLanguage, useMonaco, type MonacoDiffEditorInstance } from "stream-monaco";
import type { TurnFileChange } from "../model/turn-file-changes";

const props = defineProps<{
  change: TurnFileChange;
  open: boolean;
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
let currentEditor: MonacoDiffEditorInstance | null = null;
let heightSyncFrame: number | null = null;
let heightSyncDisposables: { dispose(): void }[] = [];

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

function disposeVisibleHeightSync(): void {
  if (heightSyncFrame !== null) {
    window.cancelAnimationFrame(heightSyncFrame);
    heightSyncFrame = null;
  }
  for (const disposable of heightSyncDisposables) disposable.dispose();
  heightSyncDisposables = [];
  currentEditor = null;
}

function scheduleVisibleHeightSync(): void {
  if (!props.open || !currentEditor || !editorContainer.value) return;
  if (heightSyncFrame !== null) window.cancelAnimationFrame(heightSyncFrame);

  heightSyncFrame = window.requestAnimationFrame(() => {
    heightSyncFrame = null;
    const editor = currentEditor;
    const container = editorContainer.value;
    if (!props.open || !editor || !container) return;

    // stream-monaco 按完整 model 行数计算高度；这里改用折叠后的可见 content 高度。
    const height = Math.ceil(
      Math.max(
        120,
        editor.getOriginalEditor().getContentHeight(),
        editor.getModifiedEditor().getContentHeight()
      )
    );
    const currentHeight = Number.parseFloat(container.style.height || "0");
    if (Math.abs(currentHeight - height) <= 1) return;

    container.style.height = `${height}px`;
    const width = container.clientWidth || container.getBoundingClientRect().width;
    if (width > 0) editor.layout({ width, height });
    else editor.layout();
  });
}

function connectVisibleHeightSync(editor: MonacoDiffEditorInstance): void {
  disposeVisibleHeightSync();
  currentEditor = editor;
  const originalEditor = editor.getOriginalEditor();
  const modifiedEditor = editor.getModifiedEditor();
  heightSyncDisposables = [
    editor.onDidUpdateDiff(scheduleVisibleHeightSync),
    originalEditor.onDidContentSizeChange(scheduleVisibleHeightSync),
    modifiedEditor.onDidContentSizeChange(scheduleVisibleHeightSync),
    originalEditor.onDidChangeHiddenAreas(scheduleVisibleHeightSync),
    modifiedEditor.onDidChangeHiddenAreas(scheduleVisibleHeightSync),
  ];
  scheduleVisibleHeightSync();
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
  connectVisibleHeightSync(editor);
}

watch(
  () => props.change,
  (change) => {
    void syncChange(change);
  },
  { immediate: true }
);

watch(
  () => props.open,
  async (open) => {
    if (!open) return;
    await nextTick();
    scheduleVisibleHeightSync();
  }
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
  disposeVisibleHeightSync();
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
