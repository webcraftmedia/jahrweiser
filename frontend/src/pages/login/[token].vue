<template>
  <div>
    <!-- Loading dots -->
    <div v-if="success" class="mt-8 animate-fade-slide-up">
      <div role="status" class="flex items-center gap-2">
        <span class="loading-dot" />
        <span class="loading-dot" style="animation-delay: 0.15s" />
        <span class="loading-dot" style="animation-delay: 0.3s" />
        <span class="sr-only">{{ $t('pages.login.token.loading') }}</span>
      </div>
    </div>

    <!-- Error alert -->
    <div v-else class="w-full max-w-md mt-8 animate-tilt-in">
      <div
        class="p-5 border-2 border-sienna/50 dark:border-sienna-dark/50 rounded bg-sienna/10 dark:bg-sienna/5 text-navy dark:text-ivory"
        role="alert"
      >
        <div class="flex items-center gap-2 mb-3">
          <svg
            class="shrink-0 w-5 h-5 text-sienna"
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
          <h3 class="text-lg font-display">{{ $t('pages.login.error.title') }}</h3>
        </div>
        <div class="mb-4 text-base font-body">
          <p class="font-medium">{{ $t('pages.login.error.text') }}</p>
        </div>
        <button
          class="px-5 py-2 text-base font-semibold font-body border-2 border-sienna text-sienna dark:text-sienna-light dark:border-sienna-dark rounded hover:bg-sienna hover:text-ivory dark:hover:bg-sienna-dark dark:hover:text-ivory transition-colors"
          type="button"
          @click="goHome"
        >
          {{ $t('pages.login.message.button') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  definePageMeta({ layout: 'login' })

  const { loggedIn, fetch: refreshSession } = useUserSession()

  if (loggedIn.value) {
    void navigateTo('/')
  }

  const route = useRoute()

  const success = ref(true)

  const goHome = () => navigateTo('/')

  onMounted(async () => {
    try {
      await $fetch('/api/redeemLoginLink', {
        method: 'POST',
        body: route.params,
      })
      await refreshSession()
      await navigateTo('/')
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      success.value = false
    }
  })
</script>
