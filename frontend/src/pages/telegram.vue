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
  <div class="w-full px-4 py-4 sm:px-6 sm:py-6 lg:px-8 space-y-6">
    <h1 class="text-2xl font-display text-navy dark:text-ivory">
      {{ $t('pages.telegram.title') }}
    </h1>

    <div
      class="animate-fade-slide-up bg-white/80 dark:bg-poster-darkCard rounded shadow-lg p-6 border-2 border-navy/15 dark:border-poster-darkBorder"
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

      <ul v-else class="space-y-3">
        <li
          v-for="channel in channels"
          :key="channel.url"
          class="flex flex-wrap items-center justify-between gap-3 border-b border-navy/5 dark:border-poster-darkBorder/50 pb-3 last:border-b-0 last:pb-0"
        >
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <span class="font-medium font-body text-navy dark:text-ivory">{{
                channel.name
              }}</span>
              <span
                class="inline-block rounded px-2 py-0.5 text-xs font-medium"
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
            </div>
            <p
              v-if="channel.description"
              class="text-sm font-body text-navy/60 dark:text-poster-darkMuted"
            >
              {{ channel.description }}
            </p>
          </div>
          <!-- Opens the Telegram app or web client; noopener/noreferrer so the
               target page cannot reach back into this one. -->
          <a
            :href="channel.url"
            target="_blank"
            rel="noopener noreferrer"
            class="shrink-0 text-ivory bg-sienna hover:brightness-110 dark:bg-sienna-dark dark:hover:brightness-110 focus:ring-4 focus:outline-none focus:ring-sienna/30 font-semibold font-body rounded text-sm px-4 py-2 transition-all"
          >
            {{ $t('pages.telegram.join') }}
          </a>
        </li>
      </ul>
    </div>
  </div>
</template>
