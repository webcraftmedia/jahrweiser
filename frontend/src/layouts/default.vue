<template>
  <div class="flex flex-col h-screen bg-ivory dark:bg-poster-dark relative">
    <Header />
    <div class="content flex-1 overflow-y-auto flex flex-col">
      <div
        class="max-w-screen-xl flex flex-wrap justify-between mx-auto w-full flex-1"
        :style="zoomLevel !== 1 ? { zoom: zoomLevel } : undefined"
      >
        <slot />
      </div>
    </div>
    <Footer v-model:zoom="zoomLevel" />
  </div>
</template>

<script setup lang="ts">
  const ZOOM_KEY = 'jahrweiser-zoom'

  const zoomLevel = ref(1.0)

  onMounted(() => {
    const stored = localStorage.getItem(ZOOM_KEY)
    if (stored !== null) {
      const parsed = parseFloat(stored)
      if (!Number.isNaN(parsed) && parsed >= 0.8 && parsed <= 1.8) {
        zoomLevel.value = parsed
      }
    }
  })

  watch(zoomLevel, (val) => {
    if (import.meta.client) {
      localStorage.setItem(ZOOM_KEY, String(val))
    }
  })
</script>

<style scoped>
  @reference "tailwindcss";
  .content {
    @apply mt-16 mb-0;
  }
</style>
