<!-- eslint-disable vue/multi-word-component-names -->
<template>
  <footer class="border-t-2 border-sienna/30 dark:border-sienna-dark/50 py-1 md:py-3">
    <div
      class="max-w-screen-xl mx-auto px-2 md:px-4 flex items-center justify-center md:justify-between text-xs text-navy/60 dark:text-ivory/60"
    >
      <span class="hidden md:inline">
        {{ $t('components.Footer.copyright') }}
        <a href="https://www.webcraft-media.de/" class="hover:text-sienna transition-colors">
          {{ $t('components.Footer.copyright-holder') }}
        </a>
      </span>

      <!-- Zoom + Dark mode -->
      <div class="flex items-center gap-1 md:gap-2 shrink-0">
        <div class="flex items-center gap-0.5 bg-navy/10 dark:bg-ivory/10 rounded-lg px-1 py-0.5">
          <button
            class="zoom-btn"
            :disabled="zoom <= 0.8"
            :title="$t('components.Footer.zoom-out')"
            @click="zoom = Math.round((zoom - 0.1) * 10) / 10"
          >
            −
          </button>
          <button
            class="zoom-btn text-xs font-body"
            :title="$t('components.Footer.zoom-reset')"
            @click="zoom = 1.0"
          >
            {{ Math.round(zoom * 100) }}%
          </button>
          <button
            class="zoom-btn"
            :disabled="zoom >= 1.8"
            :title="$t('components.Footer.zoom-in')"
            @click="zoom = Math.round((zoom + 0.1) * 10) / 10"
          >
            +
          </button>
        </div>
        <button
          class="text-navy/60 dark:text-ivory/60 hover:text-navy dark:hover:text-ivory transition-colors p-1 md:p-1.5 bg-navy/10 dark:bg-ivory/10 rounded-lg"
          :title="$t('components.Footer.dark-mode')"
          :aria-label="$t('components.Footer.dark-mode')"
          @click="toggleDark"
        >
          <!-- Sun icon (shown in dark mode) -->
          <svg v-if="isDark" class="w-3.5 h-3.5 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
            />
          </svg>
          <!-- Moon icon (shown in light mode) -->
          <svg v-else class="w-3.5 h-3.5 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
            />
          </svg>
        </button>
      </div>

      <div class="hidden md:flex items-center gap-4">
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

<script setup lang="ts">
  import { useColorMode } from '../composables/useColorMode'

  const zoom = defineModel<number>('zoom', { default: 1.0 })
  const { isDark, toggle: toggleDark } = useColorMode()
</script>

<style scoped>
  @reference "tailwindcss";

  .zoom-btn {
    @apply px-2 py-0.5 rounded text-navy/60 dark:text-ivory/60 hover:bg-navy/10 dark:hover:bg-ivory/10 hover:text-navy dark:hover:text-ivory transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed;
  }
</style>
