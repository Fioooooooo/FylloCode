<script setup lang="ts">
import { ref, computed, reactive } from "vue";
import type { IntegrationTool } from "@shared/types/integration";
import { useIntegrationStore } from "@renderer/stores/integration";

const props = defineProps<{
  tool: IntegrationTool;
}>();

const integrationStore = useIntegrationStore();

const isConnected = computed(() => integrationStore.isToolConnected(props.tool.id));
const connection = computed(() => integrationStore.getConnection(props.tool.id));
const isTesting = computed(() => integrationStore.testingConnectionId === props.tool.id);

const connectionForm = reactive<Record<string, string>>({});
const testSuccess = ref(false);
const errorMessage = ref("");

function initConnectionForm(): void {
  for (const field of props.tool.connectionFields) {
    connectionForm[field.key] = connection.value?.credentialPreview?.[field.key] ?? "";
  }
}

initConnectionForm();

async function handleTestConnection(): Promise<void> {
  testSuccess.value = false;
  errorMessage.value = "";
  const success = await integrationStore.testConnection(props.tool.id, { ...connectionForm });
  testSuccess.value = success;
}

async function handleConnect(): Promise<void> {
  testSuccess.value = false;
  errorMessage.value = "";
  const result = await integrationStore.connectTool(props.tool.id, { ...connectionForm });
  if (result.ok) {
    testSuccess.value = true;
  } else if (result.error) {
    errorMessage.value = result.error;
  }
}

async function handleOAuthConnect(): Promise<void> {
  await integrationStore.simulateOAuthConnect(props.tool.id);
}

function handleDisconnect(): void {
  integrationStore.disconnectTool(props.tool.id);
}
</script>

<template>
  <div class="p-4 space-y-5">
    <!-- Account Connection -->
    <div class="space-y-3">
      <h4 class="text-sm font-semibold text-highlighted flex items-center gap-2">
        <UIcon name="i-lucide-link" class="w-4 h-4 text-primary" />
        账号连接
      </h4>

      <!-- API Token Form -->
      <div v-if="tool.connectionType === 'api-token' && !isConnected" class="space-y-3">
        <div v-for="field in tool.connectionFields" :key="field.key" class="space-y-1.5">
          <div class="flex items-center justify-between">
            <label class="text-sm font-medium text-highlighted">
              {{ field.label }}
              <span v-if="field.required" class="text-error">*</span>
            </label>
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
            v-if="field.type !== 'password'"
            v-model="connectionForm[field.key]"
            :placeholder="field.placeholder"
            size="sm"
            class="w-full"
          />
          <UInput
            v-else
            v-model="connectionForm[field.key]"
            :placeholder="field.placeholder"
            type="password"
            size="sm"
            class="w-full"
          />
          <p v-if="field.helperText" class="text-xs text-muted">{{ field.helperText }}</p>
        </div>

        <div class="flex items-center gap-2">
          <UButton
            size="sm"
            variant="soft"
            color="neutral"
            :loading="isTesting"
            @click="handleTestConnection"
          >
            <UIcon name="i-lucide-flask-conical" class="w-4 h-4" />
            测试连接
          </UButton>
          <UButton size="sm" :loading="isTesting" @click="handleConnect">
            <UIcon name="i-lucide-plug" class="w-4 h-4" />
            连接
          </UButton>
          <UBadge
            v-if="testSuccess"
            size="xs"
            variant="soft"
            color="success"
            class="flex items-center gap-1"
          >
            <UIcon name="i-lucide-check" class="w-3 h-3" />
            成功
          </UBadge>
        </div>
        <p v-if="errorMessage" class="text-xs text-error">{{ errorMessage }}</p>
      </div>

      <!-- OAuth Button -->
      <div v-if="tool.connectionType === 'oauth' && !isConnected" class="space-y-3">
        <UButton size="sm" :loading="isTesting" @click="handleOAuthConnect">
          <UIcon name="i-lucide-external-link" class="w-4 h-4" />
          使用 {{ tool.name }} 连接
        </UButton>
      </div>

      <!-- Connected State -->
      <div v-if="isConnected" class="space-y-3">
        <div
          class="flex items-center justify-between p-3 bg-success/10 border border-success/20 rounded-md"
        >
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-check-circle" class="w-4 h-4 text-success" />
            <span class="text-sm text-highlighted">
              已连接为 <span class="font-medium">{{ connection?.accountName }}</span>
            </span>
          </div>
          <UButton size="xs" variant="ghost" color="error" @click="handleDisconnect">
            <UIcon name="i-lucide-unlink" class="w-3.5 h-3.5" />
            断开连接
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>
