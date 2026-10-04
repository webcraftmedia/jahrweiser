<script setup lang="ts">
  /**
   * A one-line suggestion to put the app on the home screen, on phones and
   * tablets only. How depends on the browser (see useInstallHint): Chromium
   * gets a button that opens its install dialog, iOS an instruction for the
   * share sheet, browsers that cannot install a pointer to one that can.
   * Dismissed once, it stays away on this device.
   */
  import LogoSmall from '~/../assets/logo-small.svg'

  const { method, install, dismiss } = useInstallHint()
</script>

<template>
  <aside
    v-if="method"
    :aria-label="$t('components.InstallHint.label')"
    class="flex items-center gap-3 shrink-0 w-full px-3 py-2 border-t border-sienna/30 dark:border-sienna-dark/50 bg-ivory-dark dark:bg-poster-darkCard text-navy dark:text-ivory font-body text-xs"
  >
    <LogoSmall class="install-logo shrink-0" aria-hidden="true" />
    <p class="flex-1 min-w-0">
      <template v-if="method === 'prompt'">{{ $t('components.InstallHint.prompt') }}</template>
      <template v-else-if="method === 'share'">{{ $t('components.InstallHint.share') }}</template>
      <template v-else-if="method === 'safari'">{{ $t('components.InstallHint.safari') }}</template>
      <template v-else>{{ $t('components.InstallHint.menu') }}</template>
    </p>
    <button
      v-if="method === 'prompt'"
      type="button"
      class="shrink-0 text-ivory bg-sienna hover:brightness-110 dark:bg-sienna-dark focus:ring-4 focus:outline-none focus:ring-sienna/30 font-semibold rounded px-3 py-1.5 transition-all"
      @click="install"
    >
      {{ $t('components.InstallHint.install') }}
    </button>
    <button
      type="button"
      class="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg text-navy/60 dark:text-ivory/60 hover:bg-navy/10 dark:hover:bg-ivory/10 focus:outline-none focus:ring-2 focus:ring-navy/20 dark:focus:ring-ivory/20"
      :aria-label="$t('components.InstallHint.dismiss')"
      :title="$t('components.InstallHint.dismiss')"
      @click="dismiss"
    >
      <svg class="w-3 h-3" aria-hidden="true" fill="none" viewBox="0 0 14 14">
        <path
          stroke="currentColor"
          stroke-linecap="round"
          stroke-width="2"
          d="m1 1 12 12M13 1 1 13"
        />
      </svg>
    </button>
  </aside>
</template>

<style scoped>
  .install-logo {
    width: 32px;
    height: 32px;
  }
</style>
