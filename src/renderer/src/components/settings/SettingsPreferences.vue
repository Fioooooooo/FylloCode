<script setup lang="ts">
import { computed, watch } from "vue";
import { useColorMode } from "@vueuse/core";
import { useConfirmDialog } from "@renderer/composables/useConfirmDialog";
import { useSettingsStore } from "@renderer/stores/settings";
import type {
  ThemeMode,
  AgentMode,
  NotificationMethod,
  TokenStatsPeriod,
  BudgetUnit,
} from "@shared/types/settings";

const store = useSettingsStore();
const colorMode = useColorMode();
const confirmDialog = useConfirmDialog();

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

const languageOptions = [
  { label: "English", value: "en" },
  { label: "中文", value: "zh" },
];

const agentModeOptions = [
  { label: "自动", value: "auto" as AgentMode },
  { label: "手动", value: "manual" as AgentMode },
];

const notificationOptions: { label: string; value: NotificationMethod }[] = [
  { label: "系统通知", value: "system" },
  { label: "声音提示", value: "sound" },
  { label: "仅应用内标记", value: "in-app" },
];

const periodOptions: { label: string; value: TokenStatsPeriod }[] = [
  { label: "每日", value: "daily" },
  { label: "每周", value: "weekly" },
  { label: "每月", value: "monthly" },
];

const budgetUnitOptions: { label: string; value: BudgetUnit }[] = [
  { label: "Tokens", value: "tokens" },
  { label: "USD", value: "usd" },
];

function isNotificationSelected(val: NotificationMethod): boolean {
  return store.preferences.notificationMethods.includes(val);
}

function toggleNotification(val: NotificationMethod): void {
  const current = store.preferences.notificationMethods;
  const updated = current.includes(val) ? current.filter((v) => v !== val) : [...current, val];
  store.updatePreference("notificationMethods", updated);
}

async function handleClearHistory(): Promise<void> {
  const confirmed = await confirmDialog({
    title: "清除所有历史？",
    description: "这将永久删除所有会话历史、Token 用量统计及相关数据，此操作不可撤销。",
    confirmLabel: "清除所有历史",
    confirmColor: "error",
  });

  if (!confirmed) {
    return;
  }

  await store.clearAllHistory();
}
</script>

<template>
  <div>
    <h2 class="text-lg font-semibold text-highlighted mb-6">偏好设置</h2>

    <section class="mb-8">
      <h3 class="text-xs font-semibold text-muted uppercase tracking-wider mb-3">外观</h3>
      <UCard>
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
                @click="themeMode = opt.value"
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
      </UCard>
    </section>

    <section class="mb-8">
      <h3 class="text-xs font-semibold text-muted uppercase tracking-wider mb-3">行为</h3>
      <UCard>
        <div class="divide-y divide-default">
          <div class="flex items-center justify-between py-4 px-4">
            <div>
              <p class="text-sm font-medium text-highlighted">默认 Agent 模式</p>
              <p class="text-xs text-muted">新会话的默认模式，可在单个会话中覆盖。</p>
            </div>
            <div class="flex gap-1 bg-muted/40 rounded-lg p-1">
              <UButton
                v-for="opt in agentModeOptions"
                :key="opt.value"
                size="xs"
                :variant="store.preferences.defaultAgentMode === opt.value ? 'solid' : 'ghost'"
                :color="store.preferences.defaultAgentMode === opt.value ? 'primary' : 'neutral'"
                @click="store.updatePreference('defaultAgentMode', opt.value)"
                >{{ opt.label }}
              </UButton>
            </div>
          </div>

          <div class="py-4 px-4">
            <p class="text-sm font-medium text-highlighted mb-1">通知方式</p>
            <p class="text-xs text-muted mb-3">
              当任务完成、失败或 Agent 需要确认时，以何种方式通知。
            </p>
            <div class="flex flex-wrap gap-2">
              <UButton
                v-for="opt in notificationOptions"
                :key="opt.value"
                size="xs"
                :variant="isNotificationSelected(opt.value) ? 'solid' : 'outline'"
                :color="isNotificationSelected(opt.value) ? 'primary' : 'neutral'"
                @click="toggleNotification(opt.value)"
                >{{ opt.label }}
              </UButton>
            </div>
          </div>

          <div class="flex items-center justify-between py-4 px-4">
            <div>
              <p class="text-sm font-medium text-highlighted">自动保存会话</p>
              <p class="text-xs text-muted">关闭时，会话将在关闭后被丢弃，不会出现在历史记录中。</p>
            </div>
            <USwitch
              :model-value="store.preferences.autoSaveSession"
              color="primary"
              @update:model-value="store.updatePreference('autoSaveSession', $event)"
            />
          </div>
        </div>
      </UCard>
    </section>

    <section class="mb-8">
      <h3 class="text-xs font-semibold text-muted uppercase tracking-wider mb-3">数据</h3>
      <UCard>
        <div class="divide-y divide-default">
          <div class="flex items-center justify-between py-4 px-4">
            <div>
              <p class="text-sm font-medium text-highlighted">Token 统计周期</p>
              <p class="text-xs text-muted">用量统计的重置间隔。</p>
            </div>
            <div class="flex gap-1 bg-muted/40 rounded-lg p-1">
              <UButton
                v-for="opt in periodOptions"
                :key="opt.value"
                size="xs"
                :variant="store.preferences.tokenStatsPeriod === opt.value ? 'solid' : 'ghost'"
                :color="store.preferences.tokenStatsPeriod === opt.value ? 'primary' : 'neutral'"
                @click="store.updatePreference('tokenStatsPeriod', opt.value)"
                >{{ opt.label }}
              </UButton>
            </div>
          </div>

          <div class="flex items-center justify-between py-4 px-4">
            <div>
              <p class="text-sm font-medium text-highlighted">预算预警</p>
              <p class="text-xs text-muted">当用量超过此阈值时显示警告。</p>
            </div>
            <div class="flex items-center gap-2">
              <UInput
                :model-value="store.preferences.budgetAlert.value"
                type="number"
                size="sm"
                class="w-28"
                @update:model-value="
                  store.updatePreference('budgetAlert', {
                    ...store.preferences.budgetAlert,
                    value: Number($event),
                  })
                "
              />
              <USelect
                :model-value="store.preferences.budgetAlert.unit"
                :items="budgetUnitOptions"
                value-key="value"
                label-key="label"
                size="sm"
                class="w-24"
                @update:model-value="
                  store.updatePreference('budgetAlert', {
                    ...store.preferences.budgetAlert,
                    unit: $event,
                  })
                "
              />
            </div>
          </div>

          <div class="flex items-center justify-between py-4 px-4">
            <div>
              <p class="text-sm font-medium text-highlighted">清除所有历史</p>
              <p class="text-xs text-muted">永久删除所有会话历史和用量数据。</p>
            </div>
            <UButton variant="outline" color="error" size="sm" @click="void handleClearHistory()">
              <UIcon name="i-lucide-trash-2" class="w-4 h-4 mr-1.5" />
              清除历史
            </UButton>
          </div>
        </div>
      </UCard>
    </section>
  </div>
</template>
