<template>
  <span :class="[dotClass, sizeClass]" />
  <span :class="[dotClass, sizeClass]" style="animation-delay: 0.15s" />
  <span :class="[dotClass, sizeClass]" style="animation-delay: 0.3s" />
</template>

<script setup lang="ts">
  const { small = false, light = false } = defineProps<{
    small?: boolean
    light?: boolean
  }>()

  const dotClass = light ? 'loading-dot !bg-ivory' : 'loading-dot'
  const sizeClass = small ? '!w-[6px] !h-[6px]' : ''
</script>
