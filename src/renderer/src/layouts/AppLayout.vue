<script setup lang="ts"></script>

<template>
  <div class="h-screen flex flex-col overflow-hidden bg-default">
    <header class="shrink-0">
      <slot name="header" />
    </header>

    <div class="flex-1 flex overflow-hidden">
      <aside class="shrink-0">
        <slot name="side" />
      </aside>

      <div class="flex-1 flex flex-col min-w-0 bg-default">
        <slot />
      </div>
    </div>
  </div>
</template>
