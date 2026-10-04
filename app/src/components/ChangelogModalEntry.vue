<template>
  <li>
    {{ entry.text }}
    <a
      v-if="entry.link"
      :href="entry.link.url"
      target="_blank"
      rel="noopener noreferrer"
      class="text-xs text-navy/40 dark:text-ivory/40 hover:text-sienna dark:hover:text-sienna-light hover:underline"
      @click.stop
    >
      {{ entry.link.label }}
    </a>
  </li>
</template>

<script setup lang="ts">
  import type { ChangelogEntry } from '~~/shared/changelog'

  defineProps<{ entry: ChangelogEntry }>()
</script>
