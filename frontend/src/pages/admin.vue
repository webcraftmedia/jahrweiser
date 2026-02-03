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
  <div class="admin-container">
    <div class="flex overflow-hidden full-height">
      <!-- Desktop Sidebar - Notebook Tabs -->
      <aside class="hidden md:flex md:flex-shrink-0">
        <div class="sidebar-notebook">
          <!-- Spiral binding -->
          <div class="spiral-binding"></div>

          <div class="sidebar-header">
            <h2 class="sidebar-title">
              {{ $t('pages.admin.title') }}
            </h2>
          </div>

          <hr class="sketchy-divider mx-3" />

          <nav class="sidebar-nav">
            <template v-for="(item, index) in menuItems" :key="item.path">
              <a
                v-if="item.external"
                :href="item.path"
                class="nav-tab"
              >
                <span class="tab-number">{{ index + 1 }}.</span>
                {{ item.label }}
              </a>
              <NuxtLink
                v-else
                :to="item.path"
                :class="['nav-tab', { 'nav-tab-active': isActive(item.path) }]"
              >
                <span class="tab-number">{{ index + 1 }}.</span>
                {{ item.label }}
                <span v-if="isActive(item.path)" class="bookmark"></span>
              </NuxtLink>
            </template>
          </nav>
        </div>
      </aside>

      <!-- Mobile Drawer Backdrop -->
      <Transition
        enter-active-class="transition-opacity ease-linear duration-300"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition-opacity ease-linear duration-300"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div
          v-if="mobileMenuOpen"
          class="md:hidden fixed inset-0 bg-ink-dark/50 dark:bg-black/70 z-40 backdrop-blur-sm"
          @click="mobileMenuOpen = false"
        ></div>
      </Transition>

      <!-- Mobile Drawer -->
      <Transition
        enter-active-class="transition ease-in-out duration-300 transform"
        enter-from-class="-translate-x-full"
        enter-to-class="translate-x-0"
        leave-active-class="transition ease-in-out duration-300 transform"
        leave-from-class="translate-x-0"
        leave-to-class="-translate-x-full"
      >
        <div
          v-if="mobileMenuOpen"
          class="mobile-drawer"
        >
          <div class="mobile-drawer-header">
            <h2 class="mobile-drawer-title">
              {{ $t('pages.admin.title') }}
            </h2>
            <button
              class="close-drawer-btn"
              @click="mobileMenuOpen = false"
            >
              <svg
                class="h-5 w-5"
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

          <hr class="sketchy-divider mx-3" />

          <nav class="mobile-nav stagger-children">
            <template v-for="(item, index) in menuItems" :key="item.path">
              <a
                v-if="item.external"
                :href="item.path"
                class="mobile-nav-item"
                @click="mobileMenuOpen = false"
              >
                <span class="tab-number">{{ index + 1 }}.</span>
                {{ item.label }}
              </a>
              <NuxtLink
                v-else
                :to="item.path"
                :class="['mobile-nav-item', { 'mobile-nav-item-active': isActive(item.path) }]"
                @click="mobileMenuOpen = false"
              >
                <span class="tab-number">{{ index + 1 }}.</span>
                {{ item.label }}
              </NuxtLink>
            </template>
          </nav>
        </div>
      </Transition>

      <!-- Main Content -->
      <div class="flex-1 overflow-auto w-full">
        <main class="w-full min-h-full">
          <!-- Mobile Menu Button -->
          <div class="md:hidden mobile-header">
            <button
              class="mobile-menu-btn"
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
            <div class="mobile-breadcrumb">
              <span class="breadcrumb-title">{{ $t('pages.admin.title') }}</span>
              <!-- eslint-disable-next-line @intlify/vue-i18n/no-raw-text -->
              <span class="breadcrumb-separator">&mdash;</span>
              <span class="breadcrumb-current">{{ currentPageTitle }}</span>
            </div>
          </div>

          <hr class="md:hidden sketchy-divider" />

          <div class="content-area">
            <NuxtPage />
          </div>
        </main>
      </div>
    </div>
  </div>
</template>

<style scoped>
.admin-container {
  background-color: var(--paper-light);
  width: 100%;
  flex: 1;
  border-left: 2px solid var(--paper-lines);
  border-right: 2px solid var(--paper-lines);
}

@media (prefers-color-scheme: dark) {
  .admin-container {
    background-color: var(--paper-dark);
    border-color: var(--paper-lines-dark);
  }
}

.full-height {
  height: 100%;
  height: -moz-available;
  height: -webkit-fill-available;
}

/* Sidebar Notebook Style */
.sidebar-notebook {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 16rem;
  background-color: var(--paper-light);
  border-right: 2px solid var(--ink-dark);
  height: 100%;
}

@media (prefers-color-scheme: dark) {
  .sidebar-notebook {
    background-color: var(--paper-dark);
    border-right-color: var(--ink-light);
  }
}

.spiral-binding {
  position: absolute;
  right: -8px;
  top: 20px;
  bottom: 20px;
  width: 6px;
  background: repeating-linear-gradient(
    to bottom,
    var(--ink-dark) 0px,
    var(--ink-dark) 8px,
    transparent 8px,
    transparent 20px
  );
  opacity: 0.3;
  border-radius: 3px;
}

@media (prefers-color-scheme: dark) {
  .spiral-binding {
    background: repeating-linear-gradient(
      to bottom,
      var(--ink-light) 0px,
      var(--ink-light) 8px,
      transparent 8px,
      transparent 20px
    );
  }
}

.sidebar-header {
  padding: 1.25rem 1rem 1rem;
}

.sidebar-title {
  font-family: 'Caveat', cursive;
  font-size: 1.75rem;
  font-weight: 600;
  color: var(--ink-dark);
}

@media (prefers-color-scheme: dark) {
  .sidebar-title {
    color: var(--ink-light);
  }
}

.sidebar-nav {
  flex: 1;
  padding: 1rem 0.5rem;
  overflow-y: auto;
}

.nav-tab {
  position: relative;
  display: flex;
  align-items: center;
  padding: 0.75rem 1rem;
  margin-bottom: 0.5rem;
  font-family: 'Patrick Hand', cursive;
  font-size: 1.1rem;
  color: var(--ink-dark);
  border-radius: 8px;
  transition: all 0.2s ease;
  text-decoration: none;
}

.nav-tab:hover {
  background-color: rgba(74, 111, 165, 0.1);
  color: var(--ink-blue);
  transform: translateX(4px);
}

@media (prefers-color-scheme: dark) {
  .nav-tab {
    color: var(--ink-light);
  }

  .nav-tab:hover {
    background-color: rgba(106, 143, 197, 0.15);
    color: var(--ink-blue-dark);
  }
}

.nav-tab-active {
  background-color: rgba(74, 111, 165, 0.15);
  color: var(--ink-blue);
  font-weight: 500;
}

@media (prefers-color-scheme: dark) {
  .nav-tab-active {
    background-color: rgba(106, 143, 197, 0.2);
    color: var(--ink-blue-dark);
  }
}

.tab-number {
  font-family: 'Kalam', cursive;
  margin-right: 0.5rem;
  opacity: 0.6;
}

/* Bookmark effect for active tab */
.bookmark {
  position: absolute;
  right: -2px;
  top: 50%;
  transform: translateY(-50%);
  width: 8px;
  height: 24px;
  background-color: var(--accent-terracotta);
  border-radius: 0 4px 4px 0;
}

@media (prefers-color-scheme: dark) {
  .bookmark {
    background-color: var(--accent-terracotta-dark);
  }
}

/* Mobile Drawer */
.mobile-drawer {
  position: fixed;
  inset-y: 0;
  left: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  width: 16rem;
  background-color: var(--paper-light);
  border-right: 2px solid var(--ink-dark);
  box-shadow: 4px 0 10px rgba(44, 36, 22, 0.2);
}

@media (prefers-color-scheme: dark) {
  .mobile-drawer {
    background-color: var(--paper-dark);
    border-right-color: var(--ink-light);
    box-shadow: 4px 0 10px rgba(0, 0, 0, 0.4);
  }
}

.mobile-drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1rem;
}

.mobile-drawer-title {
  font-family: 'Caveat', cursive;
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--ink-dark);
}

@media (prefers-color-scheme: dark) {
  .mobile-drawer-title {
    color: var(--ink-light);
  }
}

.close-drawer-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  color: var(--ink-dark);
  border-radius: 8px;
  transition: all 0.2s ease;
}

.close-drawer-btn:hover {
  background-color: rgba(44, 36, 22, 0.1);
}

@media (prefers-color-scheme: dark) {
  .close-drawer-btn {
    color: var(--ink-light);
  }

  .close-drawer-btn:hover {
    background-color: rgba(245, 240, 230, 0.1);
  }
}

.mobile-nav {
  flex: 1;
  padding: 1rem 0.5rem;
  overflow-y: auto;
}

.mobile-nav-item {
  display: flex;
  align-items: center;
  padding: 0.75rem 1rem;
  margin-bottom: 0.5rem;
  font-family: 'Patrick Hand', cursive;
  font-size: 1.1rem;
  color: var(--ink-dark);
  border-radius: 8px;
  transition: all 0.2s ease;
  text-decoration: none;
}

.mobile-nav-item:hover {
  background-color: rgba(74, 111, 165, 0.1);
  color: var(--ink-blue);
}

@media (prefers-color-scheme: dark) {
  .mobile-nav-item {
    color: var(--ink-light);
  }

  .mobile-nav-item:hover {
    background-color: rgba(106, 143, 197, 0.15);
    color: var(--ink-blue-dark);
  }
}

.mobile-nav-item-active {
  background-color: rgba(74, 111, 165, 0.15);
  color: var(--ink-blue);
  font-weight: 500;
}

@media (prefers-color-scheme: dark) {
  .mobile-nav-item-active {
    background-color: rgba(106, 143, 197, 0.2);
    color: var(--ink-blue-dark);
  }
}

/* Mobile Header */
.mobile-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
}

.mobile-menu-btn {
  padding: 0.5rem;
  color: var(--ink-dark);
  border-radius: 8px;
  transition: all 0.2s ease;
}

.mobile-menu-btn:hover {
  background-color: rgba(44, 36, 22, 0.1);
}

@media (prefers-color-scheme: dark) {
  .mobile-menu-btn {
    color: var(--ink-light);
  }

  .mobile-menu-btn:hover {
    background-color: rgba(245, 240, 230, 0.1);
  }
}

.mobile-breadcrumb {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.breadcrumb-title {
  font-family: 'Caveat', cursive;
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--ink-dark);
}

.breadcrumb-separator {
  color: var(--ink-dark);
  opacity: 0.4;
}

.breadcrumb-current {
  font-family: 'Patrick Hand', cursive;
  font-size: 1.1rem;
  color: var(--ink-blue);
}

@media (prefers-color-scheme: dark) {
  .breadcrumb-title {
    color: var(--ink-light);
  }

  .breadcrumb-separator {
    color: var(--ink-light);
  }

  .breadcrumb-current {
    color: var(--ink-blue-dark);
  }
}

/* Content Area */
.content-area {
  width: 100%;
  padding: 1rem;
}

@media (min-width: 640px) {
  .content-area {
    padding: 1.5rem;
  }
}

@media (min-width: 1024px) {
  .content-area {
    padding: 2rem;
  }
}
</style>
