<script setup lang="ts">
  definePageMeta({
    middleware: ['authenticated', 'admin'],
  })

  const { t } = useI18n()
  const { user } = useUserSession()

  type LinkStatus = 'valid' | 'revoked' | 'expired' | 'exhausted'

  interface LinkRow {
    token: string
    label: string | null
    maxUses: number | null
    expiresAt: string | null
    revokedAt: string | null
    createdAt: string
    createdByUid: string
    createdByName: string | null
    createdByEmail: string | null
    useCount: number
    status: LinkStatus
    url: string
    /** Calendars a redemption grants private access to. null = no binding. */
    calendars: string[] | null
    /** Joins that received something other than the binding shown above. */
    divergentUseCount: number
  }

  // Copying, editing, reactivating and deleting are reserved for the link's
  // creator (enforced server-side too); viewing and deactivating stay open to
  // every admin.
  function isOwner(row: LinkRow): boolean {
    return row.createdByUid === user.value?.uid
  }

  const links = ref<LinkRow[]>([])
  const isLoading = ref(true)
  const loadError = ref(false)

  const label = ref('')
  const duration = ref<'1d' | '7d' | '30d' | 'unlimited'>('30d')
  const maxUses = ref<number | null>(null)
  const isCreating = ref(false)
  const createError = ref(false)
  const copiedToken = ref<string | null>(null)

  // Calendars this admin may hand out (their own X-ADMIN-TAGS). An empty list
  // means the admin administers no calendar, so the binding UI stays hidden.
  // `key` is the stable identity that gets stored; `label` is only for display.
  const grantableCalendars = ref<{ key: string; label: string }[]>([])
  const selectedCalendars = ref<string[]>([])

  // Every calendar on the server, purely to label keys a link is bound to — a
  // link may reference a calendar this admin does not administer, so the
  // grantable list above is not enough to resolve every badge.
  const calendarLabels = ref<Record<string, string>>({})
  function calendarLabel(key: string): string {
    return calendarLabels.value[key] || key
  }

  // Inline row editing (label + validity + calendar binding).
  const editingToken = ref<string | null>(null)
  const editLabel = ref('')
  const editDuration = ref<'keep' | '1d' | '7d' | '30d' | 'unlimited'>('keep')
  const editCalendars = ref<string[]>([])
  const isSavingEdit = ref(false)

  const durationOptions: { value: typeof duration.value; label: string }[] = [
    { value: '1d', label: t('pages.admin.links.duration.1d') },
    { value: '7d', label: t('pages.admin.links.duration.7d') },
    { value: '30d', label: t('pages.admin.links.duration.30d') },
    { value: 'unlimited', label: t('pages.admin.links.duration.unlimited') },
  ]

  const editDurationOptions: { value: typeof editDuration.value; label: string }[] = [
    { value: 'keep', label: t('pages.admin.links.table.keepValidity') },
    { value: '1d', label: t('pages.admin.links.duration.1d') },
    { value: '7d', label: t('pages.admin.links.duration.7d') },
    { value: '30d', label: t('pages.admin.links.duration.30d') },
    { value: 'unlimited', label: t('pages.admin.links.duration.unlimited') },
  ]

  async function loadLinks() {
    isLoading.value = true
    loadError.value = false
    try {
      links.value = await $fetch<LinkRow[]>('/api/admin/registration-links/list')
      // eslint-disable-next-line no-catch-all/no-catch-all -- einzelner $fetch: Fehler wird geloggt und als loadError angezeigt
    } catch (error) {
      console.error(error)
      loadError.value = true
    } finally {
      isLoading.value = false
    }
  }

  async function loadGrantableCalendars() {
    try {
      grantableCalendars.value = await $fetch<{ key: string; label: string }[]>(
        '/api/admin/grantable-calendars',
      )
      // eslint-disable-next-line no-catch-all/no-catch-all -- einzelner $fetch: Fehler wird geloggt, leere Auswahl ist der Fallback
    } catch (error) {
      console.error(error)
      grantableCalendars.value = []
    }
  }

  async function loadCalendarLabels() {
    try {
      const calendars = await $fetch<{ key: string; name: string }[]>('/api/calendars')
      calendarLabels.value = Object.fromEntries(calendars.map((c) => [c.key, c.name]))
      // eslint-disable-next-line no-catch-all/no-catch-all -- einzelner $fetch: Fehler wird geloggt, Keys werden dann roh angezeigt
    } catch (error) {
      console.error(error)
      calendarLabels.value = {}
    }
  }

  async function createLink() {
    isCreating.value = true
    createError.value = false
    try {
      await $fetch('/api/admin/registration-links/create', {
        method: 'POST',
        body: {
          ...(label.value.trim() ? { label: label.value.trim() } : {}),
          duration: duration.value,
          ...(maxUses.value && maxUses.value > 0 ? { maxUses: maxUses.value } : {}),
          calendars: selectedCalendars.value,
        },
      })
      label.value = ''
      maxUses.value = null
      duration.value = '30d'
      selectedCalendars.value = []
      await loadLinks()
      // eslint-disable-next-line no-catch-all/no-catch-all -- einzelner $fetch: Fehler wird geloggt und als createError angezeigt
    } catch (error) {
      console.error(error)
      createError.value = true
    } finally {
      isCreating.value = false
    }
  }

  async function revokeLink(token: string) {
    try {
      await $fetch('/api/admin/registration-links/revoke', {
        method: 'POST',
        body: { token },
      })
      await loadLinks()
      // eslint-disable-next-line no-catch-all/no-catch-all -- einzelner $fetch: Fehler wird geloggt, Liste wird neu geladen
    } catch (error) {
      console.error(error)
    }
  }

  function startEdit(row: LinkRow) {
    editingToken.value = row.token
    editLabel.value = row.label ?? ''
    editDuration.value = 'keep'
    editCalendars.value = [...(row.calendars ?? [])]
  }

  function cancelEdit() {
    editingToken.value = null
  }

  async function saveEdit(token: string) {
    isSavingEdit.value = true
    try {
      await $fetch('/api/admin/registration-links/update', {
        method: 'POST',
        body: {
          token,
          label: editLabel.value.trim(),
          ...(editDuration.value !== 'keep' ? { duration: editDuration.value } : {}),
          calendars: editCalendars.value,
        },
      })
      editingToken.value = null
      await loadLinks()
      // eslint-disable-next-line no-catch-all/no-catch-all -- einzelner $fetch: Fehler wird geloggt, Liste wird neu geladen
    } catch (error) {
      console.error(error)
    } finally {
      isSavingEdit.value = false
    }
  }

  async function reactivateLink(token: string) {
    try {
      await $fetch('/api/admin/registration-links/reactivate', {
        method: 'POST',
        body: { token },
      })
      await loadLinks()
      // eslint-disable-next-line no-catch-all/no-catch-all -- einzelner $fetch: Fehler wird geloggt, Liste wird neu geladen
    } catch (error) {
      console.error(error)
    }
  }

  // Deletable only once deactivated and never redeemed (enforced server-side too).
  async function deleteLink(token: string) {
    try {
      await $fetch('/api/admin/registration-links/delete', {
        method: 'POST',
        body: { token },
      })
      await loadLinks()
      // eslint-disable-next-line no-catch-all/no-catch-all -- einzelner $fetch: Fehler wird geloggt, Liste wird neu geladen
    } catch (error) {
      console.error(error)
    }
  }

  async function copyUrl(row: LinkRow) {
    try {
      await navigator.clipboard.writeText(row.url)
      copiedToken.value = row.token
      setTimeout(() => {
        if (copiedToken.value === row.token) copiedToken.value = null
      }, 2000)
      // eslint-disable-next-line no-catch-all/no-catch-all -- Clipboard-API kann vom Browser verweigert werden; Fehler wird geloggt
    } catch (error) {
      console.error(error)
    }
  }

  function formatDate(value: string | null): string {
    if (!value) return t('pages.admin.links.table.never')
    return new Date(value).toLocaleDateString('de-DE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  }

  function statusClasses(status: LinkStatus): string {
    return status === 'valid'
      ? 'bg-olive/15 text-olive-dark dark:text-olive-light'
      : 'bg-sienna/15 text-sienna-dark dark:text-sienna-light'
  }

  // Static-key lookup (no dynamic i18n keys) for the status badge label.
  function statusLabel(status: LinkStatus): string {
    return {
      valid: t('pages.admin.links.status.valid'),
      revoked: t('pages.admin.links.status.revoked'),
      expired: t('pages.admin.links.status.expired'),
      exhausted: t('pages.admin.links.status.exhausted'),
    }[status]
  }

  onMounted(async () => {
    await Promise.all([loadLinks(), loadGrantableCalendars(), loadCalendarLabels()])
  })
</script>

<template>
  <div class="space-y-6">
    <h1 class="hidden md:block text-2xl font-display text-navy dark:text-ivory">
      {{ $t('pages.admin.links.title') }}
    </h1>

    <!-- Create form -->
    <div
      class="animate-fade-slide-up bg-white/80 dark:bg-poster-darkCard rounded shadow-lg p-6 border-2 border-navy/15 dark:border-poster-darkBorder"
    >
      <h2 class="text-lg font-display text-navy dark:text-ivory mb-4">
        {{ $t('pages.admin.links.create.title') }}
      </h2>
      <form class="space-y-4" @submit.prevent="createLink">
        <div class="grid gap-4 sm:grid-cols-3">
          <div class="sm:col-span-1">
            <label
              for="link-label"
              class="block mb-2 text-sm font-medium font-body text-navy dark:text-ivory"
            >
              {{ $t('pages.admin.links.create.label') }}
            </label>
            <input
              id="link-label"
              v-model="label"
              type="text"
              class="bg-ivory dark:bg-poster-dark border-2 border-navy/20 dark:border-poster-darkBorder text-navy dark:text-ivory text-base rounded font-body focus:border-sienna dark:focus:border-sienna-dark focus:outline-none block w-full p-2.5"
              :placeholder="$t('pages.admin.links.create.label-placeholder')"
            />
          </div>
          <div class="sm:col-span-1">
            <label
              for="link-duration"
              class="block mb-2 text-sm font-medium font-body text-navy dark:text-ivory"
            >
              {{ $t('pages.admin.links.create.duration') }}
            </label>
            <select
              id="link-duration"
              v-model="duration"
              class="bg-ivory dark:bg-poster-dark border-2 border-navy/20 dark:border-poster-darkBorder text-navy dark:text-ivory text-base rounded font-body focus:border-sienna dark:focus:border-sienna-dark focus:outline-none block w-full p-2.5"
            >
              <option v-for="opt in durationOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </div>
          <div class="sm:col-span-1">
            <label
              for="link-max-uses"
              class="block mb-2 text-sm font-medium font-body text-navy dark:text-ivory"
            >
              {{ $t('pages.admin.links.create.maxUses') }}
            </label>
            <input
              id="link-max-uses"
              v-model.number="maxUses"
              type="number"
              min="1"
              class="bg-ivory dark:bg-poster-dark border-2 border-navy/20 dark:border-poster-darkBorder text-navy dark:text-ivory text-base rounded font-body focus:border-sienna dark:focus:border-sienna-dark focus:outline-none block w-full p-2.5"
              :placeholder="$t('pages.admin.links.create.maxUses-placeholder')"
            />
          </div>
        </div>
        <fieldset v-if="grantableCalendars.length > 0">
          <legend class="block mb-2 text-sm font-medium font-body text-navy dark:text-ivory">
            {{ $t('pages.admin.links.create.calendars') }}
          </legend>
          <p class="mb-2 text-xs font-body text-navy/60 dark:text-poster-darkMuted">
            {{ $t('pages.admin.links.create.calendars-hint') }}
          </p>
          <div class="flex flex-wrap gap-x-6 gap-y-2">
            <div
              v-for="calendar in grantableCalendars"
              :key="calendar.key"
              class="flex items-center"
            >
              <input
                :id="`link-calendar-${calendar.key}`"
                v-model="selectedCalendars"
                :value="calendar.key"
                type="checkbox"
                class="w-4 h-4 text-sienna bg-ivory dark:bg-poster-dark border-navy/20 dark:border-poster-darkBorder rounded focus:ring-sienna dark:focus:ring-sienna-dark focus:ring-2 accent-sienna"
              />
              <label
                :for="`link-calendar-${calendar.key}`"
                class="ms-2 text-sm font-medium font-body text-navy dark:text-ivory"
              >
                {{ calendar.label }}
              </label>
            </div>
          </div>
        </fieldset>
        <button
          type="submit"
          :disabled="isCreating"
          class="text-ivory bg-olive hover:brightness-110 dark:bg-olive-dark dark:hover:brightness-110 focus:ring-4 focus:outline-none focus:ring-olive/30 font-semibold font-body rounded text-base px-5 py-2.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {{
            isCreating
              ? $t('pages.admin.links.create.creating')
              : $t('pages.admin.links.create.button')
          }}
        </button>
        <p
          v-if="createError"
          role="alert"
          class="text-sm font-body text-sienna dark:text-sienna-light"
        >
          {{ $t('pages.admin.links.create.error') }}
        </p>
      </form>
    </div>

    <!-- List -->
    <div
      class="animate-fade-slide-up stagger-1 bg-white/80 dark:bg-poster-darkCard rounded shadow-lg p-6 border-2 border-navy/15 dark:border-poster-darkBorder"
    >
      <h2 class="text-lg font-display text-navy dark:text-ivory mb-4">
        {{ $t('pages.admin.links.list.title') }}
      </h2>

      <div v-if="isLoading" class="flex items-center justify-center gap-2 py-8">
        <LoadingDots />
      </div>
      <p
        v-else-if="loadError"
        role="alert"
        class="text-sm font-body text-sienna dark:text-sienna-light"
      >
        {{ $t('pages.admin.links.list.error') }}
      </p>
      <p
        v-else-if="links.length === 0"
        class="text-sm font-body text-navy/60 dark:text-poster-darkMuted"
      >
        {{ $t('pages.admin.links.list.empty') }}
      </p>
      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm font-body text-left text-navy dark:text-ivory">
          <thead class="text-xs uppercase text-navy/60 dark:text-poster-darkMuted">
            <tr class="border-b border-navy/10 dark:border-poster-darkBorder">
              <th class="py-2 pr-3">{{ $t('pages.admin.links.table.label') }}</th>
              <th class="py-2 px-3">{{ $t('pages.admin.links.table.createdBy') }}</th>
              <th class="py-2 px-3">{{ $t('pages.admin.links.table.calendars') }}</th>
              <th class="py-2 px-3">{{ $t('pages.admin.links.table.expires') }}</th>
              <th class="py-2 px-3">{{ $t('pages.admin.links.table.uses') }}</th>
              <th class="py-2 px-3">{{ $t('pages.admin.links.table.status') }}</th>
              <th class="py-2 pl-3 text-right">{{ $t('pages.admin.links.table.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in links"
              :key="row.token"
              class="border-b border-navy/5 dark:border-poster-darkBorder/50"
            >
              <td class="py-2 pr-3 font-medium">
                <input
                  v-if="editingToken === row.token"
                  v-model="editLabel"
                  type="text"
                  class="bg-ivory dark:bg-poster-dark border-2 border-navy/20 dark:border-poster-darkBorder text-navy dark:text-ivory text-sm rounded font-body focus:border-sienna dark:focus:border-sienna-dark focus:outline-none block w-full p-1.5"
                  :placeholder="$t('pages.admin.links.create.label-placeholder')"
                />
                <template v-else>{{ row.label || $t('pages.admin.links.table.unnamed') }}</template>
              </td>
              <td class="py-2 px-3 text-navy/70 dark:text-ivory/70">
                {{ row.createdByName || row.createdByEmail }}
              </td>
              <td class="py-2 px-3">
                <div
                  v-if="editingToken === row.token && grantableCalendars.length > 0"
                  class="flex flex-col gap-1"
                >
                  <div
                    v-for="calendar in grantableCalendars"
                    :key="calendar.key"
                    class="flex items-center"
                  >
                    <input
                      :id="`edit-calendar-${row.token}-${calendar.key}`"
                      v-model="editCalendars"
                      :value="calendar.key"
                      type="checkbox"
                      class="w-4 h-4 text-sienna bg-ivory dark:bg-poster-dark border-navy/20 dark:border-poster-darkBorder rounded focus:ring-sienna dark:focus:ring-sienna-dark focus:ring-2 accent-sienna"
                    />
                    <label
                      :for="`edit-calendar-${row.token}-${calendar.key}`"
                      class="ms-2 text-xs font-body text-navy dark:text-ivory"
                    >
                      {{ calendar.label }}
                    </label>
                  </div>
                </div>
                <template v-else-if="row.calendars?.length">
                  <span
                    v-for="calendar in row.calendars"
                    :key="calendar"
                    class="inline-block mr-1 mb-1 rounded px-2 py-0.5 text-xs font-medium bg-navy/10 dark:bg-poster-darkBorder text-navy dark:text-ivory"
                  >
                    {{ calendarLabel(calendar) }}
                  </span>
                </template>
                <span v-else class="text-navy/40 dark:text-poster-darkMuted">
                  {{ $t('pages.admin.links.table.noCalendars') }}
                </span>
              </td>
              <td class="py-2 px-3 text-navy/70 dark:text-ivory/70">
                <select
                  v-if="editingToken === row.token"
                  v-model="editDuration"
                  class="bg-ivory dark:bg-poster-dark border-2 border-navy/20 dark:border-poster-darkBorder text-navy dark:text-ivory text-sm rounded font-body focus:border-sienna dark:focus:border-sienna-dark focus:outline-none block w-full p-1.5"
                >
                  <option v-for="opt in editDurationOptions" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </option>
                </select>
                <template v-else>{{ formatDate(row.expiresAt) }}</template>
              </td>
              <td class="py-2 px-3">
                {{ row.useCount }}{{ row.maxUses ? ' / ' + row.maxUses : '' }}
                <!-- The binding is editable, so past joins may have received
                     something else. Without this the count above would read as
                     "all of them got the calendars shown". -->
                <span
                  v-if="row.divergentUseCount > 0"
                  class="block text-xs text-navy/50 dark:text-poster-darkMuted"
                  :title="$t('pages.admin.links.table.divergentHint')"
                >
                  {{ $t('pages.admin.links.table.divergent', { count: row.divergentUseCount }) }}
                </span>
              </td>
              <td class="py-2 px-3">
                <span
                  class="inline-block rounded px-2 py-0.5 text-xs font-medium"
                  :class="statusClasses(row.status)"
                >
                  {{ statusLabel(row.status) }}
                </span>
              </td>
              <td class="py-2 pl-3">
                <div class="flex items-center justify-end gap-3">
                  <template v-if="editingToken === row.token">
                    <button
                      type="button"
                      class="text-olive dark:text-olive-light hover:underline font-medium disabled:opacity-50"
                      :disabled="isSavingEdit"
                      @click="saveEdit(row.token)"
                    >
                      {{ $t('pages.admin.links.table.save') }}
                    </button>
                    <button
                      type="button"
                      class="text-navy/60 dark:text-ivory/60 hover:underline font-medium"
                      @click="cancelEdit"
                    >
                      {{ $t('pages.admin.links.table.cancel') }}
                    </button>
                  </template>
                  <template v-else>
                    <button
                      v-if="isOwner(row)"
                      type="button"
                      class="text-sienna dark:text-sienna-light hover:underline font-medium"
                      @click="copyUrl(row)"
                    >
                      {{
                        copiedToken === row.token
                          ? $t('pages.admin.links.table.copied')
                          : $t('pages.admin.links.table.copy')
                      }}
                    </button>
                    <button
                      v-if="isOwner(row)"
                      type="button"
                      class="text-navy/60 dark:text-ivory/60 hover:text-sienna dark:hover:text-sienna-light font-medium"
                      @click="startEdit(row)"
                    >
                      {{ $t('pages.admin.links.table.edit') }}
                    </button>
                    <button
                      v-if="row.status !== 'revoked'"
                      type="button"
                      class="text-navy/60 dark:text-ivory/60 hover:text-sienna dark:hover:text-sienna-light font-medium"
                      @click="revokeLink(row.token)"
                    >
                      {{ $t('pages.admin.links.table.revoke') }}
                    </button>
                    <button
                      v-if="row.status === 'revoked' && isOwner(row)"
                      type="button"
                      class="text-olive dark:text-olive-light hover:underline font-medium"
                      @click="reactivateLink(row.token)"
                    >
                      {{ $t('pages.admin.links.table.reactivate') }}
                    </button>
                    <button
                      v-if="row.status === 'revoked' && row.useCount === 0 && isOwner(row)"
                      type="button"
                      class="text-sienna dark:text-sienna-light hover:underline font-medium"
                      @click="deleteLink(row.token)"
                    >
                      {{ $t('pages.admin.links.table.delete') }}
                    </button>
                  </template>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
  .stagger-1 {
    animation-delay: 0.1s;
  }
</style>
