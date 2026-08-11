<script setup lang="ts">
import { computed, toRef } from "vue";
import type { ToolCallDiff, ToolCallLocation } from "@shared/types/stream-event";
import { parseLocalFileLink, useLocalFilePreview } from "@renderer/features/local-file-preview";
import {
  selectToolTurnFileChanges,
  useTurnFileChangeReview,
  type TurnFileChange,
  type TurnFileChangeKind,
} from "@renderer/features/turn-file-change-review";

const props = withDefaults(
  defineProps<{
    input: string | null;
    output: string | null;
    error?: string | null;
    diffs?: ToolCallDiff[];
    locations?: ToolCallLocation[];
    turnFileChanges?: readonly TurnFileChange[];
  }>(),
  {
    error: null,
    diffs: () => [],
    locations: () => [],
    turnFileChanges: () => [],
  }
);

const { openLocalFilePreview } = useLocalFilePreview();
const { openTurnFileChangeReview } = useTurnFileChangeReview();
const turnFileChangesSource = toRef(props, "turnFileChanges");
const toolFileChanges = computed(() =>
  selectToolTurnFileChanges(props.diffs, props.turnFileChanges)
);
const changeKindLabels: Record<TurnFileChangeKind, string> = {
  added: "新增",
  modified: "修改",
  deleted: "删除",
};

function locationTarget(location: ToolCallLocation): string | null {
  const target = parseLocalFileLink(location.path);
  if (!target) return null;
  return location.line === undefined
    ? target.requestedPath
    : `${target.requestedPath}:${location.line}`;
}

function openLocation(location: ToolCallLocation): void {
  const target = locationTarget(location);
  if (target) void openLocalFilePreview(target);
}

function openFileChange(path: string): void {
  void openTurnFileChangeReview(turnFileChangesSource, path);
}
</script>

<template>
  <div class="max-h-72 space-y-3 overflow-auto" data-test="chat-tool-details">
    <div v-if="input !== null" class="space-y-1" data-test="chat-tool-input">
      <p class="text-xs font-medium text-muted">Input</p>
      <pre class="whitespace-pre-wrap wrap-anywhere text-xs text-default">{{ input }}</pre>
    </div>
    <div v-if="output !== null" class="space-y-1" data-test="chat-tool-output">
      <p class="text-xs font-medium text-muted">Output</p>
      <pre class="whitespace-pre-wrap wrap-anywhere text-xs text-default">{{ output }}</pre>
    </div>
    <div v-if="error !== null" class="space-y-1" data-test="chat-tool-error">
      <p class="text-xs font-medium text-error">Error</p>
      <pre class="whitespace-pre-wrap wrap-anywhere text-xs text-error">{{ error }}</pre>
    </div>
    <div v-if="toolFileChanges.length > 0" class="space-y-2" data-test="chat-tool-changes">
      <p class="text-xs font-medium text-muted">Changes</p>
      <button
        v-for="change in toolFileChanges"
        :key="change.path"
        type="button"
        class="flex w-full items-start justify-between gap-3 rounded-md px-2.5 py-2 text-left ring ring-default transition-colors duration-150 hover:bg-accented focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        data-test="chat-tool-change"
        @click.stop="openFileChange(change.path)"
      >
        <span class="wrap-anywhere min-w-0 font-mono text-xs leading-5 text-default">{{
          change.path
        }}</span>
        <span class="shrink-0 text-xs font-medium text-muted">
          {{ changeKindLabels[change.kind] }}
        </span>
      </button>
    </div>
    <div v-if="locations.length > 0" class="space-y-1" data-test="chat-tool-locations">
      <p class="text-xs font-medium text-muted">Locations</p>
      <ul class="space-y-1">
        <li
          v-for="(location, index) in locations"
          :key="`${location.path}:${location.line}:${index}`"
        >
          <button
            v-if="locationTarget(location)"
            type="button"
            class="block max-w-full cursor-pointer text-left text-xs wrap-anywhere text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            data-test="chat-tool-location-link"
            @click="openLocation(location)"
            @keydown.enter.prevent="openLocation(location)"
            @keydown.space.prevent="openLocation(location)"
          >
            {{ location.path
            }}<template v-if="location.line !== undefined">:{{ location.line }}</template>
          </button>
          <span
            v-else
            class="text-xs wrap-anywhere text-default"
            data-test="chat-tool-location-text"
          >
            {{ location.path
            }}<template v-if="location.line !== undefined">:{{ location.line }}</template>
          </span>
        </li>
      </ul>
    </div>
  </div>
</template>
