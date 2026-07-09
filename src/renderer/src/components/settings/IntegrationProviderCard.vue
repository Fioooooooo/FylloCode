<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import type { Provider, ProviderConnection, ProviderCredentials } from "@shared/types/integration";
import { useIntegrationProvidersStore } from "@renderer/stores";

const props = defineProps<{
  provider: Provider & { connection: ProviderConnection | null };
  autofocus?: boolean;
}>();

const integrationProvidersStore = useIntegrationProvidersStore();

const expanded = ref(Boolean(props.autofocus));
const errorMessage = ref("");
const form = reactive<ProviderCredentials>({});

for (const field of props.provider.credentialFields) {
  form[field.key] = "";
}

const capabilitySummary = computed(() =>
  props.provider.capabilities.map((capability) => capability.label).join(" · ")
);

const status = computed(() => props.provider.connection?.state ?? "not-connected");
const isBusy = computed(() => integrationProvidersStore.isProviderBusy(props.provider.id));
const isConnected = computed(() => status.value === "connected");
const isExpired = computed(() => status.value === "expired");
const isComingSoon = computed(() => props.provider.comingSoon);

function toggleExpanded(): void {
  expanded.value = !expanded.value;
}

async function handleConnect(): Promise<void> {
  errorMessage.value = "";
  const result = await integrationProvidersStore.connectProvider(props.provider.id, { ...form });
  if (!result.ok) {
    errorMessage.value = result.error ?? "连接失败";
  }
}

async function handleProbe(): Promise<void> {
  errorMessage.value = "";
  try {
    await integrationProvidersStore.probeProvider(props.provider.id);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "连接测试失败";
  }
}

async function handleDisconnect(): Promise<void> {
  errorMessage.value = "";
  await integrationProvidersStore.disconnectProvider(props.provider.id);
}
</script>

<template>
  <section
    :id="`provider-${provider.id}`"
    class="rounded-xl bg-elevated transition-colors"
    :class="autofocus ? 'ring-2 ring-primary/30 border-primary/50' : ''"
  >
    <button
      type="button"
      class="flex w-full items-start justify-between gap-4 px-4 py-4 text-left"
      @click="toggleExpanded"
    >
      <div class="flex min-w-0 items-start gap-3">
        <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <UIcon :name="provider.logoIcon" class="h-5 w-5" :class="provider.logoColor" />
        </div>
        <div class="min-w-0 space-y-1">
          <div class="flex items-center gap-2">
            <h3 class="text-sm font-semibold text-highlighted">{{ provider.name }}</h3>
            <UBadge v-if="isComingSoon" color="neutral" variant="soft" size="xs">即将推出</UBadge>
          </div>
          <p class="text-sm text-muted">{{ provider.description }}</p>
          <p class="text-xs text-toned">{{ capabilitySummary }}</p>
        </div>
      </div>

      <UBadge v-if="isConnected" color="success" variant="soft" size="xs"> 已连接 </UBadge>
      <UBadge v-else-if="isExpired" color="warning" variant="soft" size="xs"> 凭证已过期 </UBadge>
      <UBadge v-else color="neutral" variant="soft" size="xs">
        {{ isComingSoon ? "暂未开放" : "未连接" }}
      </UBadge>
    </button>

    <div v-if="expanded" class="border-t border-default px-4 py-4">
      <AppEmptyState
        v-if="isComingSoon"
        icon="i-lucide-clock"
        title="暂未开放"
        description="当前 provider 仅保留占位信息，暂未开放真实连接能力。"
        compact
      />

      <div v-else-if="!isConnected && !isExpired" class="space-y-4">
        <div v-for="field in provider.credentialFields" :key="field.key" class="space-y-1.5">
          <div class="flex items-center justify-between gap-2">
            <label class="text-sm font-medium text-highlighted">{{ field.label }}</label>
            <a
              v-if="field.helpLink"
              :href="field.helpLink"
              target="_blank"
              class="text-xs text-primary hover:underline"
              @click.stop
            >
              如何获取
            </a>
          </div>
          <UInput
            v-model="form[field.key]"
            :type="field.type === 'password' ? 'password' : 'text'"
            :placeholder="field.placeholder"
          />
          <p v-if="field.helperText" class="text-xs text-muted">{{ field.helperText }}</p>
        </div>

        <div class="flex items-center gap-2">
          <UButton size="sm" variant="soft" color="neutral" :loading="isBusy" @click="handleProbe">
            测试连接
          </UButton>
          <UButton size="sm" :loading="isBusy" @click="handleConnect"> 连接 </UButton>
        </div>
      </div>

      <div v-else class="space-y-4">
        <div class="rounded-lg border border-default bg-muted/30 px-4 py-3 text-sm text-muted">
          <p v-if="provider.connection?.accountName">
            已识别账户：<span class="font-medium text-highlighted">{{
              provider.connection.accountName
            }}</span>
          </p>
          <p v-if="provider.connection?.credentialPreview">
            凭证回显：{{ Object.values(provider.connection.credentialPreview).join(" / ") }}
          </p>
        </div>

        <div class="flex items-center gap-2">
          <UButton
            v-if="isExpired"
            size="sm"
            variant="soft"
            color="warning"
            :loading="isBusy"
            @click="handleProbe"
          >
            重新检测
          </UButton>
          <UButton
            size="sm"
            variant="soft"
            color="error"
            :loading="isBusy"
            @click="handleDisconnect"
          >
            断开连接
          </UButton>
        </div>
      </div>

      <p v-if="errorMessage" class="mt-3 text-xs text-error">{{ errorMessage }}</p>
    </div>
  </section>
</template>
