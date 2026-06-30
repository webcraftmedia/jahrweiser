<template>
  <div />
</template>

<script setup lang="ts">
  definePageMeta({
    middleware: ['authenticated'],
  })

  await navigateTo('/settings/profile')
</script>
