<template>
  <div class="space-y-6">
    <NuxtLink
      to="/admin/members"
      class="inline-block text-sm font-body text-sienna dark:text-sienna-light hover:underline"
    >
      {{ $t('pages.admin.members.detail.back') }}
    </NuxtLink>

    <div v-if="isLoading" class="flex items-center gap-2" role="status">
      <LoadingDots />
      <span class="sr-only">{{ $t('pages.admin.members.detail.loading') }}</span>
    </div>

    <p v-else-if="loadError" role="alert" class="text-sm font-body text-sienna dark:text-sienna-light">
      {{ $t('pages.admin.members.detail.error') }}
    </p>

    <div v-else-if="member" class="grid gap-6 lg:grid-cols-2 lg:items-start">
      <!-- Left: who they are, and what can be done about it -->
      <div class="space-y-6">
        <div
          class="animate-fade-slide-up bg-white/80 dark:bg-poster-darkCard rounded shadow-lg p-6 border-2 border-navy/15 dark:border-poster-darkBorder"
        >
          <div class="flex items-center gap-3 mb-4">
            <h1 class="text-2xl font-display text-navy dark:text-ivory">
              {{ member.name || $t('pages.admin.members.table.unnamed') }}
            </h1>
            <span
              class="px-2 py-0.5 rounded-full text-xs whitespace-nowrap"
              :class="statusClasses(member.status)"
            >
              {{ statusLabel(member.status) }}
            </span>
          </div>

          <dl class="space-y-2 text-sm font-body">
            <div class="flex gap-3">
              <dt class="w-40 shrink-0 text-navy/60 dark:text-poster-darkMuted">
                {{ $t('pages.admin.members.detail.email') }}
              </dt>
              <dd class="text-navy dark:text-ivory">
                <span>{{ revealedEmail ?? member.email }}</span>
                <button
                  v-if="!revealedEmail"
                  type="button"
                  :disabled="isRevealing"
                  class="ml-2 text-sienna dark:text-sienna-light hover:underline disabled:opacity-60"
                  @click="reveal"
                >
                  {{ $t('pages.admin.members.detail.reveal') }}
                </button>
                <p v-else class="mt-1 text-xs text-navy/60 dark:text-poster-darkMuted">
                  {{ $t('pages.admin.members.detail.revealed-note') }}
                </p>
              </dd>
            </div>
            <div class="flex gap-3">
              <dt class="w-40 shrink-0 text-navy/60 dark:text-poster-darkMuted">
                {{ $t('pages.admin.members.detail.role') }}
              </dt>
              <dd class="text-navy dark:text-ivory">{{ member.role }}</dd>
            </div>
            <div class="flex gap-3">
              <dt class="w-40 shrink-0 text-navy/60 dark:text-poster-darkMuted">
                {{ $t('pages.admin.members.detail.newsletter') }}
              </dt>
              <dd class="text-navy dark:text-ivory">
                {{
                  member.newsletter === 'subscribed'
                    ? $t('pages.admin.members.detail.newsletter-on')
                    : $t('pages.admin.members.detail.newsletter-off')
                }}
              </dd>
            </div>
            <div class="flex gap-3">
              <dt class="w-40 shrink-0 text-navy/60 dark:text-poster-darkMuted">
                {{ $t('pages.admin.members.detail.postalCode') }}
              </dt>
              <dd class="text-navy dark:text-ivory">
                {{ member.postalCode || $t('pages.admin.members.detail.none') }}
              </dd>
            </div>
            <div class="flex gap-3">
              <dt class="w-40 shrink-0 text-navy/60 dark:text-poster-darkMuted">
                {{ $t('pages.admin.members.detail.joined') }}
              </dt>
              <dd class="text-navy dark:text-ivory">{{ formatDate(member.createdAt) }}</dd>
            </div>
          </dl>
        </div>

        <!-- Actions -->
        <div
          class="animate-fade-slide-up bg-white/80 dark:bg-poster-darkCard rounded shadow-lg p-6 border-2 border-navy/15 dark:border-poster-darkBorder space-y-3"
        >
          <h2 class="text-lg font-display text-navy dark:text-ivory">
            {{ $t('pages.admin.members.detail.actions') }}
          </h2>

          <p v-if="actionError" role="alert" class="text-sm font-body text-sienna dark:text-sienna-light">
            {{ actionError }}
          </p>
          <p
            v-else-if="actionNote"
            role="status"
            class="text-sm font-body text-olive-dark dark:text-olive-light"
          >
            {{ actionNote }}
          </p>

          <div v-if="member.status === 'blocked'">
            <button
              type="button"
              :disabled="isActing"
              class="w-full px-5 py-2 text-base font-semibold font-body border-2 border-sienna bg-sienna text-ivory rounded hover:bg-sienna-dark hover:border-sienna-dark transition-colors disabled:opacity-60"
              @click="setBlocked(false)"
            >
              {{ $t('pages.admin.members.detail.unblock') }}
            </button>
          </div>
          <div v-else class="space-y-2">
            <label
              for="block-reason"
              class="block text-sm font-medium font-body text-navy dark:text-ivory"
            >
              {{ $t('pages.admin.members.detail.block-reason') }}
            </label>
            <input
              id="block-reason"
              v-model.trim="blockReason"
              type="text"
              class="bg-ivory dark:bg-poster-dark border-2 border-navy/20 dark:border-poster-darkBorder text-navy dark:text-ivory text-sm rounded font-body focus:border-sienna dark:focus:border-sienna-dark focus:outline-none block w-full p-2"
              :placeholder="$t('pages.admin.members.detail.block-reason-placeholder')"
            />
            <button
              type="button"
              :disabled="isActing || member.status === 'deleted'"
              class="w-full px-5 py-2 text-base font-semibold font-body border-2 border-sienna text-sienna dark:text-sienna-light dark:border-sienna-dark rounded hover:bg-sienna hover:text-ivory transition-colors disabled:opacity-60"
              @click="setBlocked(true)"
            >
              {{ $t('pages.admin.members.detail.block') }}
            </button>
          </div>

          <button
            type="button"
            :disabled="isActing || activeCount(member) === 0"
            class="w-full px-5 py-2 text-base font-semibold font-body border-2 border-navy/20 dark:border-poster-darkBorder text-navy dark:text-ivory rounded hover:border-sienna transition-colors disabled:opacity-60"
            @click="revokeSessions"
          >
            {{ $t('pages.admin.members.detail.revoke-sessions', { count: activeCount(member) }) }}
          </button>

          <button
            type="button"
            :disabled="isActing || member.status !== 'active'"
            class="w-full px-5 py-2 text-base font-semibold font-body border-2 border-navy/20 dark:border-poster-darkBorder text-navy dark:text-ivory rounded hover:border-sienna transition-colors disabled:opacity-60"
            @click="sendLoginLink"
          >
            {{ $t('pages.admin.members.detail.send-login-link') }}
          </button>

          <NuxtLink
            to="/admin/members/add"
            class="block text-center px-5 py-2 text-base font-semibold font-body border-2 border-navy/20 dark:border-poster-darkBorder text-navy dark:text-ivory rounded hover:border-sienna transition-colors"
          >
            {{ $t('pages.admin.members.detail.calendars') }}
          </NuxtLink>
          <p class="text-xs font-body text-navy/60 dark:text-poster-darkMuted">
            {{ $t('pages.admin.members.detail.calendars-hint') }}
          </p>
        </div>
      </div>

      <!-- Right: sessions and chronicle -->
      <div class="space-y-6">
        <div
          class="animate-fade-slide-up bg-white/80 dark:bg-poster-darkCard rounded shadow-lg p-6 border-2 border-navy/15 dark:border-poster-darkBorder"
        >
          <h2 class="text-lg font-display text-navy dark:text-ivory mb-4">
            {{ $t('pages.admin.members.detail.sessions', { count: activeCount(member) }) }}
          </h2>
          <p
            v-if="member.sessions.length === 0"
            class="text-sm font-body text-navy/60 dark:text-poster-darkMuted"
          >
            {{ $t('pages.admin.members.detail.sessions-empty') }}
          </p>
          <table v-else class="w-full text-sm font-body text-left text-navy dark:text-ivory">
            <thead class="text-xs uppercase text-navy/60 dark:text-poster-darkMuted">
              <tr class="border-b border-navy/10 dark:border-poster-darkBorder">
                <th class="py-2 pr-3">{{ $t('pages.admin.members.detail.session-started') }}</th>
                <th class="py-2 px-3">{{ $t('pages.admin.members.detail.session-last-seen') }}</th>
                <th class="py-2 pl-3">{{ $t('pages.admin.members.table.status') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="session in member.sessions"
                :key="session.id"
                class="border-b border-navy/5 dark:border-poster-darkBorder/50"
              >
                <td class="py-2 pr-3 whitespace-nowrap">{{ formatDate(session.createdAt) }}</td>
                <td class="py-2 px-3 whitespace-nowrap">{{ formatDate(session.lastSeenAt) }}</td>
                <td class="py-2 pl-3">
                  <span
                    class="px-2 py-0.5 rounded-full text-xs whitespace-nowrap"
                    :class="
                      session.active
                        ? 'bg-olive/15 text-olive-dark dark:text-olive-light'
                        : 'bg-navy/10 text-navy/60 dark:text-poster-darkMuted'
                    "
                  >
                    {{ sessionLabel(session) }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div
          class="animate-fade-slide-up bg-white/80 dark:bg-poster-darkCard rounded shadow-lg p-6 border-2 border-navy/15 dark:border-poster-darkBorder"
        >
          <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 class="text-lg font-display text-navy dark:text-ivory">
              {{ $t('pages.admin.members.detail.chronicle') }}
            </h2>
            <select
              v-model="group"
              class="bg-ivory dark:bg-poster-dark border-2 border-navy/20 dark:border-poster-darkBorder text-navy dark:text-ivory text-sm rounded font-body focus:border-sienna focus:outline-none p-1.5"
              :aria-label="$t('pages.admin.members.detail.chronicle-filter')"
              @change="loadEvents"
            >
              <option v-for="option in groupOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </div>

          <p
            v-if="events.length === 0"
            class="text-sm font-body text-navy/60 dark:text-poster-darkMuted"
          >
            {{ $t('pages.admin.members.detail.chronicle-empty') }}
          </p>
          <ul v-else class="space-y-2 text-sm font-body">
            <li
              v-for="entry in events"
              :key="entry.id"
              class="flex gap-3 border-b border-navy/5 dark:border-poster-darkBorder/50 pb-2"
            >
              <span class="w-36 shrink-0 text-navy/60 dark:text-poster-darkMuted whitespace-nowrap">
                {{ formatDateTime(entry.at) }}
              </span>
              <span class="text-navy dark:text-ivory">
                {{ entry.type }}
                <span v-if="entry.actorUid" class="text-navy/60 dark:text-poster-darkMuted">
                  {{ $t('pages.admin.members.detail.by-admin') }}
                </span>
                <span v-if="entry.origin" class="text-navy/40 dark:text-poster-darkMuted">
                  · {{ entry.origin }}
                </span>
              </span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  definePageMeta({
    middleware: ['authenticated', 'admin'],
  })

  // The client with the 401 handling — see useApi().
  const api = useApi()
  const { t, locale } = useI18n()
  const route = useRoute()

  const uid = route.params.uid as string

  type MemberStatus = 'active' | 'blocked' | 'deleted'

  interface MemberSession {
    id: string
    createdAt: string | null
    expiresAt: string | null
    lastSeenAt: string | null
    revokedAt: string | null
    active: boolean
  }

  interface MemberDetail {
    uid: string
    name: string
    /** Masked until `reveal` says otherwise. */
    email: string
    role: string
    status: MemberStatus
    newsletter: string
    postalCode: string | null
    createdAt: string | null
    deletedAt: string | null
    sessions: MemberSession[]
  }

  interface ChronicleEntry {
    id: number
    at: string
    type: string
    meta: Record<string, unknown> | null
    origin: string | null
    actorUid: string | null
  }

  const member = ref<MemberDetail | null>(null)
  const events = ref<ChronicleEntry[]>([])
  const group = ref<string>('')
  const isLoading = ref(true)
  const loadError = ref(false)

  const revealedEmail = ref<string | null>(null)
  const isRevealing = ref(false)
  const isActing = ref(false)
  const actionNote = ref<string | null>(null)
  const actionError = ref<string | null>(null)
  const blockReason = ref('')

  /**
   * Taken from the member rather than kept alongside them: every place that
   * asks is inside the `v-else-if="member"` branch, so there is no second
   * state to drift out of step with the session list it counts.
   */
  function activeCount(detail: MemberDetail): number {
    return detail.sessions.filter((session) => session.active).length
  }

  const groupOptions = computed(() => [
    { value: '', label: t('pages.admin.members.detail.group-all') },
    { value: 'auth', label: t('pages.admin.members.detail.group-auth') },
    { value: 'session', label: t('pages.admin.members.detail.group-session') },
    { value: 'newsletter', label: t('pages.admin.members.detail.group-newsletter') },
    { value: 'admin', label: t('pages.admin.members.detail.group-admin') },
  ])

  async function loadMember(): Promise<void> {
    isLoading.value = true
    loadError.value = false
    try {
      member.value = await api<MemberDetail>(`/api/admin/members/${uid}`)
      // eslint-disable-next-line no-catch-all/no-catch-all -- einzelner api()-Aufruf: Fehler wird geloggt und als Statusmeldung angezeigt
    } catch (error) {
      console.error(error)
      loadError.value = true
    } finally {
      isLoading.value = false
    }
  }

  async function loadEvents(): Promise<void> {
    try {
      const result = await api<{ events: ChronicleEntry[] }>(`/api/admin/members/${uid}/events`, {
        query: group.value ? { group: group.value } : undefined,
      })
      events.value = result.events
      // eslint-disable-next-line no-catch-all/no-catch-all -- die Chronik ist Beiwerk; ein Fehler darf die Seite nicht leeren
    } catch (error) {
      console.error(error)
      events.value = []
    }
  }

  /**
   * Runs an action, then re-reads the member: every one of them changes
   * something the page is showing (the status badge, the session list), and
   * guessing at the new state client-side is how the two drift apart.
   */
  async function act(run: () => Promise<string>): Promise<void> {
    isActing.value = true
    actionNote.value = null
    actionError.value = null
    try {
      actionNote.value = await run()
      await Promise.all([loadMember(), loadEvents()])
      // eslint-disable-next-line no-catch-all/no-catch-all -- einzelner api()-Aufruf: Fehler wird als Statusmeldung angezeigt
    } catch (error) {
      console.error(error)
      actionError.value = t('pages.admin.members.detail.action-error')
    } finally {
      isActing.value = false
    }
  }

  async function reveal(): Promise<void> {
    isRevealing.value = true
    actionError.value = null
    try {
      const result = await api<{ email: string }>(`/api/admin/members/${uid}/reveal`, {
        method: 'POST',
      })
      revealedEmail.value = result.email
      await loadEvents()
      // eslint-disable-next-line no-catch-all/no-catch-all -- einzelner api()-Aufruf: Fehler wird als Statusmeldung angezeigt
    } catch (error) {
      console.error(error)
      actionError.value = t('pages.admin.members.detail.action-error')
    } finally {
      isRevealing.value = false
    }
  }

  async function setBlocked(blocked: boolean): Promise<void> {
    await act(async () => {
      const result = await api<{ revokedSessions: number }>(
        `/api/admin/members/${uid}/block`,
        {
          method: 'POST',
          body: { blocked, ...(blockReason.value ? { reason: blockReason.value } : {}) },
        },
      )
      blockReason.value = ''
      return blocked
        ? t('pages.admin.members.detail.blocked-note', { count: result.revokedSessions })
        : t('pages.admin.members.detail.unblocked-note')
    })
  }

  async function revokeSessions(): Promise<void> {
    await act(async () => {
      const result = await api<{ revokedSessions: number }>(
        `/api/admin/members/${uid}/sessions`,
        { method: 'POST' },
      )
      return t('pages.admin.members.detail.revoked-note', { count: result.revokedSessions })
    })
  }

  async function sendLoginLink(): Promise<void> {
    await act(async () => {
      await api(`/api/admin/members/${uid}/login-link`, { method: 'POST' })
      return t('pages.admin.members.detail.login-link-note')
    })
  }

  function statusClasses(value: MemberStatus): string {
    return value === 'active'
      ? 'bg-olive/15 text-olive-dark dark:text-olive-light'
      : 'bg-sienna/15 text-sienna-dark dark:text-sienna-light'
  }

  // Static-key lookup (no dynamic i18n keys) for the status badge label.
  function statusLabel(value: MemberStatus): string {
    return {
      active: t('pages.admin.members.status.active'),
      blocked: t('pages.admin.members.status.blocked'),
      deleted: t('pages.admin.members.status.deleted'),
    }[value]
  }

  function sessionLabel(session: MemberSession): string {
    if (session.active) return t('pages.admin.members.detail.session-active')
    return session.revokedAt
      ? t('pages.admin.members.detail.session-revoked')
      : t('pages.admin.members.detail.session-expired')
  }

  function formatDate(value: string | null): string {
    if (!value) return t('pages.admin.members.table.never')
    return new Date(value).toLocaleDateString(locale.value, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  }

  function formatDateTime(value: string): string {
    return new Date(value).toLocaleString(locale.value, {
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  onMounted(async () => {
    await Promise.all([loadMember(), loadEvents()])
  })
</script>
