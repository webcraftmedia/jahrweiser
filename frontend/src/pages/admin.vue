<script setup lang="ts">
  definePageMeta({
    middleware: ['authenticated', 'admin'],
  })

  const route = useRoute()

  const { t } = useI18n()

  const menuItems = ref([
    { label: t('pages.admin.menu.members-add'), path: '/admin/members/add' },
    { label: t('pages.admin.menu.calendar'), path: '/admin/cal/', external: true },
  ])

  const mobileMenuOpen = ref(false)

  const toggleMobileMenu = () => {
    mobileMenuOpen.value = !mobileMenuOpen.value
  }

  const isActive = (path: string) => {
    return route.path === path
  }

  const currentPageTitle = computed(() => {
    const current = menuItems.value.find((item) => item.path === route.path)
    return current ? current.label : ''
  })
</script>

<template>
  <div class="bg-ivory dark:bg-poster-dark w-full flex-1 border-l border-r">
    <div class="flex overflow-hidden full-height">
      <!-- Desktop Sidebar - Full Height -->
      <aside class="hidden md:flex md:flex-shrink-0">
        <div
          class="flex flex-col w-64 bg-ivory dark:bg-poster-darkCard border-r border-navy/10 dark:border-poster-darkBorder h-full"
        >
          <div class="flex items-center flex-shrink-0 px-4 pt-5 pb-4">
            <h2 class="text-xl font-semibold text-navy dark:text-ivory">
              {{ $t('pages.admin.title') }}
            </h2>
          </div>
          <hr class="border-navy/10 dark:border-poster-darkBorder" />
          <nav class="flex-1 px-2 pt-4 space-y-2 overflow-y-auto">
            <template v-for="item in menuItems" :key="item.path">
              <a
                v-if="item.external"
                :href="item.path"
                class="text-navy/80 dark:text-ivory/80 hover:bg-sienna/5 dark:hover:bg-sienna/10 group flex items-center px-2 py-2 text-sm font-medium rounded-lg"
              >
                {{ item.label }}
              </a>
              <NuxtLink
                v-else
                :to="item.path"
                :class="[
                  isActive(item.path)
                    ? 'bg-sienna/10 text-sienna dark:bg-sienna/20 dark:text-sienna-light'
                    : 'text-navy/80 dark:text-ivory/80 hover:bg-sienna/5 dark:hover:bg-sienna/10',
                  'group flex items-center px-2 py-2 text-sm font-medium rounded-lg',
                ]"
              >
                {{ item.label }}
              </NuxtLink>
            </template>
          </nav>
        </div>
      </aside>

      <!-- Mobile Drawer Backdrop -->
      <div
        class="md:hidden fixed inset-0 bg-navy/60 z-40 transition-opacity ease-linear duration-300"
        :class="mobileMenuOpen ? 'bg-opacity-75' : 'opacity-0 pointer-events-none'"
        @click="mobileMenuOpen = false"
      ></div>

      <!-- Mobile Drawer -->
      <div
        class="md:hidden fixed inset-y-0 left-0 z-50 flex flex-col w-64 bg-ivory dark:bg-poster-darkCard shadow-xl drawer-slide"
        :class="mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'"
      >
        <div class="flex items-center justify-between flex-shrink-0 px-4 pt-5 pb-4">
          <h2 class="text-xl font-semibold text-navy dark:text-ivory">
            {{ $t('pages.admin.title') }}
          </h2>
          <button
            class="ml-1 flex items-center justify-center h-10 w-10 rounded-lg hover:bg-sienna/5 dark:hover:bg-sienna/10 focus:outline-none"
            @click="mobileMenuOpen = false"
          >
            <svg
              class="h-6 w-6 text-navy/60 dark:text-ivory/60"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <hr class="border-navy/10 dark:border-poster-darkBorder" />
        <nav class="flex-1 px-2 pt-4 space-y-2 overflow-y-auto">
          <template v-for="item in menuItems" :key="item.path">
            <a
              v-if="item.external"
              :href="item.path"
              class="text-navy/80 dark:text-ivory/80 hover:bg-sienna/5 dark:hover:bg-sienna/10 group flex items-center px-2 py-2 text-sm font-medium rounded-lg"
              @click="mobileMenuOpen = false"
            >
              {{ item.label }}
            </a>
            <NuxtLink
              v-else
              :to="item.path"
              :class="[
                isActive(item.path)
                  ? 'bg-sienna/10 text-sienna dark:bg-sienna/20 dark:text-sienna-light'
                  : 'text-navy/80 dark:text-ivory/80 hover:bg-sienna/5 dark:hover:bg-sienna/10',
                'group flex items-center px-2 py-2 text-sm font-medium rounded-lg',
              ]"
              @click="mobileMenuOpen = false"
            >
              {{ item.label }}
            </NuxtLink>
          </template>
        </nav>
      </div>

      <!-- Main Content -->
      <div class="flex-1 overflow-auto w-full">
        <main class="w-full min-h-full">
          <!-- Mobile Menu Button -->
          <div class="md:hidden flex items-center gap-3 px-4 pt-4 pb-3">
            <button
              class="p-2 text-navy/60 dark:text-ivory/60 bg-transparent rounded-lg hover:bg-sienna/5 dark:hover:bg-sienna/10 focus:outline-none focus:ring-4 focus:ring-navy/10 dark:focus:ring-ivory/10 transition-colors"
              @click="toggleMobileMenu"
            >
              <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-width="2"
                  d="M5 7h14M5 12h14M5 17h10"
                />
              </svg>
            </button>
            <div class="flex items-center gap-2 text-navy dark:text-ivory">
              <span class="font-semibold">{{ $t('pages.admin.title') }}</span>
              <!-- eslint-disable-next-line @intlify/vue-i18n/no-raw-text -->
              <span class="text-navy/40 dark:text-ivory/40">&mdash;</span>
              <span class="text-navy/80 dark:text-ivory/80">{{ currentPageTitle }}</span>
            </div>
          </div>
          <hr class="md:hidden border-navy/10 dark:border-poster-darkBorder" />

          <div class="w-full px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
            <NuxtPage />
          </div>
        </main>
      </div>
    </div>
  </div>
</template>

<style scoped>
  .full-height {
    height: 100%;
    height: -moz-available;
    height: -webkit-fill-available;
  }

  /* Drawer bounce transition */
  .drawer-slide {
    transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  /* Sidebar links hover slide */
  :deep(nav a),
  :deep(nav .group) {
    transition:
      transform 0.2s ease,
      background-color 0.15s ease;
  }
  :deep(nav a:hover),
  :deep(nav .group:hover) {
    transform: translateX(3px);
  }
</style>
