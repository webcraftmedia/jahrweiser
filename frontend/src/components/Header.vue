<!-- eslint-disable vue/multi-word-component-names -->
<template>
  <!-- Hero variant (login page) -->
  <div v-if="variant === 'hero'" class="pt-10 pb-4 flex justify-center">
    <NuxtLink to="/" class="flex items-center gap-3">
      <LogoSmall class="logo-hero" />
      <div>
        <span class="font-display text-navy dark:text-ivory text-3xl tracking-wide"
          >Jahrweiser</span
        >
        <span class="font-hand text-mustard text-sm tracking-widest ml-1.5">Bergstraße</span>
      </div>
    </NuxtLink>
  </div>

  <!-- Bar variant (default nav bar) -->
  <nav
    v-else
    class="bg-ivory dark:bg-poster-dark border-b-2 border-sienna/30 dark:border-sienna-dark/50 w-full fixed top-0 z-50"
    :style="chromeZoom !== 1 ? { zoom: chromeZoom } : undefined"
  >
    <div class="max-w-screen-2xl flex flex-wrap items-center justify-between mx-auto p-2">
      <NuxtLink to="/" class="flex items-center gap-2">
        <LogoSmall class="logo-bar" />
        <div>
          <span class="font-display text-navy dark:text-ivory text-2xl tracking-wide">Jahrweiser</span>
          <span class="font-hand text-mustard text-sm tracking-widest ml-1"
            >Bergstraße</span
          >
        </div>
      </NuxtLink>

      <!-- Burger menu button (mobile only) -->
      <button
        v-if="loggedIn"
        type="button"
        class="inline-flex items-center p-2 w-10 h-10 justify-center text-sm text-navy/70 dark:text-ivory/70 rounded-lg md:hidden hover:bg-navy/10 dark:hover:bg-ivory/10 focus:outline-none focus:ring-2 focus:ring-navy/20 dark:focus:ring-ivory/20"
        aria-controls="navbar-mobile"
        :aria-expanded="mobileMenuOpen"
        @click="toggleMobileMenu"
      >
        <span class="sr-only">{{ $t('components.Header.open-menu') }}</span>
        <svg
          class="w-5 h-5"
          aria-hidden="true"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 17 14"
        >
          <path
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M1 1h15M1 7h15M1 13h15"
          />
        </svg>
      </button>

      <!-- Desktop menu -->
      <div
        v-if="loggedIn"
        id="navbar-desktop"
        class="hidden md:block text-right text-navy dark:text-ivory font-body"
      >
        <p>
          {{ $t('components.Header.welcome') }} <b>{{ welcomeName }}</b>
        </p>
        <div class="space-x-4">
          <NuxtLink
            v-if="user?.role === 'admin'"
            to="/admin/members/add"
            class="hover:text-sienna transition-colors"
          >
            {{ $t('components.Header.admin') }}
          </NuxtLink>
          <button class="hover:text-sienna transition-colors" @click="logout">
            {{ $t('components.Header.logout') }}
          </button>
        </div>
      </div>

      <!-- Mobile menu dropdown -->
      <div
        v-if="loggedIn"
        id="navbar-mobile"
        :class="mobileMenuOpen ? 'block' : 'hidden'"
        class="w-full md:hidden mt-2"
      >
        <div
          class="bg-ivory dark:bg-poster-darkCard rounded-lg shadow-xl border border-navy/15 dark:border-poster-darkBorder overflow-hidden"
        >
          <!-- User Info Header -->
          <div
            class="px-4 py-3 bg-navy/5 dark:bg-poster-dark border-b border-navy/10 dark:border-poster-darkBorder"
          >
            <p
              class="text-xs font-medium text-navy/60 dark:text-poster-darkMuted uppercase tracking-wider"
            >
              {{ $t('components.Header.welcome') }}
            </p>
            <p class="mt-1 text-sm font-semibold text-navy dark:text-ivory truncate">
              {{ welcomeName }}
            </p>
          </div>

          <!-- Menu Items -->
          <nav class="py-2">
            <NuxtLink
              v-if="user?.role === 'admin'"
              to="/admin/members/add"
              class="block w-full text-left px-4 py-3 text-sm font-medium text-navy dark:text-ivory hover:bg-sienna/10 dark:hover:bg-sienna/20 active:bg-sienna/20 dark:active:bg-sienna/30 transition-all duration-150"
              @click="toggleMobileMenu"
            >
              {{ $t('components.Header.admin') }}
            </NuxtLink>
            <button
              class="w-full text-left px-4 py-3 text-sm font-medium text-navy dark:text-ivory hover:bg-sienna/10 dark:hover:bg-sienna/20 active:bg-sienna/20 dark:active:bg-sienna/30 transition-all duration-150"
              @click="logout"
            >
              {{ $t('components.Header.logout') }}
            </button>
          </nav>

          <!-- Legal Links -->
          <div
            class="border-t border-navy/10 dark:border-poster-darkBorder px-4 py-3 flex gap-4 text-xs text-navy/60 dark:text-ivory/60"
          >
            <NuxtLink
              :to="{ path: 'https://www.webcraft-media.de/#!impressum' }"
              external
              class="hover:text-sienna transition-colors"
              @click="toggleMobileMenu"
            >
              {{ $t('components.Footer.imprint') }}
            </NuxtLink>
            <NuxtLink
              :to="{ path: 'https://www.webcraft-media.de/#!datenschutz' }"
              external
              class="hover:text-sienna transition-colors"
              @click="toggleMobileMenu"
            >
              {{ $t('components.Footer.privacy-policy') }}
            </NuxtLink>
          </div>
        </div>
      </div>
      <template v-else />
    </div>
  </nav>
</template>

<script setup lang="ts">
  import LogoSmall from '~/../assets/logo-small.svg'
  import { useZoom } from '../composables/useZoom'

  withDefaults(defineProps<{ variant?: 'bar' | 'hero' }>(), { variant: 'bar' })

  const { chromeZoom } = useZoom()

  const welcomeName = ref()
  const { user, loggedIn, clear: clearSession } = useUserSession()
  const mobileMenuOpen = ref(false)

  welcomeName.value = computed(() =>
    user.value?.name ? user.value.name.split(' ').slice(-1).pop() : user.value?.email,
  )

  function toggleMobileMenu() {
    mobileMenuOpen.value = !mobileMenuOpen.value
  }

  async function logout() {
    mobileMenuOpen.value = false
    await clearSession()
    await navigateTo('/login')
  }
</script>

<style scoped>
  .logo-bar {
    width: 44px;
    height: 44px;
  }
  .logo-hero {
    width: 56px;
    height: 56px;
  }
</style>

<style>
  .dark .logo-bar circle,
  .dark .logo-hero circle {
    fill: transparent !important;
    filter: none !important;
  }
  .dark .logo-bar [aria-label='G'],
  .dark .logo-hero [aria-label='G'] {
    fill: #c2410c !important;
  }
  .dark .logo-bar [aria-label='&'],
  .dark .logo-hero [aria-label='&'] {
    fill: #d97706 !important;
  }
</style>
