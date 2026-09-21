<script setup lang="ts">
  definePageMeta({
    middleware: ['authenticated'],
  })

  const { t } = useI18n()

  // `/projekt` itself is the "about" page — the section has something to say
  // before it has anything to ask, so there is no redirect-only index here.
  // The donation page joins this list as a third entry once it exists.
  const menuItems = computed(() => [
    { label: t('pages.projekt.menu.about'), path: '/projekt' },
    { label: t('pages.projekt.menu.feedback'), path: '/projekt/feedback' },
  ])
</script>

<template>
  <SidebarLayout :title="t('pages.projekt.title')" :menu-items="menuItems">
    <NuxtPage />
  </SidebarLayout>
</template>
