<script setup lang="ts">
  definePageMeta({
    middleware: ['authenticated'],
  })

  const { t } = useI18n()

  // One card per facet of the name, in the order the name spells them out —
  // literal keys, so the locale linter can follow every one of them to its
  // translation.
  const sections = computed(() => [
    {
      heading: t('pages.projekt.gemeinschaft.gemeinsam.heading'),
      text: t('pages.projekt.gemeinschaft.gemeinsam.text'),
    },
    {
      heading: t('pages.projekt.gemeinschaft.gestalten.heading'),
      text: t('pages.projekt.gemeinschaft.gestalten.text'),
    },
    {
      heading: t('pages.projekt.gemeinschaft.geniessen.heading'),
      text: t('pages.projekt.gemeinschaft.geniessen.text'),
    },
    {
      heading: t('pages.projekt.gemeinschaft.verbindet.heading'),
      text: t('pages.projekt.gemeinschaft.verbindet.text'),
    },
    {
      heading: t('pages.projekt.gemeinschaft.offen.heading'),
      text: t('pages.projekt.gemeinschaft.offen.text'),
    },
  ])
</script>

<template>
  <div class="space-y-6">
    <h1 class="hidden md:block text-2xl font-display text-navy dark:text-ivory">
      {{ t('pages.projekt.menu.community') }}
    </h1>

    <!-- The name carries the text, so it gets a card of its own rather than a
         headline the reader skips over. -->
    <section
      class="bg-white/80 dark:bg-poster-darkCard rounded shadow-lg p-6 border-2 border-navy/15 dark:border-poster-darkBorder"
    >
      <h2 class="text-lg font-semibold mb-2">
        {{ t('pages.projekt.gemeinschaft.lead.heading') }}
      </h2>
      <p class="text-sm text-navy/80 dark:text-ivory/80">
        {{ t('pages.projekt.gemeinschaft.lead.text') }}
      </p>
    </section>

    <section
      v-for="section in sections"
      :key="section.heading"
      class="bg-white/80 dark:bg-poster-darkCard rounded shadow-lg p-6 border-2 border-navy/15 dark:border-poster-darkBorder"
    >
      <h2 class="text-lg font-semibold mb-2">{{ section.heading }}</h2>
      <p class="text-sm text-navy/80 dark:text-ivory/80">{{ section.text }}</p>
    </section>
  </div>
</template>
