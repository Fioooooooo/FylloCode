<script setup lang="ts">
import Logo from "./Logo.vue";
</script>

<template>
  <div class="fyllo-startup-overlay" role="status" aria-live="polite" aria-busy="true">
    <div class="fyllo-startup-content">
      <div class="fyllo-startup-ring" aria-hidden="true">
        <Logo class="fyllo-startup-logo" />
      </div>
      <span class="fyllo-startup-sr-only">正在启动 FylloCode…</span>
    </div>
  </div>
</template>
