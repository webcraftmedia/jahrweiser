<template>
  <Transition name="login-switch" mode="out-in">
  <!-- Email sent confirmation -->
  <div v-if="requestedLogin" key="confirmation" class="w-full max-w-md mt-8">
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
      <div class="mb-4 text-base font-body">
        <p class="font-medium">{{ $t('pages.login.message.text1') }}</p>
        <p class="mt-2">{{ $t('pages.login.message.text2') }}</p>
      </div>
      <button
        class="px-5 py-2 text-base font-semibold font-body border-2 border-sienna text-sienna dark:text-sienna-light dark:border-sienna-dark rounded hover:bg-sienna hover:text-ivory dark:hover:bg-sienna-dark dark:hover:text-ivory transition-colors"
        type="button"
        @click.prevent="showLogin"
      >
        {{ $t('pages.login.message.button') }}
      </button>
    </div>
    <p class="my-4 text-sm font-body text-navy/60 dark:text-poster-darkMuted text-center">
      {{ $t('pages.login.message.hint') }}
    </p>
  </div>

  <!-- Login form -->
  <div v-else key="form" class="w-full max-w-sm mt-8">
    <div class="login-card-float">
    <div
      class="login-card p-6 sm:p-8 bg-white/80 dark:bg-poster-darkCard border-2 border-navy/15 dark:border-poster-darkBorder rounded"
    >
      <form class="space-y-6" novalidate @submit.prevent="requestLoginLink">
        <div class="login-stagger" style="--stagger: 0">
          <h5 class="text-xl font-display text-navy dark:text-ivory">
            {{ $t('pages.login.form.title') }}
          </h5>
          <p class="mt-1 text-sm font-body text-navy/70 dark:text-poster-darkMuted">
            {{ $t('pages.login.form.description1') }}
          </p>
        </div>
        <div class="login-stagger" style="--stagger: 1">
          <label
            for="email-address-icon"
            class="block mb-2 text-base font-medium font-body"
            :class="emailError ? 'text-sienna dark:text-sienna-light' : 'text-navy dark:text-ivory'"
          >
            {{ emailError ? $t('pages.login.form.email.invalid') : $t('pages.login.form.email.label') }}
          </label>
          <div class="relative">
            <div class="absolute inset-y-0 start-0 flex items-center ps-3.5 pointer-events-none">
              <svg
                class="w-5 h-5 text-navy/40 dark:text-poster-darkMuted"
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
              type="email"
              class="login-input bg-ivory dark:bg-poster-dark border-2 text-navy dark:text-ivory text-base rounded font-body focus:ring-sienna focus:border-sienna dark:focus:ring-sienna-dark dark:focus:border-sienna-dark block w-full ps-10 p-3 placeholder-navy/40 dark:placeholder-poster-darkMuted"
              :class="emailError ? 'border-sienna dark:border-sienna-light' : 'border-navy/20 dark:border-poster-darkBorder'"
              :placeholder="$t('pages.login.form.email.placeholder')"
              @input="emailError = false"
            />
          </div>
        </div>
        <button
          type="submit"
          class="login-submit login-stagger w-full text-ivory bg-sienna hover:brightness-110 dark:bg-sienna-dark dark:hover:brightness-110 focus:ring-4 focus:outline-none focus:ring-sienna/30 font-semibold font-body rounded text-base px-5 py-3 text-center transition-all"
          style="--stagger: 2"
        >
          {{ $t('pages.login.form.button') }}
        </button>
      </form>
    </div>
    </div>
    <p class="text-sm font-body text-navy/60 dark:text-poster-darkMuted text-center mt-4 login-stagger" style="--stagger: 3">
      {{ $t('pages.login.form.description2') }}
    </p>
  </div>
  </Transition>
</template>

<script setup lang="ts">
  definePageMeta({ layout: 'login' })

  const { loggedIn } = useUserSession()

  if (loggedIn.value) {
    void navigateTo('/')
  }

  const requestedLogin = ref(false)
  const emailError = ref(false)

  const credentials = reactive({
    email: '',
  })

  function isValidEmail(email: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  }

  async function requestLoginLink() {
    if (!isValidEmail(credentials.email)) {
      emailError.value = true
      return
    }
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

<style scoped>
  /* Transition between form ↔ confirmation */
  .login-switch-enter-active { animation: fadeSlideUp 0.4s ease-out; }
  .login-switch-leave-active { animation: fadeSlideUp 0.25s ease-in reverse; }

  /* Schwebende Login-Box */
  .login-card-float {
    animation: loginFloat 4s ease-in-out infinite;
  }

  .login-card {
    box-shadow:
      0 8px 32px rgba(0, 0, 0, 0.1),
      0 2px 8px rgba(0, 0, 0, 0.06);
    animation: loginCardShadow 4s ease-in-out infinite;
  }

  @keyframes loginFloat {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-6px); }
  }

  @keyframes loginCardShadow {
    0%, 100% {
      box-shadow:
        0 8px 32px rgba(0, 0, 0, 0.1),
        0 2px 8px rgba(0, 0, 0, 0.06);
    }
    50% {
      box-shadow:
        0 16px 48px rgba(0, 0, 0, 0.14),
        0 4px 12px rgba(0, 0, 0, 0.08);
    }
  }

  /* Gestaffeltes Einblenden */
  .login-stagger {
    animation: fadeSlideUp 0.5s ease-out both;
    animation-delay: calc(var(--stagger) * 0.12s + 0.1s);
  }

  /* Input-Glow bei Fokus */
  .login-input {
    transition: box-shadow 0.3s ease, border-color 0.3s ease;
  }

  .login-input:focus {
    box-shadow:
      0 0 0 3px rgba(194, 65, 12, 0.15),
      0 0 16px rgba(194, 65, 12, 0.1);
  }

  :deep(.dark) .login-input:focus {
    box-shadow:
      0 0 0 3px rgba(234, 88, 12, 0.2),
      0 0 16px rgba(234, 88, 12, 0.12);
  }

  /* Submit-Button Hover-Puls */
  .login-submit:hover {
    animation: subtlePulse 1.5s ease-in-out infinite;
  }

  @keyframes subtlePulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.02); }
  }
</style>
