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
  <div class="wc-admin-container">
    <div class="wc-admin-layout">
      <!-- Desktop Sidebar -->
      <aside class="wc-sidebar">
        <div class="wc-sidebar-inner">
          <div class="wc-sidebar-header">
            <h2 class="wc-sidebar-title">
              {{ $t('pages.admin.title') }}
            </h2>
          </div>
          <div class="wc-sidebar-divider"></div>
          <nav class="wc-sidebar-nav">
            <template v-for="item in menuItems" :key="item.path">
              <a
                v-if="item.external"
                :href="item.path"
                class="wc-nav-item"
              >
                <span class="wc-nav-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z" clip-rule="evenodd" />
                    <path fill-rule="evenodd" d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z" clip-rule="evenodd" />
                  </svg>
                </span>
                {{ item.label }}
              </a>
              <NuxtLink
                v-else
                :to="item.path"
                :class="['wc-nav-item', isActive(item.path) ? 'wc-nav-item-active' : '']"
              >
                <span class="wc-nav-indicator" :class="{ active: isActive(item.path) }"></span>
                {{ item.label }}
              </NuxtLink>
            </template>
          </nav>
        </div>
      </aside>

      <!-- Mobile Drawer Backdrop -->
      <Transition name="wc-backdrop">
        <div
          v-if="mobileMenuOpen"
          class="wc-mobile-backdrop"
          @click="mobileMenuOpen = false"
        ></div>
      </Transition>

      <!-- Mobile Drawer -->
      <Transition name="wc-drawer">
        <div
          v-if="mobileMenuOpen"
          class="wc-mobile-drawer"
        >
          <div class="wc-drawer-header">
            <h2 class="wc-drawer-title">
              {{ $t('pages.admin.title') }}
            </h2>
            <button
              class="wc-drawer-close"
              @click="mobileMenuOpen = false"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                <path fill-rule="evenodd" d="M5.47 5.47a.75.75 0 011.06 0L12 10.94l5.47-5.47a.75.75 0 111.06 1.06L13.06 12l5.47 5.47a.75.75 0 11-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 01-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 010-1.06z" clip-rule="evenodd" />
              </svg>
            </button>
          </div>
          <div class="wc-sidebar-divider"></div>
          <nav class="wc-sidebar-nav">
            <template v-for="item in menuItems" :key="item.path">
              <a
                v-if="item.external"
                :href="item.path"
                class="wc-nav-item"
                @click="mobileMenuOpen = false"
              >
                <span class="wc-nav-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z" clip-rule="evenodd" />
                    <path fill-rule="evenodd" d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z" clip-rule="evenodd" />
                  </svg>
                </span>
                {{ item.label }}
              </a>
              <NuxtLink
                v-else
                :to="item.path"
                :class="['wc-nav-item', isActive(item.path) ? 'wc-nav-item-active' : '']"
                @click="mobileMenuOpen = false"
              >
                <span class="wc-nav-indicator" :class="{ active: isActive(item.path) }"></span>
                {{ item.label }}
              </NuxtLink>
            </template>
          </nav>
        </div>
      </Transition>

      <!-- Main Content -->
      <div class="wc-admin-content">
        <main class="wc-admin-main">
          <!-- Mobile Menu Button -->
          <div class="wc-mobile-header">
            <button
              class="wc-mobile-menu-btn"
              @click="toggleMobileMenu"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                <path fill-rule="evenodd" d="M3 6.75A.75.75 0 013.75 6h16.5a.75.75 0 010 1.5H3.75A.75.75 0 013 6.75zM3 12a.75.75 0 01.75-.75h16.5a.75.75 0 010 1.5H3.75A.75.75 0 013 12zm0 5.25a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H3.75a.75.75 0 01-.75-.75z" clip-rule="evenodd" />
              </svg>
            </button>
            <div class="wc-mobile-title">
              <span class="wc-mobile-title-main">{{ $t('pages.admin.title') }}</span>
              <!-- eslint-disable-next-line @intlify/vue-i18n/no-raw-text -->
              <span class="wc-mobile-title-divider">&mdash;</span>
              <span class="wc-mobile-title-sub">{{ currentPageTitle }}</span>
            </div>
          </div>
          <div class="wc-mobile-divider"></div>

          <div class="wc-admin-page">
            <NuxtPage />
          </div>
        </main>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Container */
.wc-admin-container {
  width: 100%;
  flex: 1;
}

.wc-admin-layout {
  display: flex;
  overflow: hidden;
  height: 100%;
  height: -moz-available;
  height: -webkit-fill-available;
}

/* Desktop Sidebar */
.wc-sidebar {
  display: none;
  flex-shrink: 0;
}

@media (min-width: 768px) {
  .wc-sidebar {
    display: flex;
  }
}

.wc-sidebar-inner {
  display: flex;
  flex-direction: column;
  width: 16rem;
  height: 100%;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(12px);
  border-right: 1px solid rgba(248, 187, 217, 0.3);
}

.wc-sidebar-header {
  padding: 1.25rem 1rem 1rem;
}

.wc-sidebar-title,
.wc-drawer-title {
  font-family: 'Cormorant Garamond', serif;
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--wc-charcoal);
}

.wc-sidebar-divider {
  height: 2px;
  margin: 0 1rem;
  background: linear-gradient(90deg, var(--wc-rose-light) 0%, var(--wc-sky-light) 50%, var(--wc-mint-light) 100%);
  border-radius: 1px;
}

.wc-sidebar-nav {
  flex: 1;
  padding: 1rem 0.75rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

/* Navigation items */
.wc-nav-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  font-family: 'Quicksand', sans-serif;
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--wc-charcoal);
  text-decoration: none;
  border-radius: 12px;
  transition: all 0.3s ease;
  position: relative;
}

.wc-nav-item:hover {
  background: linear-gradient(135deg, var(--wc-rose-light) 0%, transparent 100%);
  color: var(--wc-rose-dark);
}

.wc-nav-item-active {
  background: linear-gradient(135deg, var(--wc-rose-light) 0%, var(--wc-sky-light) 100%);
  color: var(--wc-rose-dark);
  font-weight: 600;
}

.wc-nav-indicator {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 4px;
  height: 0;
  background: linear-gradient(180deg, var(--wc-rose) 0%, var(--wc-rose-dark) 100%);
  border-radius: 0 2px 2px 0;
  transition: height 0.3s ease;
}

.wc-nav-indicator.active {
  height: 60%;
}

.wc-nav-icon {
  width: 1rem;
  height: 1rem;
  color: var(--wc-charcoal-light);
}

.wc-nav-icon svg {
  width: 100%;
  height: 100%;
}

/* Mobile backdrop */
.wc-mobile-backdrop {
  display: block;
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgba(250, 249, 247, 0.8);
  backdrop-filter: blur(8px);
}

@media (min-width: 768px) {
  .wc-mobile-backdrop {
    display: none;
  }
}

/* Mobile drawer */
.wc-mobile-drawer {
  display: flex;
  flex-direction: column;
  position: fixed;
  inset: 0 auto 0 0;
  z-index: 50;
  width: 16rem;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(12px);
  box-shadow: 10px 0 40px -10px rgba(248, 187, 217, 0.3);
}

@media (min-width: 768px) {
  .wc-mobile-drawer {
    display: none;
  }
}

.wc-drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1rem 1rem;
}

.wc-drawer-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  border: none;
  background: var(--wc-rose-light);
  color: var(--wc-rose-dark);
  cursor: pointer;
  transition: all 0.3s ease;
}

.wc-drawer-close:hover {
  background: var(--wc-rose);
  transform: rotate(90deg);
}

.wc-drawer-close svg {
  width: 1.25rem;
  height: 1.25rem;
}

/* Transitions */
.wc-backdrop-enter-active,
.wc-backdrop-leave-active {
  transition: opacity 0.3s ease;
}

.wc-backdrop-enter-from,
.wc-backdrop-leave-to {
  opacity: 0;
}

.wc-drawer-enter-active,
.wc-drawer-leave-active {
  transition: transform 0.3s ease;
}

.wc-drawer-enter-from,
.wc-drawer-leave-to {
  transform: translateX(-100%);
}

/* Main content */
.wc-admin-content {
  flex: 1;
  overflow: auto;
  width: 100%;
}

.wc-admin-main {
  width: 100%;
  min-height: 100%;
}

/* Mobile header */
.wc-mobile-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
}

@media (min-width: 768px) {
  .wc-mobile-header {
    display: none;
  }
}

.wc-mobile-menu-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  border: none;
  background: linear-gradient(135deg, var(--wc-rose-light) 0%, var(--wc-sky-light) 100%);
  color: var(--wc-charcoal);
  cursor: pointer;
  transition: all 0.3s ease;
}

.wc-mobile-menu-btn:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 15px -3px rgba(248, 187, 217, 0.4);
}

.wc-mobile-menu-btn svg {
  width: 1.25rem;
  height: 1.25rem;
}

.wc-mobile-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-family: 'Quicksand', sans-serif;
}

.wc-mobile-title-main {
  font-weight: 600;
  color: var(--wc-charcoal);
}

.wc-mobile-title-divider {
  color: var(--wc-charcoal-light);
  opacity: 0.5;
}

.wc-mobile-title-sub {
  color: var(--wc-charcoal-light);
}

.wc-mobile-divider {
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(248, 187, 217, 0.3), transparent);
}

@media (min-width: 768px) {
  .wc-mobile-divider {
    display: none;
  }
}

/* Admin page content */
.wc-admin-page {
  width: 100%;
  padding: 1rem;
}

@media (min-width: 640px) {
  .wc-admin-page {
    padding: 1.5rem;
  }
}

@media (min-width: 1024px) {
  .wc-admin-page {
    padding: 2rem;
  }
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .wc-sidebar-inner {
    background: rgba(37, 37, 61, 0.9);
    border-right-color: rgba(206, 147, 216, 0.2);
  }

  .wc-sidebar-title,
  .wc-drawer-title {
    color: var(--wc-dark-text);
  }

  .wc-sidebar-divider {
    background: linear-gradient(90deg, rgba(244, 143, 177, 0.3) 0%, rgba(144, 202, 249, 0.3) 50%, rgba(165, 214, 167, 0.3) 100%);
  }

  .wc-nav-item {
    color: var(--wc-dark-text);
  }

  .wc-nav-item:hover {
    background: linear-gradient(135deg, rgba(244, 143, 177, 0.15) 0%, transparent 100%);
    color: var(--wc-dark-lavender);
  }

  .wc-nav-item-active {
    background: linear-gradient(135deg, rgba(244, 143, 177, 0.2) 0%, rgba(144, 202, 249, 0.2) 100%);
    color: var(--wc-dark-lavender);
  }

  .wc-nav-indicator {
    background: linear-gradient(180deg, var(--wc-dark-lavender) 0%, #9c27b0 100%);
  }

  .wc-nav-icon {
    color: var(--wc-dark-text-muted);
  }

  .wc-mobile-backdrop {
    background: rgba(26, 26, 46, 0.85);
  }

  .wc-mobile-drawer {
    background: rgba(37, 37, 61, 0.98);
    box-shadow: 10px 0 40px -10px rgba(0, 0, 0, 0.5);
  }

  .wc-drawer-close {
    background: rgba(244, 143, 177, 0.15);
    color: var(--wc-dark-lavender);
  }

  .wc-drawer-close:hover {
    background: rgba(206, 147, 216, 0.3);
  }

  .wc-mobile-menu-btn {
    background: linear-gradient(135deg, rgba(244, 143, 177, 0.2) 0%, rgba(144, 202, 249, 0.2) 100%);
    color: var(--wc-dark-text);
  }

  .wc-mobile-title-main {
    color: var(--wc-dark-text);
  }

  .wc-mobile-title-sub {
    color: var(--wc-dark-text-muted);
  }

  .wc-mobile-divider {
    background: linear-gradient(90deg, transparent, rgba(206, 147, 216, 0.2), transparent);
  }
}
</style>
