<script setup lang="ts">
import type { ToolCallDiff, ToolCallLocation } from "@shared/types/stream-event";
import { parseLocalFileLink, useLocalFilePreview } from "@renderer/features/local-file-preview";

withDefaults(
  defineProps<{
    input: string | null;
    output: string | null;
    error?: string | null;
    diffs?: ToolCallDiff[];
    locations?: ToolCallLocation[];
  }>(),
  {
    error: null,
    diffs: () => [],
    locations: () => [],
  }
);

const { openLocalFilePreview } = useLocalFilePreview();

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
    <div v-if="diffs.length > 0" class="space-y-2" data-test="chat-tool-changes">
      <p class="text-xs font-medium text-muted">Changes</p>
      <article
        v-for="(diff, index) in diffs"
        :key="`${diff.path}:${index}`"
        class="space-y-2 rounded-md ring ring-default"
        data-test="chat-tool-diff"
      >
        <p class="px-2 pt-2 text-xs font-medium wrap-anywhere text-default">{{ diff.path }}</p>
        <div v-if="diff.oldText !== undefined" class="space-y-2 px-2 pb-2">
          <div class="space-y-1">
            <p class="text-xs text-muted">修改前</p>
            <pre class="max-h-40 overflow-auto whitespace-pre text-xs text-default">{{
              diff.oldText
            }}</pre>
          </div>
          <div class="space-y-1">
            <p class="text-xs text-muted">修改后</p>
            <pre class="max-h-40 overflow-auto whitespace-pre text-xs text-default">{{
              diff.newText
            }}</pre>
          </div>
        </div>
        <div v-else class="space-y-1 px-2 pb-2">
          <p class="text-xs text-muted">新增内容</p>
          <pre class="max-h-40 overflow-auto whitespace-pre text-xs text-default">{{
            diff.newText
          }}</pre>
        </div>
      </article>
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
