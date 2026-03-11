<!-- eslint-disable vue/multi-word-component-names -->
<template>
  <!-- Hero variant (login page) -->
  <div v-if="variant === 'hero'" class="pt-10 pb-4 flex justify-center px-4">
    <NuxtLink to="/" class="flex items-center gap-2 md:gap-3">
      <LogoSmall class="logo-hero logo-float" />
      <!-- eslint-disable @intlify/vue-i18n/no-raw-text -->
      <div>
        <span class="font-display text-navy dark:text-ivory text-2xl md:text-3xl tracking-wide"
          >Jahrweiser</span
        >
        <span class="font-hand text-mustard text-xs md:text-sm tracking-widest ml-1 md:ml-1.5"
          >Bergstraße</span
        >
      </div>
      <!-- eslint-enable @intlify/vue-i18n/no-raw-text -->
    </NuxtLink>
  </div>

  <!-- Bar variant (default nav bar) -->
  <nav
    v-else
    class="relative z-50 bg-ivory dark:bg-poster-dark border-b-2 border-sienna/30 dark:border-sienna-dark/50 w-full shrink-0"
    :style="chromeZoom !== 1 ? { zoom: chromeZoom } : undefined"
  >
    <div
      class="max-w-screen-2xl flex flex-wrap items-center justify-between mx-auto py-2 px-2 2xl:px-0"
    >
      <NuxtLink to="/" class="flex items-center gap-2">
        <LogoSmall class="logo-bar" />
        <!-- eslint-disable @intlify/vue-i18n/no-raw-text -->
        <div>
          <span class="font-display text-navy dark:text-ivory text-2xl tracking-wide"
            >Jahrweiser</span
          >
          <span class="hidden md:inline font-hand text-mustard text-sm tracking-widest ml-1"
            >Bergstraße</span
          >
        </div>
        <!-- eslint-enable @intlify/vue-i18n/no-raw-text -->
      </NuxtLink>

      <div v-show="loggedIn" class="contents">
        <!-- Burger menu button (mobile only) -->
        <button
          type="button"
          class="relative inline-flex items-center p-2 w-10 h-10 justify-center text-sm text-navy/70 dark:text-ivory/70 rounded-lg md:hidden hover:bg-navy/10 dark:hover:bg-ivory/10 focus:outline-none focus:ring-2 focus:ring-navy/20 dark:focus:ring-ivory/20"
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
          <span
            v-if="hiddenCalendars.size > 0"
            class="absolute -top-0.5 -right-0.5 w-3 h-3 bg-sienna dark:bg-sienna-light rounded-full border-2 border-ivory dark:border-poster-dark"
          />
        </button>

        <!-- Desktop menu -->
        <div
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
              class="nav-link hover:text-sienna transition-colors"
            >
              {{ $t('components.Header.admin') }}
            </NuxtLink>
            <button class="nav-link hover:text-sienna transition-colors" @click="logout">
              {{ $t('components.Header.logout') }}
            </button>
          </div>
        </div>

        <!-- Mobile menu overlay -->
        <div
          id="navbar-mobile"
          :class="mobileMenuOpen ? 'menu-open' : ''"
          class="mobile-menu md:hidden"
        >
          <!-- User Info Header -->
          <div class="px-4 py-3 border-b border-navy/10 dark:border-poster-darkBorder">
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
              {{ $t('components.Header.logout-label') }}
            </button>
          </nav>

          <!-- Calendar Filter (mobile) -->
          <div
            v-if="legend.length"
            class="border-t border-navy/10 dark:border-poster-darkBorder px-4 py-2"
          >
            <p
              class="text-xs font-medium text-navy/60 dark:text-poster-darkMuted uppercase tracking-wider mb-2"
            >
              {{ $t('components.Header.calendars') }}
            </p>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="cal in legend"
                :key="cal.name"
                class="inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded border border-navy/15 dark:border-poster-darkBorder text-navy dark:text-ivory hover:bg-sienna/10 dark:hover:bg-sienna/20 transition-all duration-150"
                :class="{
                  'opacity-40 line-through': hiddenCalendars.has(cal.name),
                }"
                @click="toggleCalendar(cal.name)"
              >
                <span
                  class="w-2.5 h-2.5 rounded-full shrink-0"
                  :style="{ backgroundColor: cal.dotColor }"
                />
                {{ cal.name }}
              </button>
            </div>
          </div>

          <!-- Legal Links & Version -->
          <div
            class="border-t border-navy/10 dark:border-poster-darkBorder px-4 py-3 flex items-center gap-4 text-xs text-navy/60 dark:text-ivory/60"
          >
            <a
              href="https://www.webcraft-media.de/#!impressum"
              class="hover:text-sienna transition-colors"
              @click="toggleMobileMenu"
            >
              {{ $t('components.Footer.imprint') }}
            </a>
            <a
              href="https://www.webcraft-media.de/#!datenschutz"
              class="hover:text-sienna transition-colors"
              @click="toggleMobileMenu"
            >
              {{ $t('components.Footer.privacy-policy') }}
            </a>
            <!-- eslint-disable @intlify/vue-i18n/no-raw-text -->
            <button
              class="ml-auto hover:text-sienna dark:hover:text-sienna-light transition-colors cursor-pointer"
              :title="$t('components.Footer.changelog')"
              @click="openChangelog"
            >
              v{{ appVersion }}
            </button>
          </div>
          <!-- eslint-enable @intlify/vue-i18n/no-raw-text -->
        </div>
      </div>
    </div>
  </nav>
  <!-- Backdrop (outside nav stacking context so it covers page content) -->
  <div
    v-show="loggedIn && mobileMenuOpen"
    class="md:hidden fixed inset-0 bg-navy/30 dark:bg-black/40 z-40"
    data-testid="mobile-backdrop"
    @click="toggleMobileMenu"
  />

</template>

<script setup lang="ts">
  import LogoSmall from '~/../assets/logo-small.svg'

  withDefaults(defineProps<{ variant?: 'bar' | 'hero' }>(), { variant: 'bar' })

  const { chromeZoom } = useZoom()
  const appVersion = useRuntimeConfig().public.appVersion

  const { user, loggedIn, clear: clearSession } = useUserSession()
  const { legend, hiddenCalendars, toggleCalendar } = useCalendarFilter()
  const mobileMenuOpen = ref(false)
  const { openChangelog: triggerChangelog } = useChangelog()

  const welcomeName = computed(() =>
    user.value?.name ? user.value.name.split(' ').slice(-1).pop() : user.value?.email,
  )

  function toggleMobileMenu() {
    mobileMenuOpen.value = !mobileMenuOpen.value
  }

  function openChangelog() {
    mobileMenuOpen.value = false
    triggerChangelog()
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
    width: 40px;
    height: 40px;
  }

  @media (min-width: 768px) {
    .logo-hero {
      width: 56px;
      height: 56px;
    }
  }

  /* Hero logo gentle float */
  .logo-float {
    animation: gentleFloat 4s ease-in-out infinite;
  }

  /* Mobile menu overlay */
  .mobile-menu {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 50;
    background-color: #faf5eb;
    border-bottom: 2px solid rgba(194, 65, 12, 0.3);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    transform: translateY(-0.5rem);
    opacity: 0;
    pointer-events: none;
    transition:
      transform 0.3s cubic-bezier(0.4, 0, 0.2, 1),
      opacity 0.25s ease;
  }
  :is(.dark .mobile-menu) {
    background-color: #1a1714;
    border-bottom-color: rgba(154, 52, 18, 0.5);
  }
  .mobile-menu.menu-open {
    transform: translateY(0);
    opacity: 1;
    pointer-events: auto;
  }

  /* Nav link hover underline */
  .nav-link {
    position: relative;
  }
  .nav-link::after {
    content: '';
    position: absolute;
    left: 0;
    bottom: -2px;
    height: 2px;
    width: 0;
    background-color: currentColor;
    transition: width 0.3s ease;
  }
  .nav-link:hover::after {
    width: 100%;
  }
</style>
