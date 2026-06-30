<script setup lang="ts">
  definePageMeta({
    middleware: ['authenticated', 'admin'],
  })

  const { t } = useI18n()

  const menuItems = computed(() => [
    { label: t('pages.admin.menu.members-add'), path: '/admin/members/add' },
    { label: t('pages.admin.menu.links'), path: '/admin/links' },
    { label: t('pages.admin.menu.calendar'), path: '/admin/cal/', external: true },
  ])
</script>

<template>
  <SidebarLayout :title="t('pages.admin.title')" :menu-items="menuItems">
    <NuxtPage />
  </SidebarLayout>
</template>
