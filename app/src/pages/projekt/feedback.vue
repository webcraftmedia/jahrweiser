<script setup lang="ts">
  import type { FeedbackKind } from '~~/shared/feedback'

  import {
    FEEDBACK_FIELD_MAX,
    FEEDBACK_MESSAGE_MAX,
    LOCAL_DATE_TIME_PATTERN,
    shiftLocalDateTime,
  } from '~~/shared/feedback'

  definePageMeta({
    middleware: ['authenticated'],
  })

  // The client with the 401 handling — see useApi().
  const api = useApi()
  const route = useRoute()
  const { t } = useI18n()
  const runtimeConfig = useRuntimeConfig()
  const { user } = useUserSession()
  const { isDark } = useColorMode()

  /** Where a suggestion starts when the calendar sent a date along. */
  const SUGGESTION_START_TIME = '19:00'
  /** How long it lasts until somebody says otherwise. */
  const SUGGESTION_HOURS = 2

  /** `null` while we are still asking whether feedback can be sent at all. */
  const enabled = ref<boolean | null>(null)
  // The calendar's "+" links here with `?kind=event&date=…`, so the member lands
  // on the right form with the month they were looking at already filled in.
  // Anything else in the query is ignored rather than trusted.
  const kind = ref<FeedbackKind>(route.query.kind === 'event' ? 'event' : 'feedback')
  const message = ref('')
  const sending = ref(false)
  const status = ref<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const suggestedDate = typeof route.query.date === 'string' ? route.query.date : ''
  const prefilledStart = /^\d{4}-\d{2}-\d{2}$/.test(suggestedDate)
    ? `${suggestedDate}T${SUGGESTION_START_TIME}`
    : ''

  const isEvent = computed(() => kind.value === 'event')
  const eventTitle = ref('')
  const eventStart = ref(prefilledStart)
  const eventEnd = ref(prefilledStart ? shiftLocalDateTime(prefilledStart, SUGGESTION_HOURS) : '')
  const eventLocation = ref('')

  // Moving the start fills an empty end and repairs one the start has just
  // overtaken; an end that still lies after it is left alone, because that one
  // was chosen on purpose. Saves typing the same date twice without ever
  // overruling the member.
  watch(eventStart, (start) => {
    if (!LOCAL_DATE_TIME_PATTERN.test(start)) return
    if (eventEnd.value === '' || eventEnd.value <= start) {
      eventEnd.value = shiftLocalDateTime(start, SUGGESTION_HOURS)
    }
  })

  /** Both times given and in order — compared as strings, see the pattern's docs. */
  const rangeValid = computed(
    () =>
      LOCAL_DATE_TIME_PATTERN.test(eventStart.value) &&
      LOCAL_DATE_TIME_PATTERN.test(eventEnd.value) &&
      eventStart.value <= eventEnd.value,
  )

  /** Named so the button and the hint below it cannot disagree about it. */
  const rangeBackwards = computed(
    () =>
      LOCAL_DATE_TIME_PATTERN.test(eventStart.value) &&
      LOCAL_DATE_TIME_PATTERN.test(eventEnd.value) &&
      eventEnd.value < eventStart.value,
  )

  // A suggestion needs a name and a time; its description is optional. The
  // other two kinds are nothing *but* their message.
  const canSubmit = computed(() =>
    isEvent.value
      ? eventTitle.value.trim().length > 0 && rangeValid.value
      : message.value.trim().length > 0,
  )

  // The technical context of a *bug report*. Every value here is also rendered
  // in the form: the member sees exactly what leaves their browser before they
  // press send. Plain feedback sends none of it — nothing about the browser
  // helps with an idea, so nothing about it is collected.
  const isBug = computed(() => kind.value === 'bug')
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
    { value: 'event', label: t('pages.projekt.feedback.kind.event') },
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
    // bookmark there is no previous page. Not a form field: asking somebody to
    // type a route is asking for a wrong one.
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

  /** What goes on the wire — one branch per union arm in `shared/feedback.ts`. */
  function requestBody(): Record<string, unknown> {
    if (isBug.value) {
      return {
        kind: 'bug',
        message: message.value,
        context: {
          page: page.value,
          appVersion,
          userAgent: userAgent.value,
          viewport: viewport.value,
          colorScheme: colorScheme.value,
        },
      }
    }
    if (isEvent.value) {
      return {
        kind: 'event',
        message: message.value,
        event: {
          title: eventTitle.value,
          start: eventStart.value,
          end: eventEnd.value,
          location: eventLocation.value,
        },
      }
    }
    return { kind: 'feedback', message: message.value }
  }

  async function submit(): Promise<void> {
    sending.value = true
    status.value = null
    try {
      await api('/api/feedback', { method: 'POST', body: requestBody() })
      status.value = {
        kind: 'ok',
        text: isEvent.value
          ? t('pages.projekt.feedback.sent-event')
          : t('pages.projekt.feedback.sent'),
      }
      // Cleared so a second thought is a new report, not an accidental resend.
      message.value = ''
      eventTitle.value = ''
      eventStart.value = ''
      eventEnd.value = ''
      eventLocation.value = ''
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
      <!-- Heading and lead follow the selected kind: somebody who arrived from
           the calendar's "+" is not here to report a bug, and being told they
           are is confusing. -->
      <h2 class="text-lg font-semibold mb-2">
        {{
          isEvent ? t('pages.projekt.feedback.heading-event') : t('pages.projekt.feedback.heading')
        }}
      </h2>
      <p class="text-sm text-navy/80 dark:text-ivory/80 mb-4">
        {{
          isEvent
            ? t('pages.projekt.feedback.description-event')
            : t('pages.projekt.feedback.description')
        }}
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

        <!-- The suggestion itself. Shown for the event kind only: the other two
             are a message and nothing else. Nothing here writes to the calendar
             — the team gets a mail and decides. -->
        <fieldset v-if="isEvent" class="space-y-4">
          <legend class="text-sm font-medium mb-2">
            {{ t('pages.projekt.feedback.event.legend') }}
          </legend>

          <div>
            <label for="feedback-event-title" class="block text-sm font-medium mb-1">
              {{ t('pages.projekt.feedback.event.title') }}
            </label>
            <input
              id="feedback-event-title"
              v-model="eventTitle"
              type="text"
              required
              :maxlength="FEEDBACK_FIELD_MAX"
              :placeholder="t('pages.projekt.feedback.event.title-placeholder')"
              class="w-full rounded border-2 border-navy/15 dark:border-poster-darkBorder bg-white dark:bg-poster-dark px-3 py-2 text-sm"
            />
          </div>

          <div class="flex flex-wrap gap-4">
            <div class="grow">
              <label for="feedback-event-start" class="block text-sm font-medium mb-1">
                {{ t('pages.projekt.feedback.event.start') }}
              </label>
              <input
                id="feedback-event-start"
                v-model="eventStart"
                type="datetime-local"
                required
                class="w-full rounded border-2 border-navy/15 dark:border-poster-darkBorder bg-white dark:bg-poster-dark px-3 py-2 text-sm"
              />
            </div>
            <div class="grow">
              <label for="feedback-event-end" class="block text-sm font-medium mb-1">
                {{ t('pages.projekt.feedback.event.end') }}
              </label>
              <input
                id="feedback-event-end"
                v-model="eventEnd"
                type="datetime-local"
                required
                :min="eventStart || undefined"
                class="w-full rounded border-2 border-navy/15 dark:border-poster-darkBorder bg-white dark:bg-poster-dark px-3 py-2 text-sm"
              />
            </div>
          </div>

          <p v-if="rangeBackwards" class="text-sm text-red-700 dark:text-red-400" role="alert">
            {{ t('pages.projekt.feedback.event.end-before-start') }}
          </p>

          <div>
            <label for="feedback-event-location" class="block text-sm font-medium mb-1">
              {{ t('pages.projekt.feedback.event.location') }}
            </label>
            <input
              id="feedback-event-location"
              v-model="eventLocation"
              type="text"
              :maxlength="FEEDBACK_FIELD_MAX"
              :placeholder="t('pages.projekt.feedback.event.location-placeholder')"
              class="w-full rounded border-2 border-navy/15 dark:border-poster-darkBorder bg-white dark:bg-poster-dark px-3 py-2 text-sm"
            />
          </div>
        </fieldset>

        <div>
          <label for="feedback-message" class="block text-sm font-medium mb-1">
            {{
              isEvent
                ? t('pages.projekt.feedback.event.description')
                : t('pages.projekt.feedback.message')
            }}
          </label>
          <textarea
            id="feedback-message"
            v-model="message"
            :rows="isEvent ? 4 : 7"
            :maxlength="FEEDBACK_MESSAGE_MAX"
            :placeholder="
              kind === 'bug'
                ? t('pages.projekt.feedback.message-placeholder-bug')
                : kind === 'event'
                  ? t('pages.projekt.feedback.message-placeholder-event')
                  : t('pages.projekt.feedback.message-placeholder-feedback')
            "
            class="w-full rounded border-2 border-navy/15 dark:border-poster-darkBorder bg-white dark:bg-poster-dark px-3 py-2 text-sm"
          />
        </div>

        <!-- Open on demand, but complete: the member can read every value that
             travels with their report before they send it. Shown for a bug
             report only, because only a bug report carries it. -->
        <details
          v-if="isBug"
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
        </details>

        <div class="flex items-center gap-3">
          <button
            type="submit"
            class="bg-sienna hover:brightness-110 text-ivory font-semibold rounded px-4 py-2 disabled:opacity-50"
            :disabled="sending || !canSubmit"
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
