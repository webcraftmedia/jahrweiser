<template>
  <div class="login-shell flex flex-col bg-ivory dark:bg-poster-dark relative">
    <Header variant="hero" />

    <!-- Content -->
    <div
      class="flex-1 flex items-start justify-center px-4"
      :style="loginZoom !== 1 ? { zoom: loginZoom } : undefined"
    >
      <slot />
    </div>

    <Footer />
  </div>
</template>

<script setup lang="ts">
  const { loginZoom } = useZoom()
</script>

<style scoped>
  /* `dvh` rather than Tailwind's `min-h-screen` — see layouts/default.vue: on a
     phone `100vh` is the viewport *without* the address bar, so a screen that
     fits is still made tall enough to scroll. */
  .login-shell {
    min-height: 100vh; /* fallback: pre-2022 browsers without dvh */
    min-height: 100dvh;
  }
</style>
