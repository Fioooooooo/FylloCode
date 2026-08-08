<script setup lang="ts">
import Logo from "./Logo.vue";
</script>

<template>
  <div class="fyllo-startup-overlay" role="status" aria-live="polite" aria-busy="true">
    <div class="fyllo-startup-content">
      <div class="fyllo-startup-stage" aria-hidden="true">
        <div class="fyllo-startup-ring">
          <Logo class="fyllo-startup-logo" />
          <div class="fyllo-startup-dot-logo">
            <span class="fyllo-startup-dot-layer fyllo-startup-dot-base" />
            <span
              class="fyllo-startup-dot-layer fyllo-startup-dot-band"
              style="--dot-top: 0; --dot-bottom: 105px; --dot-delay: 0s"
            />
            <span
              class="fyllo-startup-dot-layer fyllo-startup-dot-band"
              style="--dot-top: 21px; --dot-bottom: 84px; --dot-delay: 0.1s"
            />
            <span
              class="fyllo-startup-dot-layer fyllo-startup-dot-band"
              style="--dot-top: 42px; --dot-bottom: 63px; --dot-delay: 0.2s"
            />
            <span
              class="fyllo-startup-dot-layer fyllo-startup-dot-band"
              style="--dot-top: 63px; --dot-bottom: 42px; --dot-delay: 0.3s"
            />
            <span
              class="fyllo-startup-dot-layer fyllo-startup-dot-band"
              style="--dot-top: 84px; --dot-bottom: 21px; --dot-delay: 0.4s"
            />
            <span
              class="fyllo-startup-dot-layer fyllo-startup-dot-band"
              style="--dot-top: 105px; --dot-bottom: 0; --dot-delay: 0.5s"
            />
          </div>
        </div>
        <div class="fyllo-startup-lockup">
          <span class="fyllo-startup-wordmark">FylloCode</span>
          <span class="fyllo-startup-status">正在启动…</span>
        </div>
      </div>
      <span class="fyllo-startup-sr-only">正在启动 FylloCode…</span>
    </div>
  </div>
</template>
