<script setup lang="ts">
  import { MAP_ATTRIBUTION } from '~~/shared/map'

  definePageMeta({
    middleware: ['authenticated'],
  })

  const { areas, data, places, outline, isLocked, isLoading, loaded, loadError, load, loadPlaces } =
    useMemberMap()
  const { t } = useI18n()

  // Always refetched: someone joins, someone moves, someone finally fills in
  // their postal code — the map should show that, not what the rail happened to
  // learn when the app was opened.
  onMounted(() => {
    void load()
  })

  /** Invented numbers for the locked preview — see utils/mapPreview.ts. */
  const preview = computed(() => previewAreas(outline.value))
</script>

<template>
  <div class="flex h-full min-h-0 w-full flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
    <!-- The column fills the height the layout gives it, so the map can be
         fitted into what is left rather than pushing the page into a scroll. -->
    <h1 class="text-2xl font-display text-navy dark:text-ivory">
      {{ $t('pages.karte.title') }}
    </h1>

    <!-- No card around it: the map is meant to fill the page, and a frame
         around a map reads as part of the map. -->
    <div class="animate-fade-slide-up flex min-h-0 flex-1 flex-col">
      <p class="mb-4 text-sm font-body text-navy/70 dark:text-ivory/70">
        {{ $t('pages.karte.intro') }}
      </p>

      <div v-if="!loaded || isLoading" class="flex items-center justify-center gap-2 py-8">
        <LoadingDots />
      </div>

      <p
        v-else-if="loadError || !outline"
        role="alert"
        class="text-sm font-body text-sienna dark:text-sienna-light"
      >
        {{ $t('pages.karte.error') }}
      </p>

      <!-- Locked: a preview with made-up numbers, blurred, and the way out.
           The real aggregate never reached the browser — see the endpoint. -->
      <div v-else-if="isLocked" class="relative flex min-h-0 flex-1 flex-col">
        <div
          class="pointer-events-none flex min-h-0 flex-1 select-none flex-col opacity-70 blur-[5px]"
          aria-hidden="true"
        >
          <MemberMap
            class="min-h-0 flex-1"
            :outline="outline"
            :areas="preview"
            decorative
            :title="$t('pages.karte.title')"
          />
        </div>
        <div class="absolute inset-0 flex items-center justify-center p-4">
          <div
            class="max-w-md rounded border-2 border-navy/15 dark:border-poster-darkBorder bg-ivory dark:bg-poster-dark p-5 shadow-lg text-center"
          >
            <h2 class="font-display text-lg text-navy dark:text-ivory">
              {{ $t('pages.karte.locked.title') }}
            </h2>
            <p class="mt-2 text-sm font-body text-navy/70 dark:text-ivory/70">
              {{ $t('pages.karte.locked.text') }}
            </p>
            <NuxtLink
              to="/settings/profile"
              class="mt-4 inline-block bg-sienna hover:brightness-110 text-ivory font-semibold rounded px-4 py-2"
            >
              {{ $t('pages.karte.locked.cta') }}
            </NuxtLink>
          </div>
        </div>
      </div>

      <p
        v-else-if="areas.length === 0"
        class="text-sm font-body text-navy/60 dark:text-poster-darkMuted"
      >
        {{ $t('pages.karte.empty') }}
      </p>

      <template v-else>
        <MemberMap
          class="min-h-0 flex-1"
          :outline="outline"
          :areas="areas"
          :places="places"
          :title="$t('pages.karte.map-label', { located: data!.located })"
          @viewport="loadPlaces"
        />
        <p class="mt-3 shrink-0 text-xs font-body text-navy/60 dark:text-poster-darkMuted">
          {{
            t('pages.karte.summary', {
              located: data!.located,
              total: data!.total,
              areas: data!.areas.length,
            })
          }}
          <span v-if="data!.unlocated > 0">
            {{ t('pages.karte.unlocated', data!.unlocated) }}
          </span>
        </p>
      </template>

      <p class="mt-3 shrink-0 text-xs font-body text-navy/50 dark:text-poster-darkMuted">
        {{ MAP_ATTRIBUTION }}
      </p>
    </div>
  </div>
</template>
