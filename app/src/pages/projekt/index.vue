<script setup lang="ts">
  definePageMeta({
    middleware: ['authenticated'],
  })

  const { t } = useI18n()
  const runtimeConfig = useRuntimeConfig()

  // What the project offers, spelled out rather than derived from
  // useAppSections(): that composable says what a *member* may open right now,
  // this text says what the project is — the Blättchen belongs in it even
  // before the first issue is published. Literal keys, so the locale linter can
  // follow every one of them to its translation.
  const features = computed(() => [
    t('pages.projekt.about.what.feature.calendar'),
    t('pages.projekt.about.what.feature.blaettchen'),
    t('pages.projekt.about.what.feature.telegram'),
    t('pages.projekt.about.what.feature.map'),
    t('pages.projekt.about.what.feature.caldav'),
  ])
</script>

<template>
  <div class="space-y-6">
    <h1 class="hidden md:block text-2xl font-display text-navy dark:text-ivory">
      {{ t('pages.projekt.menu.about') }}
    </h1>

    <section
      class="bg-white/80 dark:bg-poster-darkCard rounded shadow-lg p-6 border-2 border-navy/15 dark:border-poster-darkBorder"
    >
      <h2 class="text-lg font-semibold mb-2">{{ t('pages.projekt.about.what.heading') }}</h2>
      <p class="text-sm text-navy/80 dark:text-ivory/80">
        {{ t('pages.projekt.about.what.text') }}
      </p>
      <ul
        class="mt-4 space-y-1.5 list-disc list-outside pl-5 marker:text-sienna dark:marker:text-sienna-light text-sm text-navy/80 dark:text-ivory/80"
      >
        <li v-for="feature in features" :key="feature">{{ feature }}</li>
      </ul>
    </section>

    <section
      class="bg-white/80 dark:bg-poster-darkCard rounded shadow-lg p-6 border-2 border-navy/15 dark:border-poster-darkBorder"
    >
      <h2 class="text-lg font-semibold mb-2">{{ t('pages.projekt.about.who.heading') }}</h2>
      <p class="text-sm text-navy/80 dark:text-ivory/80">
        {{ t('pages.projekt.about.who.text') }}
      </p>
    </section>

    <section
      class="bg-white/80 dark:bg-poster-darkCard rounded shadow-lg p-6 border-2 border-navy/15 dark:border-poster-darkBorder"
    >
      <h2 class="text-lg font-semibold mb-2">{{ t('pages.projekt.about.help.heading') }}</h2>
      <p class="text-sm text-navy/80 dark:text-ivory/80 mb-4">
        {{ t('pages.projekt.about.help.text') }}
      </p>
      <NuxtLink
        to="/projekt/feedback"
        class="inline-block bg-sienna hover:brightness-110 text-ivory font-semibold rounded px-4 py-2"
      >
        {{ t('pages.projekt.about.help.link') }}
      </NuxtLink>
    </section>

    <!-- Placeholder on purpose: the ways to donate are not decided yet, and an
         empty promise is worse than a dated one. Becomes its own page (and a
         third sidebar entry) as soon as there is something to point at. -->
    <section
      class="bg-white/80 dark:bg-poster-darkCard rounded shadow-lg p-6 border-2 border-dashed border-navy/20 dark:border-poster-darkBorder"
    >
      <h2 class="text-lg font-semibold mb-2">{{ t('pages.projekt.about.donate.heading') }}</h2>
      <p class="text-sm text-navy/80 dark:text-ivory/80">
        {{ t('pages.projekt.about.donate.text') }}
      </p>
    </section>

    <section
      class="bg-white/80 dark:bg-poster-darkCard rounded shadow-lg p-6 border-2 border-navy/15 dark:border-poster-darkBorder"
    >
      <h2 class="text-lg font-semibold mb-2">{{ t('pages.projekt.about.tech.heading') }}</h2>
      <dl class="text-sm text-navy/80 dark:text-ivory/80 space-y-1">
        <div class="flex gap-2">
          <dt class="text-navy/60 dark:text-ivory/60">
            {{ t('pages.projekt.about.tech.version') }}
          </dt>
          <!-- eslint-disable-next-line @intlify/vue-i18n/no-raw-text -->
          <dd>v{{ runtimeConfig.public.appVersion }}</dd>
        </div>
      </dl>
      <p class="mt-4 text-sm text-navy/80 dark:text-ivory/80">
        {{ t('pages.projekt.about.tech.text') }}
      </p>
      <div class="mt-4 flex flex-wrap gap-4 text-sm">
        <a
          href="https://www.webcraft-media.de/#!impressum"
          class="text-sienna dark:text-sienna-light hover:underline"
        >
          {{ t('components.Footer.imprint') }}
        </a>
        <a
          href="https://www.webcraft-media.de/#!datenschutz"
          class="text-sienna dark:text-sienna-light hover:underline"
        >
          {{ t('components.Footer.privacy-policy') }}
        </a>
      </div>
    </section>
  </div>
</template>
