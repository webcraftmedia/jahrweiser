<template>
  <!-- Email sent confirmation -->
  <div v-if="requestedLogin" class="w-full max-w-md mt-8">
    <div
      class="p-5 border-2 border-mustard/50 dark:border-mustard/30 rounded bg-mustard/10 dark:bg-mustard/5 text-navy dark:text-ivory"
      role="alert"
    >
      <div class="flex items-center gap-2 mb-3">
        <svg
          class="shrink-0 w-5 h-5 text-mustard"
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
        <h3 class="text-lg font-display">{{ $t('pages.login.message.title') }}</h3>
      </div>
      <div class="mb-4 text-sm font-body">
        <p class="font-bold">{{ $t('pages.login.message.text1') }}</p>
        <p>{{ $t('pages.login.message.text2') }}</p>
        <p class="pt-2 text-navy/70 dark:text-poster-darkMuted">
          {{ $t('pages.login.message.hint') }}
        </p>
      </div>
      <button
        class="px-4 py-1.5 text-sm font-semibold font-body border-2 border-sienna text-sienna dark:text-sienna-light dark:border-sienna-dark rounded hover:bg-sienna hover:text-ivory dark:hover:bg-sienna-dark dark:hover:text-ivory transition-colors"
        type="button"
        @click.prevent="showLogin"
      >
        {{ $t('pages.login.message.button') }}
      </button>
    </div>
  </div>

  <!-- Login form -->
  <div v-else class="w-full max-w-sm mt-8">
    <div
      class="p-6 sm:p-8 bg-white/80 dark:bg-poster-darkCard border-2 border-navy/15 dark:border-poster-darkBorder rounded shadow-lg"
    >
      <form class="space-y-6" @submit.prevent="requestLoginLink">
        <h5 class="text-2xl font-display text-navy dark:text-ivory">
          {{ $t('pages.login.form.title') }}
        </h5>
        <div>
          <label
            for="email-address-icon"
            class="block mb-2 text-sm font-semibold font-body text-navy dark:text-ivory"
          >
            {{ $t('pages.login.form.email.label') }}
          </label>
          <div class="relative">
            <div class="absolute inset-y-0 start-0 flex items-center ps-3.5 pointer-events-none">
              <svg
                class="w-4 h-4 text-navy/40 dark:text-poster-darkMuted"
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
              class="bg-ivory dark:bg-poster-dark border-2 border-navy/20 dark:border-poster-darkBorder text-navy dark:text-ivory text-sm rounded font-body focus:ring-sienna focus:border-sienna dark:focus:ring-sienna-dark dark:focus:border-sienna-dark block w-full ps-10 p-2.5 placeholder-navy/40 dark:placeholder-poster-darkMuted"
              :placeholder="$t('pages.login.form.email.placeholder')"
            />
          </div>
        </div>
        <button
          type="submit"
          class="w-full text-ivory bg-sienna hover:bg-sienna-light dark:bg-sienna-dark dark:hover:bg-sienna focus:ring-4 focus:outline-none focus:ring-sienna/30 font-semibold font-body rounded text-sm px-5 py-2.5 text-center transition-colors"
        >
          {{ $t('pages.login.form.button') }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
  definePageMeta({ layout: 'login' })

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
