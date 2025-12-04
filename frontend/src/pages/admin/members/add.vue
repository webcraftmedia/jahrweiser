<script setup lang="ts">
definePageMeta({
  middleware: ['authenticated', 'admin']
})
</script>

<template>
  <div>
    <h1 class="hidden md:block text-2xl font-semibold text-gray-900 dark:text-white">
      Mitglieder hinzufügen
    </h1>
  </div>
</template>
