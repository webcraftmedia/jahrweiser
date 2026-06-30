<template>
  <div class="w-full max-w-sm mt-8">
    <!-- Validating the link -->
    <div v-if="validating" class="mt-8 animate-fade-slide-up">
      <div role="status" class="flex items-center gap-2">
        <LoadingDots />
        <span class="sr-only">{{ $t('pages.register.validating') }}</span>
      </div>
    </div>

    <!-- Link no longer usable -->
    <div v-else-if="linkStatus !== 'valid'" class="animate-tilt-in">
      <div
        class="p-5 border-2 border-sienna/50 dark:border-sienna-dark/50 rounded bg-sienna/10 dark:bg-sienna/5 text-navy dark:text-ivory"
        role="alert"
      >
        <h3 class="text-lg font-display mb-2">{{ $t('pages.register.invalid.title') }}</h3>
        <p class="text-base font-body">{{ invalidMessage }}</p>
      </div>
    </div>

    <!-- Account created: check your inbox -->
    <div v-else-if="result === 'created'" class="animate-fade-slide-up">
      <div
        class="p-5 border-2 border-mustard/50 dark:border-mustard/30 rounded bg-mustard/10 dark:bg-mustard/5 text-navy dark:text-ivory"
        role="alert"
      >
        <h3 class="text-lg font-display mb-2">{{ $t('pages.register.created.title') }}</h3>
        <p class="text-base font-body">{{ $t('pages.register.created.text1') }}</p>
        <p class="mt-2 text-sm font-body">{{ $t('pages.register.created.text2') }}</p>
      </div>
    </div>

    <!-- Already has an account -->
    <div v-else-if="result === 'already-registered'" class="animate-fade-slide-up">
      <div
        class="p-5 border-2 border-olive/50 dark:border-olive/30 rounded bg-olive/10 dark:bg-olive/5 text-navy dark:text-ivory"
        role="alert"
      >
        <h3 class="text-lg font-display mb-2">{{ $t('pages.register.exists.title') }}</h3>
        <p class="text-base font-body mb-4">{{ $t('pages.register.exists.text') }}</p>
        <NuxtLink
          to="/login"
          class="inline-block px-5 py-2 text-base font-semibold font-body border-2 border-sienna text-sienna dark:text-sienna-light dark:border-sienna-dark rounded hover:bg-sienna hover:text-ivory dark:hover:bg-sienna-dark dark:hover:text-ivory transition-colors"
        >
          {{ $t('pages.register.exists.button') }}
        </NuxtLink>
      </div>
    </div>

    <!-- Registration form -->
    <div v-else class="login-card-float">
      <div
        class="login-card p-6 sm:p-8 bg-white/80 dark:bg-poster-darkCard border-2 border-navy/15 dark:border-poster-darkBorder rounded"
      >
        <form class="space-y-5" novalidate @submit.prevent="submit">
          <div>
            <h5 class="text-xl font-display text-navy dark:text-ivory">
              {{ $t('pages.register.form.title') }}
            </h5>
            <p class="mt-1 text-sm font-body text-navy/70 dark:text-poster-darkMuted">
              {{ $t('pages.register.form.description') }}
            </p>
          </div>

          <div class="space-y-5">
            <div>
              <label
                for="firstName"
                class="block mb-2 text-base font-medium font-body text-navy dark:text-ivory"
              >
                {{ $t('pages.register.form.firstName.label') }}
              </label>
              <input
                id="firstName"
                v-model.trim="firstName"
                type="text"
                autocomplete="given-name"
                class="bg-ivory dark:bg-poster-dark border-2 border-navy/20 dark:border-poster-darkBorder text-navy dark:text-ivory text-base rounded font-body focus:border-sienna dark:focus:border-sienna-dark focus:outline-none block w-full p-3"
                :placeholder="$t('pages.register.form.firstName.placeholder')"
                @input="clearErrors"
              />
            </div>
            <div>
              <label
                for="lastName"
                class="block mb-2 text-base font-medium font-body text-navy dark:text-ivory"
              >
                {{ $t('pages.register.form.lastName.label') }}
              </label>
              <input
                id="lastName"
                v-model.trim="lastName"
                type="text"
                autocomplete="family-name"
                class="bg-ivory dark:bg-poster-dark border-2 border-navy/20 dark:border-poster-darkBorder text-navy dark:text-ivory text-base rounded font-body focus:border-sienna dark:focus:border-sienna-dark focus:outline-none block w-full p-3"
                :placeholder="$t('pages.register.form.lastName.placeholder')"
                @input="clearErrors"
              />
            </div>
          </div>

          <div>
            <label
              for="email"
              class="block mb-2 text-base font-medium font-body"
              :class="
                emailError ? 'text-sienna dark:text-sienna-light' : 'text-navy dark:text-ivory'
              "
            >
              {{
                emailError
                  ? $t('pages.register.form.email.invalid')
                  : $t('pages.register.form.email.label')
              }}
            </label>
            <input
              id="email"
              v-model.trim="email"
              type="email"
              autocomplete="email"
              class="bg-ivory dark:bg-poster-dark border-2 text-navy dark:text-ivory text-base rounded font-body focus:border-sienna dark:focus:border-sienna-dark focus:outline-none block w-full p-3"
              :class="
                emailError
                  ? 'border-sienna dark:border-sienna-light'
                  : 'border-navy/20 dark:border-poster-darkBorder'
              "
              :placeholder="$t('pages.register.form.email.placeholder')"
              @input="clearErrors"
            />
          </div>

          <button
            type="submit"
            :disabled="loading || !canSubmit"
            class="w-full text-ivory bg-sienna hover:brightness-110 dark:bg-sienna-dark dark:hover:brightness-110 focus:ring-4 focus:outline-none focus:ring-sienna/30 font-semibold font-body rounded text-base px-5 py-3 text-center disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {{ loading ? $t('pages.register.form.loading') : $t('pages.register.form.button') }}
          </button>
          <p
            v-if="sendError"
            role="alert"
            class="text-sm font-body text-sienna dark:text-sienna-light text-center"
          >
            {{ $t('pages.register.form.error') }}
          </p>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { z } from 'zod'

  definePageMeta({ layout: 'login' })

  const { loggedIn } = useUserSession()
  if (loggedIn.value) {
    void navigateTo('/')
  }

  const route = useRoute()
  const token = route.params.token as string

  const { t } = useI18n()

  const validating = ref(true)
  const linkStatus = ref<'valid' | 'revoked' | 'expired' | 'exhausted' | 'notfound'>('valid')
  const result = ref<'created' | 'already-registered' | null>(null)

  // Static-key lookup (no dynamic i18n keys) for the "link unusable" reason.
  const invalidMessage = computed(
    () =>
      ({
        valid: '',
        revoked: t('pages.register.invalid.revoked'),
        expired: t('pages.register.invalid.expired'),
        exhausted: t('pages.register.invalid.exhausted'),
        notfound: t('pages.register.invalid.notfound'),
      })[linkStatus.value],
  )

  const firstName = ref('')
  const lastName = ref('')
  const email = ref('')
  const emailError = ref(false)
  const sendError = ref(false)
  const loading = ref(false)

  const emailSchema = z.email()
  const canSubmit = computed(
    () =>
      firstName.value.trim().length > 0 &&
      lastName.value.trim().length > 0 &&
      emailSchema.safeParse(email.value.trim()).success,
  )

  function clearErrors() {
    emailError.value = false
    sendError.value = false
  }

  onMounted(async () => {
    try {
      const res = await $fetch<{ status: typeof linkStatus.value }>(`/api/register/${token}`)
      linkStatus.value = res.status
    } catch {
      linkStatus.value = 'notfound'
    } finally {
      validating.value = false
    }
  })

  async function submit() {
    if (!canSubmit.value) {
      emailError.value = !emailSchema.safeParse(email.value.trim()).success
      return
    }
    sendError.value = false
    loading.value = true
    try {
      const res = await $fetch<{ status: 'created' | 'already-registered' }>('/api/register', {
        method: 'POST',
        body: {
          token,
          email: email.value.trim(),
          firstName: firstName.value.trim(),
          lastName: lastName.value.trim(),
        },
      })
      result.value = res.status
    } catch {
      // 410/404 means the link expired/was revoked between page load and submit.
      sendError.value = true
    } finally {
      loading.value = false
    }
  }
</script>

<style scoped>
  .login-card-float {
    animation: loginFloat 4s ease-in-out infinite;
  }
  .login-card {
    box-shadow:
      0 8px 32px rgba(0, 0, 0, 0.1),
      0 2px 8px rgba(0, 0, 0, 0.06);
  }
  @keyframes loginFloat {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-6px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .login-card-float {
      animation: none;
    }
  }
</style>
