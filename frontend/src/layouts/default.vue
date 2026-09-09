<template>
  <div class="flex flex-col h-screen bg-ivory dark:bg-poster-dark relative">
    <Header />
    <div class="content flex-1 overflow-y-auto flex flex-col">
      <!-- The rail sits outside the max-width container on purpose: it is app
           chrome and hugs the viewport edge, while the content stays centred.
           Keeping it out of that container also leaves the existing
           `flex-wrap` row untouched — a sibling in there would wrap, since
           pages/index.vue's `.box` is width:100%. -->
      <!-- `min-h-0` on both wrappers: without it a flex item may not shrink
           below its content, so a page that wants to *fit* the space it is
           given (the map) is pushed past it into a scroll instead. Pages that
           want to grow are unaffected — they overflow into `.content`, which
           scrolls, exactly as before. -->
      <div class="flex w-full min-h-0 flex-1">
        <AppIconRail v-if="loggedIn" orientation="vertical" class="hidden md:flex" />
        <div
          class="max-w-screen-2xl flex flex-wrap justify-between mx-auto w-full min-h-0 flex-1"
          :style="zoomLevel !== 1 ? { zoom: zoomLevel } : undefined"
        >
          <slot />
        </div>
      </div>
    </div>
    <!-- In normal flow rather than fixed: no overlay means no content hidden
         behind it and no bottom-padding hack on every page. -->
    <AppIconRail v-if="loggedIn" orientation="horizontal" class="md:hidden" />
    <Footer />
  </div>
</template>

<script setup lang="ts">
  const { zoomLevel } = useZoom()
  // `v-if`, not `v-show`: the rail fetches the channel list on mount, and
  // src/plugins/auth-redirect.ts turns any 401 into a forced logout. Mounting
  // it for a signed-out visitor would log them out on the spot.
  const { loggedIn } = useUserSession()
</script>

<style scoped>
  @reference "tailwindcss";
  .content {
    @apply mb-0;
  }
</style>
