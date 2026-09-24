<template>
  <div class="space-y-6">
    <h1 class="hidden md:block text-2xl font-display text-navy dark:text-ivory">
      {{ $t('pages.admin.members.title') }}
    </h1>

    <!-- Search -->
    <div
      class="animate-fade-slide-up bg-white/80 dark:bg-poster-darkCard rounded shadow-lg p-6 border-2 border-navy/15 dark:border-poster-darkBorder"
    >
      <form class="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end" @submit.prevent="search">
        <div>
          <label
            for="member-search"
            class="block mb-2 text-sm font-medium font-body text-navy dark:text-ivory"
          >
            {{ $t('pages.admin.members.search.label') }}
          </label>
          <input
            id="member-search"
            v-model.trim="term"
            type="search"
            class="bg-ivory dark:bg-poster-dark border-2 border-navy/20 dark:border-poster-darkBorder text-navy dark:text-ivory text-base rounded font-body focus:border-sienna dark:focus:border-sienna-dark focus:outline-none block w-full p-2.5"
            :placeholder="$t('pages.admin.members.search.placeholder')"
          />
        </div>
        <div>
          <label
            for="member-status"
            class="block mb-2 text-sm font-medium font-body text-navy dark:text-ivory"
          >
            {{ $t('pages.admin.members.search.status') }}
          </label>
          <select
            id="member-status"
            v-model="status"
            class="bg-ivory dark:bg-poster-dark border-2 border-navy/20 dark:border-poster-darkBorder text-navy dark:text-ivory text-base rounded font-body focus:border-sienna dark:focus:border-sienna-dark focus:outline-none block w-full p-2.5"
            @change="search"
          >
            <option v-for="option in statusOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </div>
        <button
          type="submit"
          class="px-5 py-2.5 text-base font-semibold font-body border-2 border-sienna bg-sienna text-ivory rounded hover:bg-sienna-dark hover:border-sienna-dark transition-colors"
        >
          {{ $t('pages.admin.members.search.submit') }}
        </button>
      </form>
      <p class="mt-3 text-xs font-body text-navy/60 dark:text-poster-darkMuted">
        {{ $t('pages.admin.members.search.hint') }}
      </p>
    </div>

    <!-- List -->
    <div
      class="animate-fade-slide-up bg-white/80 dark:bg-poster-darkCard rounded shadow-lg p-6 border-2 border-navy/15 dark:border-poster-darkBorder"
    >
      <div v-if="isLoading" class="flex items-center gap-2" role="status">
        <LoadingDots />
        <span class="sr-only">{{ $t('pages.admin.members.list.loading') }}</span>
      </div>
      <p
        v-else-if="loadError"
        role="alert"
        class="text-sm font-body text-sienna dark:text-sienna-light"
      >
        {{ $t('pages.admin.members.list.error') }}
      </p>
      <p
        v-else-if="members.length === 0"
        class="text-sm font-body text-navy/60 dark:text-poster-darkMuted"
      >
        {{ $t('pages.admin.members.list.empty') }}
      </p>
      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm font-body text-left text-navy dark:text-ivory">
          <thead class="text-xs uppercase text-navy/60 dark:text-poster-darkMuted">
            <tr class="border-b border-navy/10 dark:border-poster-darkBorder">
              <th class="py-2 pr-3">{{ $t('pages.admin.members.table.name') }}</th>
              <th class="py-2 px-3">{{ $t('pages.admin.members.table.email') }}</th>
              <th class="py-2 px-3">{{ $t('pages.admin.members.table.status') }}</th>
              <th class="py-2 px-3">{{ $t('pages.admin.members.table.sessions') }}</th>
              <th class="py-2 px-3">{{ $t('pages.admin.members.table.lastSeen') }}</th>
              <th class="py-2 pl-3 text-right">{{ $t('pages.admin.members.table.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="member in members"
              :key="member.uid"
              class="border-b border-navy/5 dark:border-poster-darkBorder/50"
            >
              <td class="py-2 pr-3 font-medium">
                {{ member.name || $t('pages.admin.members.table.unnamed') }}
                <span
                  v-if="member.role === 'admin'"
                  class="ml-2 px-2 py-0.5 rounded-full text-xs bg-mustard/20 text-navy dark:text-ivory"
                >
                  {{ $t('pages.admin.members.table.admin') }}
                </span>
              </td>
              <td class="py-2 px-3 text-navy/70 dark:text-ivory/70 whitespace-nowrap">
                {{ member.email }}
              </td>
              <td class="py-2 px-3">
                <span
                  class="px-2 py-0.5 rounded-full text-xs whitespace-nowrap"
                  :class="statusClasses(member.status)"
                >
                  {{ statusLabel(member.status) }}
                </span>
              </td>
              <td class="py-2 px-3">{{ member.activeSessions }}</td>
              <td class="py-2 px-3 whitespace-nowrap">{{ formatDate(member.lastSeenAt) }}</td>
              <td class="py-2 pl-3 text-right">
                <NuxtLink
                  :to="`/admin/members/${member.uid}`"
                  class="text-sienna dark:text-sienna-light hover:underline"
                >
                  {{ $t('pages.admin.members.table.open') }}
                </NuxtLink>
              </td>
            </tr>
          </tbody>
        </table>

        <div class="flex items-center justify-between gap-4 mt-4">
          <p class="text-xs font-body text-navy/60 dark:text-poster-darkMuted">
            {{ $t('pages.admin.members.list.count', { shown: members.length, total }) }}
          </p>
          <div class="flex items-center gap-2">
            <button
              type="button"
              :disabled="page <= 1"
              class="px-3 py-1.5 text-sm font-body border-2 border-navy/20 dark:border-poster-darkBorder rounded disabled:opacity-40 disabled:cursor-not-allowed"
              @click="goToPage(page - 1)"
            >
              {{ $t('pages.admin.members.list.previous') }}
            </button>
            <button
              type="button"
              :disabled="!hasNextPage"
              class="px-3 py-1.5 text-sm font-body border-2 border-navy/20 dark:border-poster-darkBorder rounded disabled:opacity-40 disabled:cursor-not-allowed"
              @click="goToPage(page + 1)"
            >
              {{ $t('pages.admin.members.list.next') }}
            </button>
          </div>
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

  type MemberStatus = 'active' | 'blocked' | 'deleted'
  type StatusFilter = MemberStatus | 'all'

  interface MemberRow {
    uid: string
    /** Already abbreviated by the server — `Anna M.` */
    name: string
    /** Already masked by the server — `an•••@ex•••.de` */
    email: string
    role: string
    status: MemberStatus
    newsletter: string
    createdAt: string | null
    lastSeenAt: string | null
    activeSessions: number
  }

  const members = ref<MemberRow[]>([])
  const total = ref(0)
  const page = ref(1)
  const perPage = ref(25)
  const term = ref('')
  const status = ref<StatusFilter>('all')
  const isLoading = ref(true)
  const loadError = ref(false)

  const statusOptions = computed(() => [
    { value: 'all' as const, label: t('pages.admin.members.status.all') },
    { value: 'active' as const, label: t('pages.admin.members.status.active') },
    { value: 'blocked' as const, label: t('pages.admin.members.status.blocked') },
    { value: 'deleted' as const, label: t('pages.admin.members.status.deleted') },
  ])

  const hasNextPage = computed(() => page.value * perPage.value < total.value)

  async function load(): Promise<void> {
    isLoading.value = true
    loadError.value = false
    try {
      const result = await api<{
        members: MemberRow[]
        total: number
        page: number
        perPage: number
      }>('/api/admin/members/list', {
        query: { q: term.value || undefined, status: status.value, page: page.value },
      })
      members.value = result.members
      total.value = result.total
      perPage.value = result.perPage
      // eslint-disable-next-line no-catch-all/no-catch-all -- einzelner api()-Aufruf: Fehler wird geloggt und als Statusmeldung angezeigt
    } catch (error) {
      console.error(error)
      loadError.value = true
    } finally {
      isLoading.value = false
    }
  }

  /** A new search always starts on the first page — page 3 of the old result
      says nothing about the new one. */
  async function search(): Promise<void> {
    page.value = 1
    await load()
  }

  async function goToPage(next: number): Promise<void> {
    page.value = next
    await load()
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

  function formatDate(value: string | null): string {
    if (!value) return t('pages.admin.members.table.never')
    return new Date(value).toLocaleDateString(locale.value, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  }

  onMounted(load)
</script>
