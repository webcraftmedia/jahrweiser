<template>
  <Modal ref="modal" modal-id="changelog-modal" @x="modal?.close()">
    <template #title>
      {{ $t('components.Footer.changelog') }}
    </template>
    <template #content>
      <p class="font-semibold text-navy/70 dark:text-ivory/70 mb-4">
        {{ $t('components.Footer.changelog-intro-before') }}
        <a
          :href="REPO_URL"
          target="_blank"
          rel="noopener noreferrer"
          class="inline text-sienna dark:text-sienna-light hover:underline transition-colors"
          @click.stop
        >
          <svg
            class="inline w-4 h-4 align-middle"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
            />
          </svg>
          <!-- eslint-disable @intlify/vue-i18n/no-raw-text -->
          {{ $t('components.Footer.changelog-intro-after') }} </a
        >.
        <!-- eslint-enable @intlify/vue-i18n/no-raw-text -->
      </p>

      <p v-if="loaded && releases.length === 0" class="text-sm text-navy/60 dark:text-ivory/60">
        {{ $t('components.ChangelogModal.empty') }}
      </p>

      <div class="space-y-3">
        <details
          v-for="(release, index) in releases"
          :key="release.version"
          :open="index === 0"
          class="changelog-release group border border-navy/15 dark:border-poster-darkBorder rounded"
        >
          <summary
            class="flex items-center justify-between gap-3 cursor-pointer px-4 py-2.5 bg-navy/5 dark:bg-poster-dark hover:bg-navy/10 dark:hover:bg-poster-darkCard transition-colors select-none list-none [&::-webkit-details-marker]:hidden"
            @click.stop
          >
            <span class="font-semibold text-navy dark:text-ivory font-display">
              {{ $t('components.ChangelogModal.version', { version: release.version }) }}
            </span>
            <span class="text-sm text-navy/50 dark:text-ivory/50">
              {{ formatDates(release) }}
            </span>
          </summary>

          <div
            class="changelog-content px-4 py-3 text-sm text-navy/80 dark:text-ivory/80 space-y-3"
            @click.stop
          >
            <section v-if="release.features.length > 0" class="changelog-features">
              <h4 class="font-semibold mb-1">{{ $t('components.ChangelogModal.features') }}</h4>
              <ul class="list-disc pl-5 space-y-0.5">
                <ChangelogModalEntry
                  v-for="entry in release.features"
                  :key="entry.text"
                  :entry="entry"
                />
              </ul>
            </section>

            <details v-if="release.fixes.length > 0" class="changelog-fixes">
              <summary
                class="cursor-pointer text-navy/60 dark:text-ivory/60 hover:text-sienna dark:hover:text-sienna-light transition-colors"
              >
                {{ $t('components.ChangelogModal.fixes', release.fixes.length) }}
              </summary>
              <ul class="list-disc pl-5 mt-1 space-y-0.5">
                <ChangelogModalEntry
                  v-for="entry in release.fixes"
                  :key="entry.text"
                  :entry="entry"
                />
              </ul>
            </details>

            <p
              v-if="release.features.length === 0 && release.fixes.length === 0"
              class="text-navy/60 dark:text-ivory/60"
            >
              {{ $t('components.ChangelogModal.internal-only') }}
            </p>

            <p class="changelog-versions text-xs text-navy/50 dark:text-ivory/50">
              {{
                $t('components.ChangelogModal.contains', { versions: release.versions.join(' · ') })
              }}
            </p>
          </div>
        </details>
      </div>

      <p v-if="older > 0" class="mt-4 text-sm">
        <a
          :href="`${REPO_URL}/blob/master/CHANGELOG.md`"
          target="_blank"
          rel="noopener noreferrer"
          class="changelog-older text-sienna dark:text-sienna-light hover:underline"
          @click.stop
        >
          {{ $t('components.ChangelogModal.older', older) }}
        </a>
      </p>
    </template>
  </Modal>
</template>

<script setup lang="ts">
  import type { Changelog, ChangelogRelease } from '~~/shared/changelog'

  const REPO_URL = 'https://github.com/webcraftmedia/jahrweiser'

  // The client with the 401 handling — see useApi().
  const api = useApi()
  const { locale } = useI18n()
  const modal = ref<InstanceType<typeof Modal>>()
  const loaded = ref(false)
  const releases = ref<ChangelogRelease[]>([])
  const older = ref(0)

  function parseDate(iso: string): Date | null {
    const date = new Date(`${iso}T00:00:00Z`)
    return Number.isNaN(date.getTime()) ? null : date
  }

  function formatDates({ dateFrom, dateTo }: ChangelogRelease): string {
    const from = parseDate(dateFrom)
    const to = parseDate(dateTo)
    if (!from || !to) return dateTo || dateFrom
    const format = new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeZone: 'UTC' })
    return format.formatRange(from, to)
  }

  async function open() {
    if (!loaded.value) {
      const changelog = await api<Changelog>('/api/changelog')
      releases.value = changelog.releases
      older.value = changelog.older
      loaded.value = true
    }
    modal.value?.open()
  }

  defineExpose({ open })
</script>
