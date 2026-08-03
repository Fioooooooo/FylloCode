<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useWorkspaceStore } from "@renderer/stores";
import { presentWorkspaceError, workspaceKindLabel } from "@renderer/utils/workspace-presentation";
import type { WorkspaceFolderInfo, WorkspaceLauncherItem } from "@shared/types/workspace";

const props = defineProps<{
  open: boolean;
  mode: "create" | "edit";
  workspace?: WorkspaceLauncherItem | null;
}>();
const emit = defineEmits<{ "update:open": [value: boolean]; saved: [] }>();
const workspaceStore = useWorkspaceStore();
const name = ref("");
const folders = ref<WorkspaceFolderInfo[]>([]);
const primaryFolderId = ref("");
const errorMessage = ref("");
const errorDetails = ref<unknown>(null);
const errorCode = ref("");
const pendingRelocationFolderId = ref("");
const isSaving = ref(false);

const isEditing = computed(() => props.mode === "edit" && Boolean(props.workspace));
const isFolderEditing = computed(
  () => isEditing.value && props.workspace?.workspaceKind === "folder"
);
const subjectLabel = computed(() =>
  props.workspace ? workspaceKindLabel(props.workspace.workspaceKind) : "Workspace"
);
const modalTitle = computed(() =>
  isEditing.value ? `编辑 ${subjectLabel.value}` : "创建 Workspace"
);
const modalDescription = computed(() =>
  isFolderEditing.value
    ? "Project 可以改名或重新定位项目目录；如需组合多个 Project，请创建 Workspace。"
    : "Workspace 始终保持独立身份，可包含 1–16 个 Project。"
);
const canSave = computed(
  () => Boolean(name.value.trim()) && folders.value.length > 0 && Boolean(primaryFolderId.value)
);
const conflictWorkspaces = computed(() => {
  if (!errorDetails.value || typeof errorDetails.value !== "object") return [];
  const report = (errorDetails.value as { report?: unknown }).report;
  if (!report || typeof report !== "object") return [];
  const conflicts = (report as { workspaceConflicts?: unknown }).workspaceConflicts;
  if (!Array.isArray(conflicts)) return [];
  const byId = new Map<string, string>();
  for (const conflict of conflicts) {
    if (!conflict || typeof conflict !== "object") continue;
    const { workspaceId, workspaceName } = conflict as {
      workspaceId?: unknown;
      workspaceName?: unknown;
    };
    if (typeof workspaceId === "string" && typeof workspaceName === "string") {
      byId.set(workspaceId, workspaceName);
    }
  }
  return [...byId].map(([workspaceId, workspaceName]) => ({ workspaceId, workspaceName }));
});

watch(
  () => [props.open, props.workspace] as const,
  ([open, workspace]) => {
    if (!open) return;
    name.value = workspace?.workspaceName ?? "";
    folders.value = workspace?.folders.map((folder) => ({ ...folder })) ?? [];
    primaryFolderId.value = workspace?.primaryFolderId ?? folders.value[0]?.folderId ?? "";
    errorMessage.value = "";
    errorDetails.value = null;
    errorCode.value = "";
    pendingRelocationFolderId.value = "";
  },
  { immediate: true }
);

async function addFolder(): Promise<void> {
  const folder = await workspaceStore.selectFolder();
  if (!folder || folders.value.some((item) => item.folderId === folder.id)) return;
  folders.value.push({
    folderId: folder.id,
    folderName: folder.name,
    folderPath: folder.path,
    pathMissing: false,
    isPrimary: folders.value.length === 0,
  });
  if (!primaryFolderId.value) primaryFolderId.value = folder.id;
}

function removeFolder(folderId: string): void {
  folders.value = folders.value.filter((folder) => folder.folderId !== folderId);
  if (primaryFolderId.value === folderId) primaryFolderId.value = folders.value[0]?.folderId ?? "";
}

function moveFolder(index: number, offset: number): void {
  const target = index + offset;
  if (target < 0 || target >= folders.value.length) return;
  const next = [...folders.value];
  const [folder] = next.splice(index, 1);
  if (!folder) return;
  next.splice(target, 0, folder);
  folders.value = next;
}

async function relocateFolder(folderId: string, confirmHistoricalSessions = false): Promise<void> {
  try {
    await workspaceStore.relocateFolder(folderId, confirmHistoricalSessions);
    errorCode.value = "";
    errorMessage.value = "";
    errorDetails.value = null;
    pendingRelocationFolderId.value = "";
    const updated = await workspaceStore.getWorkspace?.(props.workspace?.workspaceId ?? "");
    if (updated) folders.value = updated.folders;
  } catch (error) {
    const issue = error as Error & { code?: string; details?: unknown };
    errorCode.value = issue.code ?? "";
    errorMessage.value = presentWorkspaceError(
      issue,
      props.workspace?.workspaceKind ?? "collection"
    );
    errorDetails.value = issue.details;
    pendingRelocationFolderId.value = folderId;
  }
}

async function openConflictWorkspace(workspaceId: string): Promise<void> {
  await workspaceStore.openWorkspaceWindow(workspaceId);
}

async function save(confirmHistoricalSessions = false): Promise<void> {
  if (!canSave.value) return;
  isSaving.value = true;
  errorMessage.value = "";
  errorCode.value = "";
  try {
    if (isEditing.value && props.workspace) {
      await workspaceStore.updateDefinition({
        workspaceId: props.workspace.workspaceId,
        name: name.value.trim(),
        folderIds: folders.value.map((folder) => folder.folderId),
        primaryFolderId: primaryFolderId.value,
        confirmHistoricalSessions,
      });
    } else {
      await workspaceStore.createCollection({
        name: name.value.trim(),
        folderIds: folders.value.map((folder) => folder.folderId),
        primaryFolderId: primaryFolderId.value,
      });
    }
    emit("saved");
    emit("update:open", false);
  } catch (error) {
    const issue = error as Error & { code?: string; details?: unknown };
    errorCode.value = issue.code ?? "";
    errorMessage.value = presentWorkspaceError(
      issue,
      props.workspace?.workspaceKind ?? "collection"
    );
    errorDetails.value = issue.details;
  } finally {
    isSaving.value = false;
  }
}
</script>

<template>
  <UModal
    :open="open"
    :title="modalTitle"
    :description="modalDescription"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <div class="space-y-4">
        <UFormField :label="`${subjectLabel} 名称`" required>
          <UInput v-model="name" class="w-full" autofocus />
        </UFormField>
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium text-highlighted"
            >Project（{{ folders.length }}/16）</span
          >
          <UButton
            v-if="!isFolderEditing"
            icon="i-lucide-folder-plus"
            size="sm"
            variant="soft"
            :disabled="folders.length >= 16"
            @click="addFolder"
          >
            添加 Project
          </UButton>
        </div>
        <div
          v-if="folders.length === 0"
          class="rounded-lg border border-dashed border-default p-5 text-center text-sm text-muted"
        >
          至少添加一个 Project
        </div>
        <div v-else class="max-h-72 space-y-2 overflow-y-auto">
          <div
            v-for="(folder, index) in folders"
            :key="folder.folderId"
            class="flex items-center gap-2 rounded-lg border border-default p-3"
          >
            <input
              v-if="!isFolderEditing"
              v-model="primaryFolderId"
              type="radio"
              :value="folder.folderId"
              :aria-label="`设为主 Project ${folder.folderName}`"
            />
            <UIcon v-else name="i-lucide-folder" class="size-4 text-muted" />
            <div class="min-w-0 flex-1">
              <div class="truncate text-sm font-medium text-highlighted">
                {{ folder.folderName }}
              </div>
              <div
                class="break-all text-xs"
                :class="folder.pathMissing ? 'text-warning' : 'text-muted'"
              >
                {{ folder.folderPath }}
              </div>
            </div>
            <UButton
              v-if="folder.pathMissing || isFolderEditing"
              icon="i-lucide-folder-sync"
              size="xs"
              variant="ghost"
              :color="folder.pathMissing ? 'warning' : 'neutral'"
              aria-label="重新定位项目目录"
              @click="relocateFolder(folder.folderId)"
            />
            <template v-if="!isFolderEditing">
              <UButton
                icon="i-lucide-arrow-up"
                size="xs"
                variant="ghost"
                color="neutral"
                :disabled="index === 0"
                aria-label="上移"
                @click="moveFolder(index, -1)"
              />
              <UButton
                icon="i-lucide-arrow-down"
                size="xs"
                variant="ghost"
                color="neutral"
                :disabled="index === folders.length - 1"
                aria-label="下移"
                @click="moveFolder(index, 1)"
              />
              <UButton
                icon="i-lucide-x"
                size="xs"
                variant="ghost"
                color="error"
                aria-label="移除 Project"
                @click="removeFolder(folder.folderId)"
              />
            </template>
          </div>
        </div>
        <div
          v-if="errorMessage"
          class="rounded-lg border border-error/30 bg-error/5 p-3 text-sm text-error"
        >
          <p>{{ errorMessage }}</p>
          <pre
            v-if="errorDetails"
            class="mt-2 max-h-28 overflow-auto whitespace-pre-wrap text-xs"
            >{{ JSON.stringify(errorDetails, null, 2) }}</pre>
          <div v-if="conflictWorkspaces.length" class="mt-2 flex flex-wrap gap-2">
            <UButton
              v-for="conflictWorkspace in conflictWorkspaces"
              :key="conflictWorkspace.workspaceId"
              size="xs"
              variant="soft"
              color="neutral"
              @click="openConflictWorkspace(conflictWorkspace.workspaceId)"
            >
              打开 {{ conflictWorkspace.workspaceName }}
            </UButton>
          </div>
        </div>
      </div>
    </template>
    <template #footer>
      <UButton variant="ghost" color="neutral" @click="emit('update:open', false)">取消</UButton>
      <UButton
        v-if="errorCode === 'WORKSPACE_MEMBER_REMOVAL_CONFIRMATION_REQUIRED'"
        color="warning"
        :loading="isSaving"
        @click="save(true)"
      >
        确认影响并继续
      </UButton>
      <UButton
        v-if="errorCode === 'FOLDER_RELOCATION_CONFIRMATION_REQUIRED' && pendingRelocationFolderId"
        color="warning"
        :loading="isSaving"
        @click="relocateFolder(pendingRelocationFolderId, true)"
      >
        确认历史 Session 影响并重新定位
      </UButton>
      <UButton color="primary" :disabled="!canSave" :loading="isSaving" @click="save(false)">
        {{ isEditing ? "保存" : "创建" }}
      </UButton>
    </template>
  </UModal>
</template>
