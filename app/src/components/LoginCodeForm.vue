<template>
  <form class="login-code mt-4 pt-4 border-t border-mustard/40" novalidate @submit.prevent="redeem">
    <label for="login-code" class="block mb-2 text-base font-medium font-body">
      {{ $t('components.LoginCodeForm.label') }}
    </label>
    <div class="flex gap-2">
      <!-- `one-time-code` lets iOS and Android offer the code from the mail
           right above the keyboard. -->
      <input
        id="login-code"
        v-model="code"
        type="text"
        name="code"
        inputmode="numeric"
        autocomplete="one-time-code"
        maxlength="7"
        class="min-w-0 flex-1 bg-ivory dark:bg-poster-dark border-2 border-navy/20 dark:border-poster-darkBorder focus:border-sienna dark:focus:border-sienna-dark focus:outline-none rounded p-2.5 text-xl tracking-[0.3em] font-mono text-navy dark:text-ivory"
        :placeholder="$t('components.LoginCodeForm.placeholder')"
        :aria-invalid="errorText ? 'true' : undefined"
        aria-describedby="login-code-error"
        @input="reason = null"
      />
      <button
        type="submit"
        :disabled="!complete || pending"
        class="px-5 py-2 text-base font-semibold font-body border-2 border-sienna bg-sienna text-ivory rounded hover:bg-sienna-dark hover:border-sienna-dark transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {{
          pending ? $t('components.LoginCodeForm.loading') : $t('components.LoginCodeForm.button')
        }}
      </button>
    </div>
    <p
      v-if="errorText"
      id="login-code-error"
      role="alert"
      class="mt-2 text-sm font-body text-sienna dark:text-sienna-light"
    >
      {{ errorText }}
    </p>
  </form>
</template>

<script setup lang="ts">
  import { TimeoutError, withTimeout } from '../utils/withTimeout'

  /**
   * The login code from the mail, typed into the browser that asked for it —
   * for when the link would log in a different browser than this one (an iOS
   * home-screen app, a mail app's built-in browser, another device). Why and
   * how it is kept safe: server/helpers/loginCode.ts.
   */
  const props = defineProps<{ redirect?: string }>()

  const CODE_LENGTH = 6
  /** Same budget as redeeming the link — see src/pages/login/[token].vue. */
  const REDEEM_TIMEOUT_MS = 15_000

  const { t } = useI18n()
  const { loggedIn, fetch: refreshSession } = useUserSession()
  // The client with the 401 handling — see useApi().
  const api = useApi()

  const code = ref('')
  const pending = ref(false)
  /** A `RedeemCodeFailure` from the server, or `timeout` / `nosession`. */
  const reason = ref<string | null>(null)
  const attemptsLeft = ref<number | null>(null)

  /** Pasted from a mail it may carry the grouping space, or none at all. */
  const digits = computed(() => code.value.replace(/\D/g, ''))
  const complete = computed(() => digits.value.length === CODE_LENGTH)

  // Spelled out like the link's messages, so unknown reasons fall through to
  // the generic sentence instead of a missing-translation key.
  const errorText = computed(() => {
    switch (reason.value) {
      case null:
        return ''
      case 'wrong':
        return t('components.LoginCodeForm.error.wrong', attemptsLeft.value ?? 0)
      case 'locked':
        return t('components.LoginCodeForm.error.locked')
      case 'expired':
        return t('components.LoginCodeForm.error.expired')
      // No binding in this browser: the code was most likely requested in
      // another one, or so long ago that the cookie is gone with it.
      case 'unknown':
        return t('components.LoginCodeForm.error.elsewhere')
      case 'used':
        return t('components.LoginCodeForm.error.used')
      case 'disabled':
        return t('pages.login.error.disabled')
      case 'timeout':
        return t('pages.login.error.timeout')
      case 'nosession':
        return t('components.LoginCodeForm.error.nosession')
      default:
        return t('pages.login.error.text')
    }
  })

  async function redeem() {
    if (!complete.value || pending.value) return
    pending.value = true
    reason.value = null
    try {
      await withTimeout(REDEEM_TIMEOUT_MS, (signal) =>
        api('/api/redeemLoginCode', {
          method: 'POST',
          body: { code: digits.value },
          signal,
        }),
      )
      await refreshSession()
      // Same check as after the link: the server issued a cookie, which is not
      // yet proof that this browser kept it.
      if (!loggedIn.value) {
        reason.value = 'nosession'
        return
      }
      await navigateTo(props.redirect || '/')
      // eslint-disable-next-line no-catch-all/no-catch-all -- einzelner api()-Aufruf: jeder Fehler wird als Grund angezeigt
    } catch (error) {
      const data = (error as { data?: { data?: { reason?: string; attemptsLeft?: number } } }).data
        ?.data
      reason.value = error instanceof TimeoutError ? 'timeout' : (data?.reason ?? 'error')
      attemptsLeft.value = data?.attemptsLeft ?? null
    } finally {
      pending.value = false
    }
  }
</script>
