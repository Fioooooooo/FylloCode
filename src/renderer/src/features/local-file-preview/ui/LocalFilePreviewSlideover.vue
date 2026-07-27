<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import { useColorMode } from "@vueuse/core";
import { useMonaco } from "stream-monaco";
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

async function mountDocument(document: LocalFilePreviewDocument | null): Promise<void> {
  const generation = ++editorGeneration;
  cleanupEditor();
  if (!document) return;

  await nextTick();
  if (generation !== editorGeneration || !editorContainer.value) return;

  const editor = await createEditor(editorContainer.value, document.content, document.language);
  if (generation !== editorGeneration) {
    cleanupEditor();
    return;
  }

  editor.updateOptions({
    readOnly: true,
    domReadOnly: true,
    lineNumbers: "on",
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
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
  () => (state.value.status === "ready" ? state.value.document : null),
  (document) => {
    void mountDocument(document);
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
  cleanupEditor();
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
            <div class="min-w-0 space-y-1">
              <h2 class="text-base font-semibold text-highlighted">本地文件预览</h2>
              <p
                v-if="titlePath"
                class="wrap-anywhere font-mono text-xs text-muted"
                data-test="preview-path"
              >
                {{ titlePath }}
              </p>
            </div>
            <UTooltip text="关闭">
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
          v-else-if="state.status === 'ready'"
          ref="editorContainer"
          class="min-h-0 flex-1"
          data-test="preview-editor"
        />
      </div>
    </template>
  </USlideover>
</template>
