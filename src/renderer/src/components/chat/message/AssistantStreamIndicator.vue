<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";

const props = defineProps<{
  startedAt: number;
}>();

const GRID_SIZE = 4;
const DOT_GAP = 2;
const TOTAL_DOTS = GRID_SIZE * GRID_SIZE;
const DOT_PATTERNS = [
  [0, 1, 2, 3, 7, 11, 15, 14, 13, 12, 8, 4, 5, 6, 10, 9],
  [0, 4, 8, 12],
  [1, 5, 9, 13],
  [2, 6, 10, 14],
  [3, 7, 11, 15],
  [5, 6, 9, 10],
  [1, 4, 7, 8, 11, 14],
  [0, 3, 12, 15],
  [1, 4, 7, 8, 11, 14],
  [5, 6, 9, 10],
  [0],
  [1, 4],
  [2, 5, 8],
  [3, 6, 9, 12],
  [7, 10, 13],
  [11, 14],
  [15],
];
const STATUS_MESSAGES = [
  "正在思考…",
  "正在分析…",
  "正在梳理上下文…",
  "正在聚焦问题…",
  "正在建立关联…",
  "正在推演方案…",
  "正在斟酌细节…",
  "正在整理信息…",
  "正在组织回复…",
  "正在继续处理…",
];
const SCRAMBLE_CHARACTERS = "abcdefghijklmnopqrstuvwxyz";

const activeDots = ref<Set<number>>(new Set());
const displayedText = ref(STATUS_MESSAGES[0]);
const elapsedSeconds = ref(0);
let patternIndex = 0;
let statusIndex = 0;
let dotInterval: ReturnType<typeof setInterval> | null = null;
let statusInterval: ReturnType<typeof setInterval> | null = null;
let elapsedInterval: ReturnType<typeof setInterval> | null = null;
let scrambleFrame: number | null = null;

const elapsedLabel = computed(() => {
  return `工作中 · ${formatElapsed(elapsedSeconds.value)}`;
});

function formatElapsed(totalSeconds: number): string {
  if (totalSeconds < 60) {
    return `${totalSeconds} 秒`;
  }

  if (totalSeconds < 60 * 60) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes} 分 ${seconds.toString().padStart(2, "0")} 秒`;
  }

  if (totalSeconds < 24 * 60 * 60) {
    const hours = Math.floor(totalSeconds / (60 * 60));
    const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
    return minutes === 0 ? `${hours} 小时` : `${hours} 小时 ${minutes} 分`;
  }

  const days = Math.floor(totalSeconds / (24 * 60 * 60));
  const hours = Math.floor((totalSeconds % (24 * 60 * 60)) / (60 * 60));
  return hours === 0 ? `${days} 天` : `${days} 天 ${hours} 小时`;
}

function updateDots(): void {
  activeDots.value = new Set(DOT_PATTERNS[patternIndex]);
  patternIndex = (patternIndex + 1) % DOT_PATTERNS.length;
}

function updateElapsed(): void {
  elapsedSeconds.value = Math.max(0, Math.floor((Date.now() - props.startedAt) / 1000));
}

function cancelScramble(): void {
  if (scrambleFrame === null) {
    return;
  }

  cancelAnimationFrame(scrambleFrame);
  scrambleFrame = null;
}

function scrambleTo(nextText: string): void {
  cancelScramble();

  const previousText = displayedText.value;
  const maxLength = Math.max(previousText.length, nextText.length);
  const totalFrames = 15;
  let frame = 0;

  const step = (): void => {
    frame += 1;
    const progress = (frame / totalFrames) * maxLength;
    let result = "";

    for (let index = 0; index < maxLength; index += 1) {
      if (index < progress - 2) {
        result += nextText[index] ?? "";
      } else if (index < progress) {
        result += SCRAMBLE_CHARACTERS[Math.floor(Math.random() * SCRAMBLE_CHARACTERS.length)];
      } else {
        result += previousText[index] ?? "";
      }
    }

    displayedText.value = result;
    if (frame < totalFrames) {
      scrambleFrame = requestAnimationFrame(step);
      return;
    }

    displayedText.value = nextText;
    scrambleFrame = null;
  };

  scrambleFrame = requestAnimationFrame(step);
}

function advanceStatus(): void {
  statusIndex = (statusIndex + 1) % STATUS_MESSAGES.length;
  scrambleTo(STATUS_MESSAGES[statusIndex]!);
}

onMounted(() => {
  updateDots();
  updateElapsed();
  dotInterval = setInterval(updateDots, 120);
  statusInterval = setInterval(advanceStatus, 3000);
  elapsedInterval = setInterval(updateElapsed, 1000);
});

onUnmounted(() => {
  if (dotInterval !== null) clearInterval(dotInterval);
  if (statusInterval !== null) clearInterval(statusInterval);
  if (elapsedInterval !== null) clearInterval(elapsedInterval);
  cancelScramble();
});
</script>

<template>
  <div
    data-test="assistant-stream-indicator"
    class="mt-4 flex w-fit items-center gap-2 overflow-hidden rounded-md border border-default/50 bg-elevated px-2 py-1.5 text-muted"
  >
    <div
      class="grid size-4 shrink-0 text-primary"
      :style="{
        gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))`,
        gap: `${DOT_GAP}px`,
      }"
      aria-hidden="true"
    >
      <span
        v-for="dot in TOTAL_DOTS"
        :key="dot"
        data-test="assistant-stream-indicator-dot"
        :data-active="String(activeDots.has(dot - 1))"
        class="rounded-sm bg-current transition-opacity duration-100"
        :class="activeDots.has(dot - 1) ? 'opacity-100' : 'opacity-20'"
      />
    </div>

    <UChatShimmer :text="displayedText" class="text-xs font-medium" />
    <span
      data-test="assistant-stream-elapsed"
      class="shrink-0 border-l border-default/50 pl-2 text-xs tabular-nums"
    >
      {{ elapsedLabel }}
    </span>
  </div>
</template>
