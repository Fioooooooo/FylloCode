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

      <main class="flex-1 flex p-2 min-w-0 bg-elevated">
        <div class="flex-1 flex flex-col min-w-0 rounded-lg bg-default overflow-auto">
          <slot />
        </div>
      </main>
    </div>
  </div>
</template>
