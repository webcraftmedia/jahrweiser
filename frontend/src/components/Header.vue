<!-- eslint-disable vue/multi-word-component-names -->
<template>
  <nav class="header-nav w-full fixed top-0 z-50">
    <div class="max-w-screen-xl flex flex-wrap items-center justify-between mx-auto p-2">
      <NuxtLink to="/" class="flex items-center space-x-3 rtl:space-x-reverse hover-wobble">
        <HeaderLogo />
      </NuxtLink>

      <!-- Burger menu button (mobile only) -->
      <button
        v-if="loggedIn"
        type="button"
        class="burger-button inline-flex items-center p-2 w-10 h-10 justify-center md:hidden"
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
        class="hidden md:block text-right"
      >
        <p class="sketchy-text text-ink-dark dark:text-ink-light">
          {{ $t('components.Header.welcome') }} <b class="font-sketch-accent">{{ welcomeName }}</b>
        </p>
        <div class="space-x-4">
          <NuxtLink
            v-if="user?.role === 'admin'"
            to="/admin/members/add"
            class="nav-link"
          >
            {{ $t('components.Header.admin') }}
          </NuxtLink>
          <button
            class="nav-link"
            @click="logout"
          >
            {{ $t('components.Header.logout') }}
          </button>
        </div>
      </div>

      <!-- Mobile menu dropdown -->
      <Transition
        enter-active-class="animate-unfold"
        leave-active-class="animate-fold-away"
      >
        <div
          v-if="loggedIn && mobileMenuOpen"
          id="navbar-mobile"
          class="w-full md:hidden mt-2"
        >
          <div class="mobile-menu-card">
            <!-- User Info Header -->
            <div class="mobile-menu-header">
              <p class="text-xs font-sketch-body uppercase tracking-wider opacity-70">
                {{ $t('components.Header.welcome') }}
              </p>
              <p class="mt-1 font-sketch-accent text-lg truncate">
                {{ welcomeName }}
              </p>
            </div>

            <hr class="sketchy-divider my-2" />

            <!-- Menu Items -->
            <nav class="py-2 stagger-children">
              <NuxtLink
                v-if="user?.role === 'admin'"
                to="/admin/members/add"
                class="mobile-nav-link"
                @click="toggleMobileMenu"
              >
                {{ $t('components.Header.admin') }}
              </NuxtLink>
              <button
                class="mobile-nav-link"
                @click="logout"
              >
                {{ $t('components.Header.logout') }}
              </button>
            </nav>
          </div>
        </div>
      </Transition>
    </div>
  </nav>
</template>

<script setup lang="ts">
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
.header-nav {
  background-color: var(--paper-light);
  border-bottom: 2px solid var(--ink-dark);
  box-shadow: 0 2px 0 rgba(44, 36, 22, 0.1);
}

@media (prefers-color-scheme: dark) {
  .header-nav {
    background-color: var(--paper-dark);
    border-bottom-color: var(--ink-light);
    box-shadow: 0 2px 0 rgba(245, 240, 230, 0.05);
  }
}

.burger-button {
  font-family: 'Patrick Hand', cursive;
  color: var(--ink-dark);
  border-radius: 8px;
  transition: all 0.2s ease;
}

.burger-button:hover {
  background-color: rgba(44, 36, 22, 0.1);
  animation: wobble 0.5s ease-in-out;
}

@media (prefers-color-scheme: dark) {
  .burger-button {
    color: var(--ink-light);
  }

  .burger-button:hover {
    background-color: rgba(245, 240, 230, 0.1);
  }
}

.nav-link {
  font-family: 'Patrick Hand', cursive;
  font-size: 1.1rem;
  color: var(--ink-blue);
  position: relative;
  transition: color 0.2s ease;
}

.nav-link::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 0;
  width: 0;
  height: 2px;
  background-color: var(--ink-blue);
  border-radius: 2px;
  transition: width 0.3s ease;
}

.nav-link:hover {
  color: var(--ink-dark);
}

.nav-link:hover::after {
  width: 100%;
}

@media (prefers-color-scheme: dark) {
  .nav-link {
    color: var(--ink-blue-dark);
  }

  .nav-link::after {
    background-color: var(--ink-blue-dark);
  }

  .nav-link:hover {
    color: var(--ink-light);
  }
}

.mobile-menu-card {
  background-color: var(--paper-light);
  border: 2px solid var(--ink-dark);
  border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
  box-shadow: 4px 4px 0 rgba(44, 36, 22, 0.2);
  overflow: hidden;
  padding: 0.5rem;
}

@media (prefers-color-scheme: dark) {
  .mobile-menu-card {
    background-color: var(--paper-dark);
    border-color: var(--ink-light);
    box-shadow: 4px 4px 0 rgba(245, 240, 230, 0.1);
  }
}

.mobile-menu-header {
  padding: 0.75rem 1rem;
  color: var(--ink-dark);
}

@media (prefers-color-scheme: dark) {
  .mobile-menu-header {
    color: var(--ink-light);
  }
}

.mobile-nav-link {
  display: block;
  width: 100%;
  text-align: left;
  padding: 0.75rem 1rem;
  font-family: 'Patrick Hand', cursive;
  font-size: 1.1rem;
  color: var(--ink-dark);
  border-radius: 8px;
  transition: all 0.2s ease;
}

.mobile-nav-link:hover {
  background-color: rgba(74, 111, 165, 0.1);
  color: var(--ink-blue);
  transform: translateX(4px);
}

@media (prefers-color-scheme: dark) {
  .mobile-nav-link {
    color: var(--ink-light);
  }

  .mobile-nav-link:hover {
    background-color: rgba(106, 143, 197, 0.15);
    color: var(--ink-blue-dark);
  }
}
</style>
