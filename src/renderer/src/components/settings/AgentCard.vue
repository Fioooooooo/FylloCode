<script setup lang="ts">
import { computed, ref } from "vue";
import AgentCardBase from "@renderer/components/acp/AgentCardBase.vue";
import { useConfirmDialog } from "@renderer/composables/useConfirmDialog";
import {
  stripPackageVersion,
  type AcpAgentEntry,
  type AcpAgentStatus,
  type AcpInstallMethod,
  type AcpInstallProgress,
  type AcpUninstallProgress,
} from "@shared/types/acp-agent";

const props = defineProps<{
  agent: AcpAgentEntry;
  icon?: string;
  agentStatus?: AcpAgentStatus;
  installProgress?: AcpInstallProgress | AcpUninstallProgress;
  userDataPath?: string;
  isInstalling?: boolean;
  actionDisabled?: boolean;
}>();

const emit = defineEmits<{
  install: [agentId: string];
  uninstall: [agentId: string];
}>();

type AgentMenuItem = {
  label: string;
  icon: string;
  disabled?: boolean;
  tooltip?: string;
  onSelect: () => void;
};

const showUninstallModal = ref(false);
const confirmDialog = useConfirmDialog();

const canUpdate = computed(() => props.agentStatus?.installed && props.agentStatus.updateAvailable);
const isUserManagedUpdate = computed(
  () => canUpdate.value && props.agentStatus?.managedBy === "user"
);
const hasError = computed(() => props.installProgress?.status === "error");
const progressMessage = computed(() => props.installProgress?.message ?? "正在处理...");
const detectedVersion = computed(() => props.agentStatus?.detectedVersion ?? props.agent.version);
const externalUrl = computed(() => props.agent.website ?? props.agent.repository);
const uninstallDisabledReason = computed(() =>
  props.actionDisabled ? "其他 Agent 正在处理中" : undefined
);
const showUninstallMenu = computed(() => props.agentStatus?.installed === true);
const menuItems = computed<AgentMenuItem[]>(() => [
  {
    label: "卸载",
    icon: "i-lucide-trash-2",
    disabled: props.actionDisabled || props.isInstalling,
    tooltip: uninstallDisabledReason.value,
    onSelect: () => {
      if (props.actionDisabled || props.isInstalling) {
        return;
      }
      requestUninstall();
    },
  },
]);
const resolvedInstallMethod = computed<AcpInstallMethod>(() => {
  if (props.agentStatus?.installMethod) {
    return props.agentStatus.installMethod;
  }
  if (props.agent.distribution.npx) {
    return "npx";
  }
  if (props.agent.distribution.uvx) {
    return "uvx";
  }
  return "binary";
});
const uninstallCommandLabel = computed(() =>
  resolvedInstallMethod.value === "binary" ? "将会删除" : "将会执行"
);
const uninstallCommandText = computed(() => {
  if (resolvedInstallMethod.value === "npx") {
    const pkg = props.agent.distribution.npx?.package ?? props.agent.id;
    return `npm uninstall -g ${stripPackageVersion(pkg)}`;
  }
  if (resolvedInstallMethod.value === "uvx") {
    const pkg = props.agent.distribution.uvx?.package ?? props.agent.id;
    return `uv tool uninstall ${stripPackageVersion(pkg)}`;
  }

  return `${props.userDataPath ?? ""}/acp/bin/${props.agent.id}`;
});
const uninstallLeadText = computed(() =>
  props.agentStatus?.managedBy === "user"
    ? "该 Agent 由你自行安装，是否同意 FylloCode 代为卸载？"
    : "该 Agent 由 FylloCode 安装，确定卸载吗？"
);
const uninstallFootnote = computed(() => {
  if (props.agentStatus?.managedBy !== "user") {
    return "卸载完成后将清除本地安装记录。";
  }

  return resolvedInstallMethod.value === "binary"
    ? "此操作不可撤销。"
    : "此操作会修改你的全局环境，不可撤销。";
});
const uninstallButtonLabel = computed(() =>
  props.agentStatus?.managedBy === "user" ? "同意并卸载" : "卸载"
);
const uninstallButtonColor = computed(() =>
  props.agentStatus?.managedBy === "user" ? "warning" : "error"
);

async function requestInstall(): Promise<void> {
  if (isUserManagedUpdate.value) {
    const confirmed = await confirmDialog({
      title: "接管此 Agent 的更新？",
      description: "继续后，FylloCode 将接管这个用户自行安装的 Agent，并负责后续更新管理。",
      confirmLabel: "确认更新",
      confirmColor: "warning",
    });

    if (!confirmed) {
      return;
    }

    emit("install", props.agent.id);
    return;
  }

  emit("install", props.agent.id);
}

function requestUninstall(): void {
  showUninstallModal.value = true;
}

function confirmUninstall(): void {
  showUninstallModal.value = false;
  emit("uninstall", props.agent.id);
}
</script>

<template>
  <AgentCardBase :agent="agent" :icon="icon">
    <template #meta>
      <template v-if="externalUrl">
        <span class="text-muted/40">·</span>
        <UButton
          data-test="agent-card-external-link"
          as="a"
          :href="externalUrl"
          target="_blank"
          rel="noreferrer"
          color="neutral"
          variant="ghost"
          size="xs"
          icon="i-lucide-external-link"
          :title="`打开 ${agent.name} 主页`"
          @click.stop
        />
      </template>
    </template>

    <template #actions>
      <div class="flex flex-col items-center justify-center gap-1">
        <div v-if="isInstalling" class="flex items-center gap-2 text-xs text-muted">
          <UIcon name="i-lucide-loader-circle" class="h-4 w-4 animate-spin" />
          <span class="max-w-24 truncate" :title="progressMessage">{{ progressMessage }}</span>
        </div>

        <div v-else-if="hasError" class="flex items-center gap-2 text-xs text-error">
          <UIcon name="i-lucide-circle-x" class="h-4 w-4 shrink-0" />
          <span class="max-w-24 truncate" :title="progressMessage">{{ progressMessage }}</span>
          <UButton
            size="xs"
            variant="ghost"
            color="error"
            :title="'重试'"
            @click="void requestInstall()"
          >
            <UIcon name="i-lucide-rotate-ccw" class="h-3 w-3" />
          </UButton>
        </div>

        <template v-else-if="canUpdate">
          <UButton
            size="xs"
            color="primary"
            :disabled="actionDisabled"
            :title="uninstallDisabledReason"
            @click="void requestInstall()"
          >
            <UIcon name="i-lucide-refresh-cw" class="mr-1 h-3 w-3" />
            更新
          </UButton>
          <span class="text-xs text-muted">v{{ detectedVersion }}</span>
        </template>

        <UButton
          v-else-if="!agentStatus?.installed"
          size="xs"
          variant="outline"
          color="neutral"
          :disabled="actionDisabled"
          :title="uninstallDisabledReason"
          class="shrink-0"
          @click="void requestInstall()"
        >
          <UIcon name="i-lucide-download" class="mr-1 h-3 w-3" />
          安装
        </UButton>
      </div>

      <div v-if="showUninstallMenu" @click.stop>
        <UDropdownMenu :items="menuItems">
          <UButton
            data-test="agent-card-uninstall-menu"
            variant="ghost"
            color="neutral"
            size="xs"
            :disabled="isInstalling"
            aria-label="打开 Agent 操作菜单"
            @click.stop
          >
            <UIcon name="i-lucide-ellipsis" class="h-4 w-4" />
          </UButton>
        </UDropdownMenu>
      </div>
    </template>

    <template v-if="agentStatus?.installed && !canUpdate" #corner>
      <UIcon
        name="i-lucide-circle-check"
        class="h-4 w-4 text-success"
        :title="`已安装 · v${detectedVersion}`"
      />
    </template>
  </AgentCardBase>

  <UModal
    v-model:open="showUninstallModal"
    :title="`卸载 ${agent.name}？`"
    :description="uninstallLeadText"
  >
    <template #body>
      <div class="flex items-start gap-3">
        <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warning/10">
          <UIcon name="i-lucide-triangle-alert" class="w-5 h-5 text-warning" />
        </div>
        <div class="min-w-0 flex-1 space-y-3">
          <p class="text-sm text-muted">{{ uninstallCommandLabel }}</p>
          <div
            class="flex flex-col justify-start space-y-1.5 rounded-md bg-muted px-4 py-2 text-sm"
          >
            <code class="font-mono break-all whitespace-pre-wrap leading-relaxed">
              {{ uninstallCommandText }}
            </code>
          </div>
          <p class="text-sm text-muted">{{ uninstallFootnote }}</p>
        </div>
      </div>
    </template>

    <template #footer>
      <UButton variant="ghost" color="neutral" @click="showUninstallModal = false">取消</UButton>
      <UButton :color="uninstallButtonColor" @click="confirmUninstall">
        {{ uninstallButtonLabel }}
      </UButton>
    </template>
  </UModal>
</template>
