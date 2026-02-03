<!-- eslint-disable vue/multi-word-component-names -->
<template>
  <nav class="wc-header">
    <div class="max-w-screen-xl flex flex-wrap items-center justify-between mx-auto p-3">
      <NuxtLink to="/" class="wc-logo-link flex items-center space-x-3 rtl:space-x-reverse">
        <HeaderLogo />
      </NuxtLink>

      <!-- Burger menu button (mobile only) -->
      <button
        v-if="loggedIn"
        type="button"
        class="wc-menu-toggle md:hidden"
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
        <p class="wc-welcome-text">
          {{ $t('components.Header.welcome') }} <span class="wc-user-name">{{ welcomeName }}</span>
        </p>
        <div class="wc-nav-links">
          <NuxtLink
            v-if="user?.role === 'admin'"
            to="/admin/members/add"
            class="wc-nav-link"
          >
            {{ $t('components.Header.admin') }}
          </NuxtLink>
          <button
            class="wc-nav-link"
            @click="logout"
          >
            {{ $t('components.Header.logout') }}
          </button>
        </div>
      </div>

      <!-- Mobile menu dropdown -->
      <Transition name="wc-dropdown">
        <div
          v-if="loggedIn && mobileMenuOpen"
          id="navbar-mobile"
          class="w-full md:hidden mt-3"
        >
          <div class="wc-mobile-menu">
            <!-- User Info Header -->
            <div class="wc-mobile-header">
              <p class="wc-mobile-label">
                {{ $t('components.Header.welcome') }}
              </p>
              <p class="wc-mobile-name">
                {{ welcomeName }}
              </p>
            </div>

            <!-- Menu Items -->
            <nav class="py-2">
              <NuxtLink
                v-if="user?.role === 'admin'"
                to="/admin/members/add"
                class="wc-mobile-link"
                @click="toggleMobileMenu"
              >
                {{ $t('components.Header.admin') }}
              </NuxtLink>
              <button
                class="wc-mobile-link"
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
.wc-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 50;
  background: rgba(250, 249, 247, 0.85);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(248, 187, 217, 0.3);
  box-shadow: 0 4px 20px -5px rgba(248, 187, 217, 0.2);
}

.wc-logo-link {
  transition: transform 0.3s ease;
}

.wc-logo-link:hover {
  transform: scale(1.02);
}

.wc-menu-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  color: var(--wc-charcoal);
  background: linear-gradient(135deg, var(--wc-rose-light) 0%, var(--wc-sky-light) 100%);
  border: none;
  transition: all 0.3s ease;
}

.wc-menu-toggle:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 15px -3px rgba(248, 187, 217, 0.4);
}

.wc-welcome-text {
  font-family: 'Quicksand', sans-serif;
  font-size: 0.875rem;
  color: var(--wc-charcoal-light);
}

.wc-user-name {
  font-family: 'Dancing Script', cursive;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--wc-rose-dark);
}

.wc-nav-links {
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
  margin-top: 0.25rem;
}

.wc-nav-link {
  font-family: 'Quicksand', sans-serif;
  font-weight: 500;
  font-size: 0.875rem;
  color: var(--wc-charcoal);
  background: none;
  border: none;
  padding: 0.25rem 0.5rem;
  border-radius: 8px;
  cursor: pointer;
  position: relative;
  transition: all 0.3s ease;
}

.wc-nav-link::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 50%;
  width: 0;
  height: 2px;
  background: linear-gradient(90deg, var(--wc-rose) 0%, var(--wc-sky) 100%);
  transition: all 0.3s ease;
  transform: translateX(-50%);
  border-radius: 1px;
}

.wc-nav-link:hover {
  color: var(--wc-rose-dark);
}

.wc-nav-link:hover::after {
  width: 80%;
}

/* Mobile menu */
.wc-mobile-menu {
  background: rgba(250, 249, 247, 0.95);
  backdrop-filter: blur(12px);
  border-radius: 16px;
  border: 1px solid rgba(248, 187, 217, 0.3);
  box-shadow: 0 10px 40px -10px rgba(248, 187, 217, 0.3);
  overflow: hidden;
}

.wc-mobile-header {
  padding: 1rem;
  background: linear-gradient(135deg, var(--wc-rose-light) 0%, var(--wc-sky-light) 100%);
  border-bottom: 1px solid rgba(248, 187, 217, 0.3);
}

.wc-mobile-label {
  font-family: 'Quicksand', sans-serif;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--wc-charcoal-light);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.wc-mobile-name {
  font-family: 'Dancing Script', cursive;
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--wc-rose-dark);
  margin-top: 0.25rem;
}

.wc-mobile-link {
  display: block;
  width: 100%;
  text-align: left;
  padding: 0.75rem 1rem;
  font-family: 'Quicksand', sans-serif;
  font-weight: 500;
  font-size: 0.9rem;
  color: var(--wc-charcoal);
  background: none;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
}

.wc-mobile-link:hover {
  background: linear-gradient(90deg, var(--wc-rose-light) 0%, transparent 100%);
  color: var(--wc-rose-dark);
}

/* Dropdown animation */
.wc-dropdown-enter-active,
.wc-dropdown-leave-active {
  transition: all 0.3s ease;
}

.wc-dropdown-enter-from,
.wc-dropdown-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .wc-header {
    background: rgba(26, 26, 46, 0.9);
    border-bottom-color: rgba(206, 147, 216, 0.2);
    box-shadow: 0 4px 20px -5px rgba(0, 0, 0, 0.3);
  }

  .wc-menu-toggle {
    color: var(--wc-dark-text);
    background: linear-gradient(135deg, rgba(244, 143, 177, 0.2) 0%, rgba(144, 202, 249, 0.2) 100%);
  }

  .wc-welcome-text {
    color: var(--wc-dark-text-muted);
  }

  .wc-user-name {
    color: var(--wc-dark-lavender);
  }

  .wc-nav-link {
    color: var(--wc-dark-text);
  }

  .wc-nav-link:hover {
    color: var(--wc-dark-lavender);
  }

  .wc-nav-link::after {
    background: linear-gradient(90deg, var(--wc-dark-lavender) 0%, var(--wc-dark-sky) 100%);
  }

  .wc-mobile-menu {
    background: rgba(37, 37, 61, 0.95);
    border-color: rgba(206, 147, 216, 0.2);
  }

  .wc-mobile-header {
    background: linear-gradient(135deg, rgba(244, 143, 177, 0.15) 0%, rgba(144, 202, 249, 0.15) 100%);
    border-bottom-color: rgba(206, 147, 216, 0.2);
  }

  .wc-mobile-label {
    color: var(--wc-dark-text-muted);
  }

  .wc-mobile-name {
    color: var(--wc-dark-lavender);
  }

  .wc-mobile-link {
    color: var(--wc-dark-text);
  }

  .wc-mobile-link:hover {
    background: linear-gradient(90deg, rgba(206, 147, 216, 0.15) 0%, transparent 100%);
    color: var(--wc-dark-lavender);
  }
}
</style>
