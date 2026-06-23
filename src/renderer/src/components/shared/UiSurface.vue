<script setup lang="ts">
import { computed } from "vue";

type SurfaceVariant = "default" | "flat";
type SurfacePadding = "none" | "sm" | "md" | "lg";

const props = withDefaults(
  defineProps<{
    as?: "div" | "button";
    variant?: SurfaceVariant;
    interactive?: boolean;
    padding?: SurfacePadding;
  }>(),
  {
    as: "div",
    variant: "default",
    interactive: false,
    padding: "md",
  }
);

const emit = defineEmits<{
  click: [event: MouseEvent];
}>();

const paddingClasses: Record<SurfacePadding, string> = {
  none: "",
  sm: "p-3",
  md: "p-5",
  lg: "p-6",
};

const rootClasses = computed(() => {
  const base = ["rounded-lg transition-colors duration-150", paddingClasses[props.padding]];

  if (props.variant === "flat") {
    base.push("bg-transparent");
    if (props.interactive) {
      base.push("cursor-pointer hover:bg-accented");
    }
  } else {
    base.push("bg-elevated dark:shadow-none");
    if (props.interactive) {
      base.push("cursor-pointer hover:bg-accented");
    }
  }

  return base;
});

function handleClick(event: MouseEvent): void {
  if (props.as === "button" || props.interactive) {
    emit("click", event);
  }
}
</script>

<template>
  <component
    :is="as"
    :class="rootClasses"
    :type="as === 'button' ? 'button' : undefined"
    @click="handleClick"
  >
    <slot />
  </component>
</template>
