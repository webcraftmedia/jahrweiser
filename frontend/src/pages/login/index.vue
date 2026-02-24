<template>
  <div v-if="requestedLogin" class="flex w-full">
    <div
      id="alert-additional-content-1"
      class="max-w-md m-auto mt-8 p-4 text-blue-800 border border-blue-300 rounded-lg bg-blue-50 dark:bg-gray-800 dark:text-blue-400 dark:border-blue-800"
      role="alert"
    >
      <div class="flex items-center">
        <svg
          class="shrink-0 w-4 h-4 me-2"
          aria-hidden="true"
          xmlns="http://www.w3.org/2000/svg"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            d="M10 .5a9.5 9.5 0 1 0 9.5 9.5A9.51 9.51 0 0 0 10 .5ZM9.5 4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM12 15H8a1 1 0 0 1 0-2h1v-3H8a1 1 0 0 1 0-2h2a1 1 0 0 1 1 1v4h1a1 1 0 0 1 0 2Z"
          />
        </svg>
        <span class="sr-only">{{ $t('pages.login.message.info') }}</span>
        <h3 class="text-lg font-medium">{{ $t('pages.login.message.title') }}</h3>
      </div>
      <div class="mt-2 mb-4 text-sm">
        <p class="font-bold">{{ $t('pages.login.message.text1') }}</p>
        <p>{{ $t('pages.login.message.text2') }}</p>
        <p class="pt-2">{{ $t('pages.login.message.hint') }}</p>
      </div>
      <div class="flex">
        <button
          data-dismiss-target="#alert-additional-content-1"
          class="text-blue-800 bg-transparent border border-blue-800 hover:bg-blue-900 hover:text-white focus:ring-4 focus:outline-none focus:ring-blue-200 font-medium rounded-lg text-xs px-3 py-1.5 text-center dark:hover:bg-blue-600 dark:border-blue-600 dark:text-blue-400 dark:hover:text-white dark:focus:ring-blue-800"
          type="button"
          aria-label="Close"
          @click.prevent="showLogin"
        >
          {{ $t('pages.login.message.button') }}
        </button>
      </div>
    </div>
  </div>
  <div v-else class="flex w-full">
    <div
      class="m-auto mt-8 w-full max-w-sm p-4 bg-white border border-gray-200 rounded-lg shadow-sm sm:p-6 md:p-8 dark:bg-gray-800 dark:border-gray-700"
    >
      <form class="space-y-6" @submit.prevent="requestLoginLink">
        <h5 class="text-xl font-medium text-gray-900 dark:text-white">
          {{ $t('pages.login.form.title') }}
        </h5>
        <div>
          <label for="email" class="block mb-2 text-sm font-medium text-gray-900 dark:text-white">
            {{ $t('pages.login.form.email.label') }}
          </label>
          <div class="relative">
            <div class="absolute inset-y-0 start-0 flex items-center ps-3.5 pointer-events-none">
              <svg
                class="w-4 h-4 text-gray-500 dark:text-gray-400"
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                fill="currentColor"
                viewBox="0 0 20 16"
              >
                <path
                  d="m10.036 8.278 9.258-7.79A1.979 1.979 0 0 0 18 0H2A1.987 1.987 0 0 0 .641.541l9.395 7.737Z"
                />
                <path
                  d="M11.241 9.817c-.36.275-.801.425-1.255.427-.428 0-.845-.138-1.187-.395L0 2.6V14a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V2.5l-8.759 7.317Z"
                />
              </svg>
            </div>
            <input
              id="email-address-icon"
              v-model="credentials.email"
              type="text"
              class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full ps-10 p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
              :placeholder="$t('pages.login.form.email.placeholder')"
            />
          </div>
        </div>
        <button
          type="submit"
          class="w-full text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
        >
          {{ $t('pages.login.form.button') }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
  const { loggedIn } = useUserSession()

  if (loggedIn.value) {
    void navigateTo('/')
  }

  const requestedLogin = ref(false)

  const credentials = reactive({
    email: '',
  })

  async function requestLoginLink() {
    await $fetch('/api/requestLoginLink', {
      method: 'POST',
      body: credentials,
    })
    requestedLogin.value = true
  }

  function showLogin() {
    requestedLogin.value = false
  }
</script>
