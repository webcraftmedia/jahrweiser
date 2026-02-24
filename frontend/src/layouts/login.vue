<template>
  <div class="flex flex-col min-h-screen bg-ivory dark:bg-poster-dark relative">
    <!-- Logo -->
    <div class="pt-10 pb-4 flex justify-center">
      <NuxtLink to="/" class="flex items-center gap-3">
        <LogoSmall class="logo-small" />
        <div>
          <span class="font-display text-navy dark:text-ivory text-3xl tracking-wide"
            >Jahrweiser</span
          >
          <span class="font-hand text-mustard text-sm tracking-widest ml-1.5">Bergstraße</span>
        </div>
      </NuxtLink>
    </div>

    <!-- Content -->
    <div class="flex-1 flex items-start justify-center px-4">
      <slot />
    </div>

    <!-- Footer -->
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
  </div>
</template>

<script setup lang="ts">
  import LogoSmall from '~/../assets/logo-small.svg'
</script>

<style scoped>
  .logo-small {
    width: 56px;
    height: 56px;
  }
</style>
