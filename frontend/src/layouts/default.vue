<template>
  <div class="flex flex-col h-screen bg-ivory dark:bg-poster-dark relative">
    <Header />
    <div class="content flex-1 overflow-y-auto flex flex-col">
      <div
        class="max-w-screen-2xl flex flex-wrap justify-between mx-auto w-full flex-1"
        :style="zoomLevel !== 1 ? { zoom: zoomLevel } : undefined"
      >
        <slot />
      </div>
    </div>
    <Footer />
  </div>
</template>

<script setup lang="ts">
  import { useZoom } from '../composables/useZoom'

  const { zoomLevel } = useZoom()
</script>

<style scoped>
  @reference "tailwindcss";
  .content {
    @apply mt-14 md:mt-16 mb-0;
  }
</style>
