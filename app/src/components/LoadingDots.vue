<template>
  <span :class="[dotClass, sizeClass]" />
  <span :class="[dotClass, sizeClass]" style="animation-delay: 0.15s" />
  <span :class="[dotClass, sizeClass]" style="animation-delay: 0.3s" />
</template>

<script setup lang="ts">
  const props = defineProps<{
    small?: boolean
    light?: boolean
  }>()

  const dotClass = computed(() => (props.light ? 'loading-dot !bg-ivory' : 'loading-dot'))
  const sizeClass = computed(() => (props.small ? '!w-[6px] !h-[6px]' : ''))
</script>
