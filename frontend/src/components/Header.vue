<!-- eslint-disable vue/multi-word-component-names -->
<template>
  <nav class="bg-white border-gray-200 dark:bg-gray-900 shadow-sm w-full fixed top-0">
    <div class="max-w-screen-xl flex flex-wrap items-center justify-between mx-auto p-2">
      <NuxtLink
        to="/"
        class="flex items-center space-x-3 rtl:space-x-reverse"
      >
        <HeaderLogo />
      </NuxtLink>
      <button
        data-collapse-toggle="navbar-default"
        type="button"
        class="inline-flex items-center p-2 w-10 h-10 justify-center text-sm text-gray-500 rounded-lg md:hidden hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-200 dark:text-gray-400 dark:hover:bg-gray-700 dark:focus:ring-gray-600"
        aria-controls="navbar-default"
        aria-expanded="false"
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
      <div v-if="loggedIn" id="navbar-default" class="hidden w-full md:block md:w-auto text-right">
        <p>Welcome <b>{{ welcomeName }}</b></p>
        <button @click="logout">
          ↪ Logout
        </button>
      </div>
    </div>
  </nav>
</template>

<script setup lang="ts">
const welcomeName = ref()
const {user, loggedIn,  clear: clearSession}= useUserSession()

welcomeName.value = computed(() => user.value?.name ? user.value.name.split(' ').slice(-1).pop() : user.value?.email)

async function logout () {
  await clearSession()
  await navigateTo('/login')
}

</script>
