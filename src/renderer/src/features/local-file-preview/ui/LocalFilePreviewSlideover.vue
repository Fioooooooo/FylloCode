<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import { useColorMode } from "@vueuse/core";
import { useMonaco } from "stream-monaco";
import MarkStream from "@renderer/components/shared/MarkStream.vue";
import type { LocalFilePreviewDocument } from "@shared/types/local-file-preview";
import type { LocalFilePreviewController } from "../application/local-file-preview-controller";

const props = defineProps<{
  controller: LocalFilePreviewController;
}>();

const emit = defineEmits<{
  close: [];
}>();

const colorMode = useColorMode();
const editorContainer = ref<HTMLElement | null>(null);
const state = computed(() => props.controller.state.value);
const previewMode = ref<"source" | "rendered">("source");
const wordWrapMode = ref<"overflow" | "wrap">("overflow");
const wordWrap = computed(() => wordWrapMode.value === "wrap");
const { createEditor, cleanupEditor, setTheme } = useMonaco({
  readOnly: true,
  MAX_HEIGHT: "100%",
  minimap: { enabled: false },
  lineNumbers: "on",
  scrollBeyondLastLine: false,
  automaticLayout: true,
  autoScrollInitial: false,
  autoScrollOnUpdate: false,
});
let editorGeneration = 0;
let currentEditor: Awaited<ReturnType<typeof createEditor>> | null = null;

const readyDocument = computed<LocalFilePreviewDocument | null>(() => {
  return state.value.status === "ready" ? state.value.document : null;
});
const isMarkdownPreview = computed(() => readyDocument.value?.language === "markdown");
const markdownPreviewId = "local-file-preview-markdown";
const previewTabs: { label: string; icon: string; value: "source" | "rendered" }[] = [
  { label: "原文", icon: "i-lucide-code-2", value: "source" },
  { label: "预览", icon: "i-lucide-book-open-text", value: "rendered" },
];
const wordWrapTabs = computed<
  { label: string; icon: string; value: "overflow" | "wrap"; disabled: boolean }[]
>(() => {
  const disabled = previewMode.value === "rendered";
  return [
    { label: "内容溢出", icon: "i-lucide-arrow-left-right", value: "overflow", disabled },
    { label: "自动换行", icon: "i-lucide-wrap-text", value: "wrap", disabled },
  ];
});
const toolbarTabsUi = {
  root: "w-auto gap-0",
  list: "w-auto p-0.5",
  trigger: "grow-0",
} as const;
const slideoverTooltipUi = { content: "z-[60]" } as const;

const titlePath = computed(() => {
  const current = state.value;
  if (current.status === "ready") return current.document.canonicalPath;
  if (current.status === "confirmation-required") return current.canonicalPath;
  if (current.status === "error") return current.canonicalPath ?? current.requestedPath ?? "";
  if (current.status === "loading") return current.requestedPath;
  return "";
});

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(bytes < 1024 * 100 ? 1 : 0)} KiB`;
}

function closePreview(): void {
  props.controller.cancel();
  emit("close");
}

async function confirm(rememberForWindow: boolean): Promise<void> {
  await props.controller.confirm({ rememberForWindow });
}

function cleanupCurrentEditor(): void {
  currentEditor = null;
  cleanupEditor();
}

function isSupersededEditorCreation(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  return (
    error.name === "AbortError" ||
    (error as Error & { code?: string }).code === "STREAM_MONACO_CREATE_SUPERSEDED"
  );
}

async function mountDocument(document: LocalFilePreviewDocument | null): Promise<void> {
  const generation = ++editorGeneration;
  cleanupCurrentEditor();
  if (!document || previewMode.value !== "source") return;

  await nextTick();
  if (generation !== editorGeneration || !editorContainer.value) return;

  let editor: Awaited<ReturnType<typeof createEditor>>;
  try {
    editor = await createEditor(editorContainer.value, document.content, document.language);
  } catch (error) {
    if (generation !== editorGeneration && isSupersededEditorCreation(error)) return;
    throw error;
  }

  if (generation !== editorGeneration) {
    editor.dispose();
    return;
  }

  currentEditor = editor;
  editor.updateOptions({
    readOnly: true,
    domReadOnly: true,
    lineNumbers: "on",
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap: wordWrap.value ? "on" : "off",
  });
  const lineNumber = document.line ?? 1;
  editor.setPosition({
    lineNumber,
    column: document.column ?? 1,
  });
  if (document.line) {
    editor.revealLineInCenter(document.line);
  } else {
    editor.revealLineNearTop(1);
  }
}

watch(
  () => [readyDocument.value, previewMode.value] as const,
  ([document]) => {
    void mountDocument(document);
  },
  { immediate: true }
);

watch(wordWrap, (enabled) => {
  currentEditor?.updateOptions({ wordWrap: enabled ? "on" : "off" });
});

watch(
  () => colorMode.value,
  (mode) => {
    void setTheme(mode === "dark" ? "vitesse-dark" : "vitesse-light");
  },
  { immediate: true }
);

onUnmounted(() => {
  editorGeneration += 1;
  cleanupCurrentEditor();
  props.controller.dispose();
});
</script>

<template>
  <USlideover
    :close="false"
    :ui="{
      content: 'w-[min(100vw,960px)] max-w-none',
      body: 'h-full min-h-0 p-0 sm:p-0',
    }"
  >
    <template #body>
      <div class="flex h-full min-h-0 flex-col bg-default" data-test="local-file-preview">
        <header class="shrink-0 border-b border-default px-5 py-4">
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0 flex-1 space-y-1">
              <h2 class="text-sm font-semibold text-highlighted">本地文件预览</h2>
              <p
                v-if="titlePath"
                class="wrap-anywhere font-mono text-xs text-muted"
                data-test="preview-path"
              >
                {{ titlePath }}
              </p>
            </div>
            <UTooltip text="关闭" :ui="slideoverTooltipUi">
              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                size="sm"
                aria-label="关闭本地文件预览"
                @click="closePreview"
              />
            </UTooltip>
          </div>
        </header>

        <div
          v-show="readyDocument"
          class="flex shrink-0 items-center gap-4 border-b border-default/50 bg-muted/30 px-4 py-2"
          data-test="preview-toolbar"
        >
          <UTabs
            v-model="wordWrapMode"
            :items="wordWrapTabs"
            value-key="value"
            variant="pill"
            size="sm"
            :content="false"
            aria-label="源码换行模式"
            :ui="toolbarTabsUi"
            data-test="word-wrap-tabs"
          />
          <UTabs
            v-show="isMarkdownPreview"
            v-model="previewMode"
            :items="previewTabs"
            value-key="value"
            variant="pill"
            size="sm"
            :content="false"
            aria-label="Markdown 查看模式"
            :ui="toolbarTabsUi"
            data-test="preview-mode-tabs"
          />
        </div>

        <div
          v-if="state.status === 'ready' && state.agentScope === 'window-only'"
          class="flex shrink-0 items-start gap-2 border-b border-warning/30 bg-warning/10 px-5 py-3 text-sm text-warning"
          data-test="preview-window-only-warning"
        >
          <UIcon name="i-lucide-shield-alert" class="mt-0.5 size-4 shrink-0" />
          <p>
            此文件仅获当前窗口预览授权，不属于当前 Session 的 Agent Project 授权范围，不能作为 Agent
            resource 发送。
          </p>
        </div>

        <div
          v-if="state.status === 'loading'"
          class="flex min-h-0 flex-1 items-center justify-center p-6"
          data-test="preview-loading"
        >
          <div class="space-y-2 text-center">
            <UIcon name="i-lucide-loader-circle" class="mx-auto size-5 animate-spin text-primary" />
            <p class="text-sm text-muted">正在准备文件预览…</p>
          </div>
        </div>

        <div
          v-else-if="state.status === 'confirmation-required'"
          class="flex min-h-0 flex-1 items-center justify-center overflow-auto p-6"
          data-test="preview-confirmation"
        >
          <section
            class="w-full max-w-2xl space-y-5 rounded-xl border border-warning/40 bg-elevated p-5"
          >
            <div class="space-y-2">
              <div class="flex items-center gap-2 text-warning">
                <UIcon name="i-lucide-shield-alert" class="size-5" />
                <h3 class="text-sm font-semibold">项目外文件</h3>
              </div>
              <p class="text-sm leading-6 text-default">
                此文件不在当前项目或已注册 worktree
                内。请核对完整路径后选择本次打开，或在当前窗口中信任它。
              </p>
            </div>
            <div class="rounded-lg bg-default p-3">
              <p class="wrap-anywhere font-mono text-xs text-highlighted">
                {{ state.canonicalPath }}
              </p>
              <p class="mt-2 text-xs text-muted">
                {{ formatBytes(state.size) }} ·
                {{ new Date(state.mtimeMs).toLocaleString() }}
              </p>
            </div>
            <div class="flex flex-wrap justify-end gap-2">
              <UButton color="neutral" variant="ghost" @click="closePreview">取消</UButton>
              <UButton color="neutral" variant="outline" @click="confirm(false)">
                仅打开一次
              </UButton>
              <UButton color="primary" @click="confirm(true)"> 打开并在此窗口中信任 </UButton>
            </div>
          </section>
        </div>

        <div
          v-else-if="state.status === 'error'"
          class="flex min-h-0 flex-1 items-center justify-center overflow-auto p-6"
          data-test="preview-error"
        >
          <section class="w-full max-w-xl space-y-4 rounded-xl bg-elevated p-5">
            <div class="flex items-center gap-2 text-error">
              <UIcon name="i-lucide-file-warning" class="size-5" />
              <h3 class="text-sm font-semibold">无法预览文件</h3>
            </div>
            <p class="text-sm leading-6 text-default">{{ state.message }}</p>
            <div class="flex justify-end">
              <UButton color="neutral" variant="outline" @click="closePreview">关闭</UButton>
            </div>
          </section>
        </div>

        <div
          v-else-if="state.status === 'ready' && isMarkdownPreview && previewMode === 'rendered'"
          class="min-h-0 flex-1 overflow-y-auto"
          data-test="preview-markstream"
        >
          <article class="mx-auto w-full max-w-3xl px-6 py-8 sm:px-8">
            <MarkStream
              :id="markdownPreviewId"
              :content="state.document.content"
              :is-streaming="false"
              :is-dark="colorMode === 'dark'"
            />
          </article>
        </div>

        <div
          v-else-if="state.status === 'ready'"
          ref="editorContainer"
          class="min-h-0 flex-1 overflow-hidden"
          data-test="preview-editor"
        />
      </div>
    </template>
  </USlideover>
</template>
