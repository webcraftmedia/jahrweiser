<script setup lang="ts">
  definePageMeta({
    middleware: ['authenticated'],
  })

  // Shared with the icon rail, which already loaded the list to decide whether
  // to show its entry at all — reusing it avoids a second request.
  const { channels, isLoading, loadError, load } = useTelegramChannels()

  // Force a refresh: the file is edited on the server without a restart, so a
  // visit to this page should show what is there now, not what the rail read
  // when the app was opened.
  onMounted(() => load(true))
</script>

<template>
  <div class="w-full max-w-3xl mx-auto px-4 py-4 sm:px-6 sm:py-6 lg:px-8 space-y-6">
    <!-- `max-w-3xl`: a line of description stretched across a desktop window is
         hard to read, and that width is what pushed the join button out of
         sight of the channel it belongs to. -->
    <h1 class="text-2xl font-display text-navy dark:text-ivory">
      {{ $t('pages.telegram.title') }}
    </h1>

    <div
      class="animate-fade-slide-up bg-white/80 dark:bg-poster-darkCard rounded shadow-lg p-4 sm:p-6 border-2 border-navy/15 dark:border-poster-darkBorder"
    >
      <p class="mb-4 text-sm font-body text-navy/70 dark:text-ivory/70">
        {{ $t('pages.telegram.intro') }}
      </p>

      <div v-if="isLoading" class="flex items-center justify-center gap-2 py-8">
        <LoadingDots />
      </div>
      <p
        v-else-if="loadError"
        role="alert"
        class="text-sm font-body text-sienna dark:text-sienna-light"
      >
        {{ $t('pages.telegram.error') }}
      </p>
      <p
        v-else-if="channels.length === 0"
        class="text-sm font-body text-navy/60 dark:text-poster-darkMuted"
      >
        {{ $t('pages.telegram.empty') }}
      </p>

      <!-- Channel names and descriptions are free text and carry the whole
           decision to join, so nothing here is cut short: the title wraps and
           the button moves below it on a phone. -->
      <ul v-else class="space-y-3">
        <ListEntryCard
          v-for="channel in channels"
          :key="channel.id"
          :title="channel.name"
          :description="channel.description"
          :href="channel.url"
          :action="$t('pages.telegram.join')"
          :aria-label="$t('pages.telegram.join-channel', { name: channel.name })"
        >
          <template #badge>
            <span
              class="inline-block shrink-0 whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium"
              :class="
                channel.public
                  ? 'bg-olive/15 text-olive-dark dark:text-olive-light'
                  : 'bg-navy/10 dark:bg-poster-darkBorder text-navy/70 dark:text-ivory/70'
              "
            >
              {{
                channel.public
                  ? $t('pages.telegram.badge.public')
                  : $t('pages.telegram.badge.invite')
              }}
            </span>
          </template>
        </ListEntryCard>
      </ul>
    </div>
  </div>
</template>
