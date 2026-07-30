<script setup lang="ts">
type LogoColor = "default" | "neutral";

withDefaults(
  defineProps<{
    color?: LogoColor;
    alt?: string;
  }>(),
  {
    color: "default",
    alt: "",
  }
);

defineOptions({
  inheritAttrs: false,
});

const iconUrl = `${import.meta.env.BASE_URL}icon.svg`;
const neutralStyle = {
  "--fyllocode-logo-icon": `url("${iconUrl}")`,
  backgroundColor: "currentColor",
  display: "inline-block",
  maskImage: "var(--fyllocode-logo-icon)",
  maskPosition: "center",
  maskRepeat: "no-repeat",
  maskSize: "contain",
  WebkitMaskImage: "var(--fyllocode-logo-icon)",
  WebkitMaskPosition: "center",
  WebkitMaskRepeat: "no-repeat",
  WebkitMaskSize: "contain",
};
</script>

<template>
  <span
    v-if="color === 'neutral'"
    v-bind="$attrs"
    :style="neutralStyle"
    :role="alt ? 'img' : undefined"
    :aria-label="alt || undefined"
    :aria-hidden="alt ? undefined : 'true'"
  />
  <img v-else v-bind="$attrs" :src="iconUrl" :alt="alt" />
</template>
