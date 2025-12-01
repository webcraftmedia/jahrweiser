<!-- eslint-disable vue/multi-word-component-names -->
<template>
  <nav class="bg-white border-gray-200 dark:bg-gray-900 shadow-sm w-full fixed top-0 z-50">
    <div class="max-w-screen-xl flex flex-wrap items-center justify-between mx-auto p-2">
      <NuxtLink to="/" class="flex items-center space-x-3 rtl:space-x-reverse">
        <HeaderLogo />
      </NuxtLink>

      <!-- Burger menu button (mobile only) -->
      <button
        v-if="loggedIn"
        type="button"
        class="inline-flex items-center p-2 w-10 h-10 justify-center text-sm text-gray-500 rounded-lg md:hidden hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-200 dark:text-gray-400 dark:hover:bg-gray-700 dark:focus:ring-gray-600"
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
        class="hidden md:block text-right text-gray-900 dark:text-gray-100"
      >
        <p>
          {{ $t('components.Header.welcome') }} <b>{{ welcomeName }}</b>
        </p>
        <button
          class="hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          @click="logout"
        >
          {{ $t('components.Header.logout') }}
        </button>
      </div>

      <!-- Mobile menu dropdown -->
      <div
        v-if="loggedIn"
        id="navbar-mobile"
        :class="mobileMenuOpen ? 'block' : 'hidden'"
        class="w-full md:hidden mt-2"
      >
        <div class="bg-gray-50 dark:bg-gray-800 rounded-lg shadow-lg p-4 text-gray-900 dark:text-gray-100">
          <p class="mb-3 text-sm">
            {{ $t('components.Header.welcome') }} <b>{{ welcomeName }}</b>
          </p>
          <button
            class="w-full text-left px-3 py-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            @click="logout"
          >
            {{ $t('components.Header.logout') }}
          </button>
        </div>
      </div>
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
