<template>
  <div>
    <!-- Confirmation step. The link is NOT redeemed by opening this page — see
         the comment in the script block. -->
    <div v-if="state === 'idle'" class="w-full max-w-md mt-8 animate-fade-slide-up">
      <div
        class="p-5 border-2 border-mustard/50 dark:border-mustard/30 rounded bg-mustard/10 dark:bg-mustard/5 text-navy dark:text-ivory"
      >
        <h3 class="text-lg font-display mb-3">{{ $t('pages.login.token.title') }}</h3>
        <p class="mb-4 text-base font-body">{{ $t('pages.login.token.text') }}</p>
        <button
          class="px-5 py-2 text-base font-semibold font-body border-2 border-sienna bg-sienna text-ivory rounded hover:bg-sienna-dark hover:border-sienna-dark transition-colors disabled:opacity-60 disabled:cursor-wait"
          type="button"
          :disabled="!hydrated"
          @click="redeem"
        >
          {{ $t('pages.login.token.button') }}
        </button>
      </div>
    </div>

    <!-- Loading dots -->
    <div v-else-if="state === 'pending'" class="mt-8 animate-fade-slide-up">
      <div role="status" class="flex items-center gap-2">
        <LoadingDots />
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
          <p class="font-medium">{{ errorText }}</p>
        </div>
        <div class="flex flex-wrap gap-3">
          <!-- Only offered after a timeout: there the request may never have
               reached the server, so the token is likely still unspent. For
               every other reason a retry can only repeat the same answer. -->
          <button
            v-if="reason === 'timeout'"
            data-action="retry"
            class="px-5 py-2 text-base font-semibold font-body border-2 border-sienna bg-sienna text-ivory rounded hover:bg-sienna-dark hover:border-sienna-dark transition-colors"
            type="button"
            @click="redeem"
          >
            {{ $t('pages.login.error.retry') }}
          </button>
          <button
            data-action="back"
            class="px-5 py-2 text-base font-semibold font-body border-2 border-sienna text-sienna dark:text-sienna-light dark:border-sienna-dark rounded hover:bg-sienna hover:text-ivory dark:hover:bg-sienna-dark dark:hover:text-ivory transition-colors"
            type="button"
            @click="goLogin"
          >
            {{ $t('pages.login.message.button') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  /**
   * The landing page of a magic link.
   *
   * Redeeming happens on a click, never on load, and that is the entire point
   * of this page existing instead of a redirect. Login tokens are single-use,
   * and corporate mail security (Defender Safe Links, Proofpoint, Mimecast)
   * opens incoming links in a headless browser to inspect them — JavaScript
   * included. An `onMounted` redemption is therefore spent by the scanner
   * seconds after the mail arrives, and the member who clicks afterwards is
   * told their link is no longer valid. That is not hypothetical: it locked a
   * member out for three months, with every one of her tokens consumed 18 to
   * 53 seconds after it was minted.
   *
   * A sandbox renders. It does not click. The extra click is the price of
   * magic links working in company mailboxes at all.
   */
  import { TimeoutError, withTimeout } from '../../utils/withTimeout'

  definePageMeta({ layout: 'login' })

  const { t } = useI18n()
  const { loggedIn, fetch: refreshSession } = useUserSession()
  const route = useRoute()

  const raw = route.query.redirect
  const redirect =
    typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//') ? raw : undefined

  if (loggedIn.value) {
    void navigateTo(redirect || '/')
  }

  type State = 'idle' | 'pending' | 'error'
  const state = ref<State>('idle')

  /**
   * False until Vue has taken over the server-rendered markup. The button is
   * disabled up to that point, because a click landing before hydration hits an
   * element whose handler does not exist yet and is silently lost — the page
   * then just sits there. On a slow phone that is a member tapping a dead
   * button; in the e2e suite it was every login test timing out.
   */
  const hydrated = ref(false)
  onMounted(() => {
    hydrated.value = true
  })

  /**
   * Why it failed — `RedeemFailure` from server/api/redeemLoginLink.post.ts,
   * plus the two the client decides on its own: `timeout` (the server never
   * answered) and `nosession` (it did, and the browser dropped the cookie).
   */
  const reason = ref<string | null>(null)

  /**
   * How long the redemption may take before we call it a failure.
   *
   * Generous on purpose: the endpoint does four small queries, so anything past
   * a second means something is wrong, but a member on a train should not be
   * told "timeout" while the request is merely slow.
   */
  const REDEEM_TIMEOUT_MS = 15_000

  // Spelled out rather than built from the reason: the keys stay greppable,
  // and an unknown value from an older or newer server falls through to the
  // generic sentence instead of rendering a missing-translation key.
  const errorText = computed(() => {
    switch (reason.value) {
      case 'used':
        return t('pages.login.error.used')
      case 'expired':
        return t('pages.login.error.expired')
      case 'unknown':
        return t('pages.login.error.unknown')
      case 'disabled':
        return t('pages.login.error.disabled')
      case 'timeout':
        return t('pages.login.error.timeout')
      case 'nosession':
        return t('pages.login.error.nosession')
      default:
        return t('pages.login.error.text')
    }
  })

  // `/login` rather than `/`, which only gets there via the authenticated
  // middleware anyway — and the form there is where a new link is requested,
  // which is what every one of these messages asks for.
  const goLogin = () => navigateTo('/login')

  async function redeem() {
    state.value = 'pending'
    reason.value = null
    try {
      await withTimeout(REDEEM_TIMEOUT_MS, (signal) =>
        api('/api/redeemLoginLink', {
          method: 'POST',
          body: route.params,
          signal,
        }),
      )
      await refreshSession()

      // The POST succeeded, so the token is spent — but that only means the
      // server issued a cookie, not that this browser kept it. Cookies blocked,
      // a mail app's built-in browser, a device clock far enough off: the
      // session is simply not there, and navigating on would hand the member to
      // the authenticated middleware, which bounces them back to the login form
      // with no explanation and one link less. Saying so is the whole point.
      if (!loggedIn.value) {
        reason.value = 'nosession'
        state.value = 'error'
        return
      }

      await navigateTo(redirect || '/')
      // eslint-disable-next-line no-catch-all/no-catch-all -- Token-Einloesung fehlgeschlagen = genau der Zustand state='error'
    } catch (error) {
      reason.value =
        error instanceof TimeoutError
          ? 'timeout'
          : ((error as { data?: { data?: { reason?: string } } }).data?.data?.reason ?? null)
      state.value = 'error'
    }
  }

  // The client with the 401 handling — see useApi().
  const api = useApi()
</script>
