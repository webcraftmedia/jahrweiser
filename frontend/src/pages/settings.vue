<script setup lang="ts">
  definePageMeta({
    middleware: ['authenticated'],
  })

  const { t } = useI18n()

  const menuItems = computed(() => [
    { label: t('pages.settings.menu.profile'), path: '/settings/profile' },
    { label: t('pages.settings.menu.newsletter'), path: '/settings/newsletter' },
  ])
</script>

<template>
  <SidebarLayout :title="t('pages.settings.title')" :menu-items="menuItems">
    <NuxtPage />
  </SidebarLayout>
</template>
