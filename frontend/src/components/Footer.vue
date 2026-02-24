<!-- eslint-disable vue/multi-word-component-names -->
<template>
  <footer class="border-t-2 border-sienna/30 dark:border-sienna-dark/50 py-3">
    <div
      class="max-w-screen-xl mx-auto px-4 flex items-center justify-between text-xs text-navy/60 dark:text-poster-darkMuted"
    >
      <span>
        {{ $t('components.Footer.copyright') }}
        <a href="https://www.webcraft-media.de/" class="hover:text-sienna transition-colors">
          {{ $t('components.Footer.copyright-holder') }}
        </a>
      </span>
      <div class="flex items-center gap-4">
        <NuxtLink
          :to="{ path: 'https://www.webcraft-media.de/#!impressum' }"
          external
          class="hover:text-sienna transition-colors"
        >
          {{ $t('components.Footer.imprint') }}
        </NuxtLink>
        <NuxtLink
          :to="{ path: 'https://www.webcraft-media.de/#!datenschutz' }"
          external
          class="hover:text-sienna transition-colors"
        >
          {{ $t('components.Footer.privacy-policy') }}
        </NuxtLink>
      </div>
    </div>
  </footer>
</template>
