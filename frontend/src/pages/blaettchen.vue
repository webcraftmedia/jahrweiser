<script setup lang="ts">
  definePageMeta({
    middleware: ['authenticated'],
  })

  // Shared with the icon rail, which already loaded the list to decide whether
  // to show its entry at all — reusing it avoids a second request.
  const { issues, contact, isLoading, loadError, load, urlFor, formatDate, formatDateShort } =
    useBlaettchen()

  // Force a refresh: issues are dropped into the directory on the server
  // without a restart, so a visit to this page should show what is there now,
  // not what the rail read when the app was opened.
  onMounted(() => load(true))

  /** `mailto:` with a prefilled subject, so contributions arrive recognisable. */
  function contributionMailto(address: string): string {
    return `mailto:${address}?subject=${encodeURIComponent('Beitrag fürs Blättchen')}`
  }
</script>

<template>
  <div class="w-full max-w-3xl mx-auto px-4 py-4 sm:px-6 sm:py-6 lg:px-8 space-y-6">
    <!-- Held to reading width, like /telegram: the archive is a column of short
         rows, and stretching it across a desktop window only moves the button
         away from the issue it opens. -->
    <h1 class="text-2xl font-display text-navy dark:text-ivory">
      {{ $t('pages.blaettchen.title') }}
    </h1>

    <!-- The call for contributions comes first: it is the one thing this page
         asks of the reader, and the archive below is long. Hidden when no
         address is configured rather than offering a dead link. -->
    <div
      v-if="contact"
      class="animate-fade-slide-up bg-sienna/5 dark:bg-sienna/10 rounded shadow-lg p-4 sm:p-6 border-2 border-sienna/30 dark:border-sienna/40"
    >
      <h2 class="mb-2 font-display text-lg text-navy dark:text-ivory">
        {{ $t('pages.blaettchen.contribute.title') }}
      </h2>
      <p class="mb-4 text-sm font-body text-navy/70 dark:text-ivory/70">
        {{ $t('pages.blaettchen.contribute.text') }}
      </p>
      <a
        :href="contributionMailto(contact)"
        class="inline-block text-ivory bg-sienna hover:brightness-110 dark:bg-sienna-dark dark:hover:brightness-110 focus:ring-4 focus:outline-none focus:ring-sienna/30 font-semibold font-body rounded text-sm px-4 py-2 transition-all"
      >
        {{ $t('pages.blaettchen.contribute.action') }}
      </a>
    </div>

    <div
      class="animate-fade-slide-up bg-white/80 dark:bg-poster-darkCard rounded shadow-lg p-4 sm:p-6 border-2 border-navy/15 dark:border-poster-darkBorder"
    >
      <p class="mb-4 text-sm font-body text-navy/70 dark:text-ivory/70">
        {{ $t('pages.blaettchen.intro') }}
      </p>

      <div v-if="isLoading" class="flex items-center justify-center gap-2 py-8">
        <LoadingDots />
      </div>
      <p
        v-else-if="loadError"
        role="alert"
        class="text-sm font-body text-sienna dark:text-sienna-light"
      >
        {{ $t('pages.blaettchen.error') }}
      </p>
      <p
        v-else-if="issues.length === 0"
        class="text-sm font-body text-navy/60 dark:text-poster-darkMuted"
      >
        {{ $t('pages.blaettchen.empty') }}
      </p>

      <!-- `compact`: an issue is identified by its number and date, both short
           and both formulaic, so the entry stays one line on every screen
           instead of letting a long month name push the button onto its own. -->
      <ul v-else class="space-y-3">
        <ListEntryCard
          v-for="issue in issues"
          :key="issue.file"
          compact
          :title="$t('pages.blaettchen.issue', { number: issue.number })"
          :description="issue.title"
          :href="urlFor(issue)"
          :action="$t('pages.blaettchen.open')"
          :aria-label="
            $t('pages.blaettchen.open-issue', {
              number: issue.number,
              date: formatDate(issue.date),
            })
          "
        >
          <template #badge>
            <!-- Never wraps and never shrinks: a date broken across two lines
                 costs more height than the few pixels it saves. -->
            <span
              class="inline-block shrink-0 whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium bg-navy/10 dark:bg-poster-darkBorder text-navy/70 dark:text-ivory/70"
            >
              <time :datetime="issue.date">{{ formatDateShort(issue.date) }}</time>
            </span>
          </template>
        </ListEntryCard>
      </ul>
    </div>
  </div>
</template>
