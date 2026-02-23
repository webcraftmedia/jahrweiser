<template>
  <div />
</template>

<script setup lang="ts">
definePageMeta({
  middleware: ['authenticated', 'admin'],
})

await navigateTo('/admin/members/add')
</script>
