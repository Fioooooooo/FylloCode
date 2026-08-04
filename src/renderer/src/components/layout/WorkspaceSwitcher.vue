<script setup lang="ts">
import { computed } from "vue";
import type { DropdownMenuItem } from "@nuxt/ui";
import { useDefaultAppRoute } from "@renderer/composables/useDefaultAppRoute";
import { useWorkspaceStore } from "@renderer/stores";
import {
  workspaceKindIcon,
  workspaceKindLabel,
  workspacePresentationTerms,
  type WorkspaceKindIcon,
  type WorkspaceKindLabel,
} from "@renderer/utils/workspace-presentation";
import type { WorkspaceLauncherItem } from "@shared/types/workspace";

interface WorkspaceMenuItem extends DropdownMenuItem {
  workspace: WorkspaceLauncherItem;
  kindLabel: WorkspaceKindLabel;
  kindIcon: WorkspaceKindIcon;
  summary: string;
  missingSummary: string | null;
  current: boolean;
}

const { goToDefault } = useDefaultAppRoute();
const workspaceStore = useWorkspaceStore();

const currentKindIcon = computed(() => {
  const workspace = workspaceStore.currentWorkspace;
  return workspace ? workspaceKindIcon(workspace.kind) : null;
});

const currentProjectCount = computed(() => {
  const workspace = workspaceStore.currentWorkspace;
  return workspace?.kind === "collection" ? projectCountLabel(workspace.folders.length) : null;
});

const triggerLabel = computed(() => {
  const workspace = workspaceStore.currentWorkspace;
  if (!workspace) return "选择 Project 或 Workspace";

  const kindLabel = workspaceKindLabel(workspace.kind);
  const countLabel =
    workspace.kind === "collection" ? `，${workspace.folders.length} 个 Project` : "";
  return `切换 Project 或 Workspace，当前 ${workspace.name}，${kindLabel}${countLabel}`;
});

function primaryProjectName(workspace: WorkspaceLauncherItem): string {
  return (
    workspace.folders.find((folder) => folder.folderId === workspace.primaryFolderId)?.folderName ??
    workspace.primaryFolderPath
  );
}

function projectCountLabel(count: number): string {
  return `${count} ${count === 1 ? "Project" : "Projects"}`;
}

function workspaceSummary(workspace: WorkspaceLauncherItem): string {
  if (workspace.workspaceKind === "folder") return workspace.primaryFolderPath;

  return `${projectCountLabel(workspace.folderCount)} · ${workspacePresentationTerms.primaryMember}：${primaryProjectName(workspace)}`;
}

async function openProject(): Promise<void> {
  const workspace = await workspaceStore.openFolderWindow();
  if (workspace) await goToDefault();
}

function toWorkspaceMenuItem(workspace: WorkspaceLauncherItem): WorkspaceMenuItem {
  return {
    label: `${workspace.workspaceName} · ${workspaceKindLabel(workspace.workspaceKind)}`,
    workspace,
    kindLabel: workspaceKindLabel(workspace.workspaceKind),
    kindIcon: workspaceKindIcon(workspace.workspaceKind),
    summary: workspaceSummary(workspace),
    missingSummary:
      workspace.missingFolderCount > 0 ? `${workspace.missingFolderCount} 个项目目录缺失` : null,
    current: workspaceStore.currentWorkspace?.id === workspace.workspaceId,
    class:
      workspaceStore.currentWorkspace?.id === workspace.workspaceId
        ? "bg-primary/10 text-primary"
        : undefined,
    onSelect: () => {
      void workspaceStore.openRecentWorkspace(workspace);
    },
  };
}

function isWorkspaceMenuItem(item: DropdownMenuItem): item is WorkspaceMenuItem {
  return "workspace" in item;
}

const dropdownItems = computed<DropdownMenuItem[]>(() => {
  const recentItems = workspaceStore.recentWorkspaces.map(toWorkspaceMenuItem);
  const items: DropdownMenuItem[] = [
    { type: "label", label: "最近打开" },
    ...(recentItems.length
      ? recentItems
      : [{ label: "暂无最近打开的 Project 或 Workspace", disabled: true }]),
    { type: "separator" },
    {
      label: "打开 Project…",
      icon: "i-lucide-folder-open",
      onSelect: () => {
        void openProject();
      },
    },
  ];

  if (workspaceStore.windowContext?.role === "workspace") {
    items.push({
      label: "管理 Project 与 Workspace…",
      icon: "i-lucide-layout-grid",
      onSelect: () => {
        void workspaceStore.openLauncherWindow();
      },
    });
  }

  return items;
});
</script>

<template>
  <div class="min-w-0" style="-webkit-app-region: no-drag">
    <UDropdownMenu
      :items="dropdownItems"
      :content="{
        align: 'center',
        side: 'bottom',
        sideOffset: 4,
      }"
      :ui="{
        content: 'min-w-80 max-w-96 max-h-80 overflow-y-auto',
        item: 'items-start py-2',
      }"
    >
      <template #item="{ item }">
        <span v-if="isWorkspaceMenuItem(item)" class="flex min-w-0 flex-1 items-start gap-2">
          <span
            class="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-elevated text-muted"
            aria-hidden="true"
          >
            <UIcon :name="item.kindIcon" class="size-4" />
          </span>

          <span class="flex min-w-0 flex-1 flex-col gap-0.5">
            <span class="flex min-w-0 items-center gap-2">
              <span class="truncate text-sm font-medium text-highlighted">
                {{ item.workspace.workspaceName }}
              </span>
              <span
                class="shrink-0 rounded-md bg-elevated px-1.5 py-0.5 text-[10px] font-medium text-muted"
              >
                {{ item.kindLabel }}
              </span>
            </span>

            <span
              class="flex min-w-0 items-center gap-1 truncate text-xs"
              :class="item.missingSummary ? 'text-warning' : 'text-muted'"
            >
              <UIcon
                v-if="item.missingSummary"
                name="i-lucide-triangle-alert"
                class="size-3 shrink-0"
                aria-hidden="true"
              />
              <span class="truncate">
                {{ item.summary
                }}<template v-if="item.missingSummary"> · {{ item.missingSummary }}</template>
              </span>
            </span>
          </span>

          <UIcon
            v-if="item.current"
            name="i-lucide-check"
            class="mt-1 size-4 shrink-0 text-primary"
            aria-label="当前"
          />
        </span>
        <span v-else class="flex min-w-0 items-center gap-2">
          <UIcon v-if="item.icon" :name="item.icon" class="size-4 shrink-0" aria-hidden="true" />
          <span class="truncate">{{ item.label }}</span>
        </span>
      </template>

      <template #default="{ open }">
        <button
          type="button"
          class="flex max-w-80 min-w-0 items-center gap-2 rounded-full bg-elevated px-3 py-0.5 text-sm text-highlighted transition-colors hover:bg-accented focus-visible:outline-2 focus-visible:outline-primary"
          aria-haspopup="menu"
          :aria-expanded="open"
          :aria-label="triggerLabel"
          data-test="workspace-switcher-trigger"
        >
          <UIcon
            v-if="currentKindIcon"
            :name="currentKindIcon"
            class="size-4 shrink-0 text-muted"
            aria-hidden="true"
          />
          <span class="max-w-48 truncate font-normal">
            {{ workspaceStore.currentWorkspace?.name ?? "未选择 Project 或 Workspace" }}
          </span>
          <span
            v-if="currentProjectCount"
            class="shrink-0 rounded-full bg-accented px-1.5 py-0.5 text-[10px] text-muted"
          >
            {{ currentProjectCount }}
          </span>
          <UIcon
            name="i-lucide-chevron-down"
            class="size-4 shrink-0 text-muted transition-transform duration-150"
            :class="open ? 'rotate-180' : undefined"
            aria-hidden="true"
          />
        </button>
      </template>
    </UDropdownMenu>
  </div>
</template>
