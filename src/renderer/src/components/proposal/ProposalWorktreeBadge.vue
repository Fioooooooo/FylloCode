<script setup lang="ts">
const props = defineProps<{
  worktreePath?: string | null;
}>();

const accessibleLabel = `Linked worktree: ${props.worktreePath ?? ""}`;
</script>

<template>
  <UTooltip
    v-if="worktreePath"
    data-test="proposal-worktree-badge"
    :text="worktreePath"
    :delay-duration="200"
  >
    <UIcon
      name="i-lucide-git-branch"
      class="w-3 h-3 shrink-0 text-muted"
      :title="worktreePath"
      :aria-label="accessibleLabel"
    />
  </UTooltip>
</template>
