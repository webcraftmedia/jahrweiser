<script setup lang="ts">
  import type { FeedbackKind } from '~~/shared/feedback'

  import { FEEDBACK_MESSAGE_MAX } from '~~/shared/feedback'

  definePageMeta({
    middleware: ['authenticated'],
  })

  // The client with the 401 handling — see useApi().
  const api = useApi()
  const { t } = useI18n()
  const runtimeConfig = useRuntimeConfig()
  const { user } = useUserSession()
  const { isDark } = useColorMode()

  /** `null` while we are still asking whether feedback can be sent at all. */
  const enabled = ref<boolean | null>(null)
  const kind = ref<FeedbackKind>('feedback')
  const message = ref('')
  const sending = ref(false)
  const status = ref<{ kind: 'ok' | 'err'; text: string } | null>(null)

  // The technical context. Every value here is also rendered in the form: the
  // member sees exactly what leaves their browser before they press send.
  const page = ref('')
  const userAgent = ref('')
  const viewport = ref('')
  const appVersion = runtimeConfig.public.appVersion
  const colorScheme = computed(() =>
    isDark.value
      ? t('pages.projekt.feedback.context.dark')
      : t('pages.projekt.feedback.context.light'),
  )

  // Spelled out rather than mapped over FEEDBACK_KINDS: a key built from a
  // variable is one the locale linter cannot follow to its translation.
  const kinds = computed<{ value: FeedbackKind; label: string }[]>(() => [
    { value: 'feedback', label: t('pages.projekt.feedback.kind.feedback') },
    { value: 'bug', label: t('pages.projekt.feedback.kind.bug') },
  ])

  async function loadAvailability(): Promise<void> {
    try {
      const answer = await api<{ enabled: boolean }>('/api/feedback')
      enabled.value = answer.enabled
      // eslint-disable-next-line no-catch-all/no-catch-all -- geloggt; das Formular bleibt offen, der Versand meldet den Fehler
    } catch (error) {
      // Offered anyway on a failed check: hiding the form over a blip costs a
      // report that somebody sat down to write, while the submit below names
      // the real problem if there is one.
      console.warn('Could not check whether feedback is configured:', error)
      enabled.value = true
    }
  }

  onMounted(() => {
    // The page they came from — that is the one a bug report is about. Read
    // from the history entry vue-router maintains (`{ back, current, … }`),
    // which is also why it can be empty: opened in a fresh tab or from a
    // bookmark there is no previous page. The field is editable either way.
    const back = (window.history.state as { back?: unknown } | null)?.back
    page.value = typeof back === 'string' ? back : ''
    userAgent.value = navigator.userAgent
    viewport.value = `${window.innerWidth}×${window.innerHeight}`
    void loadAvailability()
  })

  function errorText(statusCode: number | undefined): string {
    if (statusCode === 429) return t('pages.projekt.feedback.error-cooldown')
    if (statusCode === 503) return t('pages.projekt.feedback.error-unavailable')
    return t('pages.projekt.feedback.error')
  }

  async function submit(): Promise<void> {
    sending.value = true
    status.value = null
    try {
      await api('/api/feedback', {
        method: 'POST',
        body: {
          kind: kind.value,
          message: message.value,
          context: {
            page: page.value,
            appVersion,
            userAgent: userAgent.value,
            viewport: viewport.value,
            colorScheme: colorScheme.value,
          },
        },
      })
      status.value = { kind: 'ok', text: t('pages.projekt.feedback.sent') }
      // Cleared so a second thought is a new report, not an accidental resend.
      message.value = ''
      // eslint-disable-next-line no-catch-all/no-catch-all -- einzelner api()-Aufruf: Fehlermeldung wird im UI angezeigt
    } catch (error) {
      status.value = {
        kind: 'err',
        text: errorText((error as { statusCode?: number }).statusCode),
      }
    } finally {
      sending.value = false
    }
  }
</script>

<template>
  <div class="space-y-6">
    <h1 class="hidden md:block text-2xl font-display text-navy dark:text-ivory">
      {{ t('pages.projekt.menu.feedback') }}
    </h1>

    <section
      class="bg-white/80 dark:bg-poster-darkCard rounded shadow-lg p-6 border-2 border-navy/15 dark:border-poster-darkBorder"
    >
      <h2 class="text-lg font-semibold mb-2">{{ t('pages.projekt.feedback.heading') }}</h2>
      <p class="text-sm text-navy/80 dark:text-ivory/80 mb-4">
        {{ t('pages.projekt.feedback.description') }}
      </p>

      <p v-if="enabled === null" class="text-navy/60 dark:text-ivory/60">
        {{ t('pages.projekt.feedback.loading') }}
      </p>

      <p v-else-if="enabled === false" class="text-navy/80 dark:text-ivory/80">
        {{ t('pages.projekt.feedback.unavailable') }}
      </p>

      <form v-else class="space-y-5" @submit.prevent="submit">
        <fieldset>
          <legend class="text-sm font-medium mb-2">
            {{ t('pages.projekt.feedback.kind-legend') }}
          </legend>
          <div class="flex flex-wrap gap-4">
            <label
              v-for="option in kinds"
              :key="option.value"
              class="flex items-center gap-2 text-sm text-navy/80 dark:text-ivory/80"
            >
              <input
                v-model="kind"
                type="radio"
                name="kind"
                :value="option.value"
                class="accent-sienna"
              />
              {{ option.label }}
            </label>
          </div>
        </fieldset>

        <div>
          <label for="feedback-message" class="block text-sm font-medium mb-1">
            {{ t('pages.projekt.feedback.message') }}
          </label>
          <textarea
            id="feedback-message"
            v-model="message"
            rows="7"
            :maxlength="FEEDBACK_MESSAGE_MAX"
            :placeholder="
              kind === 'bug'
                ? t('pages.projekt.feedback.message-placeholder-bug')
                : t('pages.projekt.feedback.message-placeholder-feedback')
            "
            class="w-full rounded border-2 border-navy/15 dark:border-poster-darkBorder bg-white dark:bg-poster-dark px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label for="feedback-page" class="block text-sm font-medium mb-1">
            {{ t('pages.projekt.feedback.page') }}
          </label>
          <input
            id="feedback-page"
            v-model="page"
            type="text"
            :placeholder="t('pages.projekt.feedback.page-placeholder')"
            class="w-full rounded border-2 border-navy/15 dark:border-poster-darkBorder bg-white dark:bg-poster-dark px-3 py-2 text-sm"
          />
          <p class="mt-1 text-xs text-navy/60 dark:text-ivory/60">
            {{ t('pages.projekt.feedback.page-hint') }}
          </p>
        </div>

        <!-- Open on demand, but complete: the member can read every value that
             travels with their report before they send it. -->
        <details
          class="rounded border border-navy/15 dark:border-poster-darkBorder px-3 py-2 text-sm"
        >
          <summary class="cursor-pointer text-navy/80 dark:text-ivory/80">
            {{ t('pages.projekt.feedback.context.summary') }}
          </summary>
          <dl class="mt-3 space-y-1 text-xs text-navy/70 dark:text-ivory/70">
            <div class="flex gap-2">
              <dt class="w-32 shrink-0 text-navy/50 dark:text-ivory/50">
                {{ t('pages.projekt.feedback.context.name') }}
              </dt>
              <dd class="break-all">{{ user?.name }}</dd>
            </div>
            <div class="flex gap-2">
              <dt class="w-32 shrink-0 text-navy/50 dark:text-ivory/50">
                {{ t('pages.projekt.feedback.context.email') }}
              </dt>
              <dd class="break-all">{{ user?.email }}</dd>
            </div>
            <div class="flex gap-2">
              <dt class="w-32 shrink-0 text-navy/50 dark:text-ivory/50">
                {{ t('pages.projekt.feedback.context.page') }}
              </dt>
              <dd class="break-all">{{ page || t('pages.projekt.feedback.context.none') }}</dd>
            </div>
            <div class="flex gap-2">
              <dt class="w-32 shrink-0 text-navy/50 dark:text-ivory/50">
                {{ t('pages.projekt.feedback.context.version') }}
              </dt>
              <dd class="break-all">{{ appVersion }}</dd>
            </div>
            <div class="flex gap-2">
              <dt class="w-32 shrink-0 text-navy/50 dark:text-ivory/50">
                {{ t('pages.projekt.feedback.context.browser') }}
              </dt>
              <dd class="break-all">{{ userAgent }}</dd>
            </div>
            <div class="flex gap-2">
              <dt class="w-32 shrink-0 text-navy/50 dark:text-ivory/50">
                {{ t('pages.projekt.feedback.context.viewport') }}
              </dt>
              <dd class="break-all">{{ viewport }}</dd>
            </div>
            <div class="flex gap-2">
              <dt class="w-32 shrink-0 text-navy/50 dark:text-ivory/50">
                {{ t('pages.projekt.feedback.context.scheme') }}
              </dt>
              <dd class="break-all">{{ colorScheme }}</dd>
            </div>
          </dl>
          <p class="mt-3 text-xs text-navy/60 dark:text-ivory/60">
            {{ t('pages.projekt.feedback.context.hint') }}
          </p>
        </details>

        <div class="flex items-center gap-3">
          <button
            type="submit"
            class="bg-sienna hover:brightness-110 text-ivory font-semibold rounded px-4 py-2 disabled:opacity-50"
            :disabled="sending || message.trim().length === 0"
          >
            {{ sending ? t('pages.projekt.feedback.sending') : t('pages.projekt.feedback.submit') }}
          </button>
          <p
            v-if="status"
            :class="
              status.kind === 'ok'
                ? 'text-sm text-emerald-700 dark:text-emerald-400'
                : 'text-sm text-red-700 dark:text-red-400'
            "
            role="status"
          >
            {{ status.text }}
          </p>
        </div>
      </form>
    </section>
  </div>
</template>
