<script setup lang="ts">
import { computed, watch } from "vue";
import { useColorMode } from "@vueuse/core";
import { useSettingsStore } from "@renderer/stores";
import type { ThemeMode } from "@shared/types/settings";

const store = useSettingsStore();
const colorMode = useColorMode();

const themeMode = computed({
  get: () => store.preferences.theme,
  set: (val: ThemeMode) => {
    store.updatePreference("theme", val);
    colorMode.value = val === "system" ? "auto" : val;
  },
});

watch(
  () => colorMode.value,
  (val) => {
    const mapped: ThemeMode = val === "auto" ? "system" : (val as ThemeMode);
    if (store.preferences.theme !== mapped) {
      store.updatePreference("theme", mapped);
    }
  }
);

const themeOptions = [
  { label: "浅色", value: "light" as ThemeMode },
  { label: "深色", value: "dark" as ThemeMode },
  { label: "跟随系统", value: "system" as ThemeMode },
];

const languageOptions = [{ label: "中文", value: "zh" }];

function setThemeMode(mode: ThemeMode): void {
  themeMode.value = mode;
}
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-1">
      <h1 class="text-xl font-semibold tracking-tight text-highlighted">偏好设置</h1>
      <p class="text-sm text-muted">使用FylloCode时的个性化设置。</p>
    </div>

    <section class="mb-8">
      <h3 class="text-xs font-semibold text-muted uppercase tracking-wider mb-3">外观</h3>
      <UiSurface padding="none">
        <div class="divide-y divide-default">
          <div class="flex items-center justify-between py-4 px-4">
            <div>
              <p class="text-sm font-medium text-highlighted">主题</p>
              <p class="text-xs text-muted">选择浅色、深色，或跟随系统设置。</p>
            </div>
            <div class="flex gap-1 bg-muted/40 rounded-lg p-1">
              <UButton
                v-for="opt in themeOptions"
                :key="opt.value"
                size="xs"
                :variant="themeMode === opt.value ? 'solid' : 'ghost'"
                :color="themeMode === opt.value ? 'primary' : 'neutral'"
                @click="setThemeMode(opt.value)"
                >{{ opt.label }}
              </UButton>
            </div>
          </div>

          <div class="flex items-center justify-between py-4 px-4">
            <div>
              <p class="text-sm font-medium text-highlighted">语言</p>
              <p class="text-xs text-muted">界面显示语言。</p>
            </div>
            <USelect
              :model-value="store.preferences.language"
              :items="languageOptions"
              value-key="value"
              label-key="label"
              size="sm"
              class="w-32"
              @update:model-value="store.updatePreference('language', $event)"
            />
          </div>
        </div>
      </UiSurface>
    </section>
  </div>
</template>
