<script setup lang="ts">
  /**
   * One entry of a link list — a Telegram channel, a Blättchen issue — drawn as
   * its own card: a title, a badge beside it, an optional description, and the
   * single link the entry exists for.
   *
   * A card rather than a row under a hairline, because the two halves of a row
   * drift apart as the window grows: on a wide screen the button ended up a
   * thousand pixels from the title it belonged to, with nothing in between to
   * say they were one thing. The border is that statement. The list around it
   * is held to reading width (`max-w-3xl` on the page) so the halves stay near
   * each other to begin with — the border is the second line of defence, not
   * the first.
   */
  withDefaults(
    defineProps<{
      title: string
      description?: string
      /** Where the action leads — always an external target. */
      href: string
      /** The action's visible label. */
      action: string
      /**
       * Spoken label. Worth passing whenever the visible one repeats down the
       * list: ten links reading "Öffnen" are useless in a screen reader's link
       * list, which is the one place they are read without their surroundings.
       */
      ariaLabel?: string
      /**
       * Keep title, badge and action on one line, cutting overlong text rather
       * than wrapping it.
       *
       * For entries whose title is formulaic — "12. Ausgabe" — where the row is
       * a thing to scan and its width should not depend on the contents. A
       * free-form title is the opposite case: it is what the reader came for
       * and must never be cut, so it wraps and the action moves below it.
       */
      compact?: boolean
    }>(),
    { description: undefined, ariaLabel: undefined, compact: false },
  )
</script>

<template>
  <li
    class="rounded border-2 border-navy/10 dark:border-poster-darkBorder/60 bg-ivory/40 dark:bg-poster-dark/20 p-3 sm:p-4 transition-colors hover:border-sienna/40 dark:hover:border-sienna/50"
  >
    <div
      class="flex"
      :class="
        compact
          ? 'items-center justify-between gap-2 sm:gap-3'
          : 'flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'
      "
    >
      <div class="min-w-0 flex-1">
        <div class="flex min-w-0 items-center gap-2" :class="compact ? '' : 'flex-wrap'">
          <span
            class="font-medium font-body text-navy dark:text-ivory"
            :class="compact ? 'min-w-0 truncate' : 'break-words'"
          >
            {{ title }}
          </span>
          <!-- Date, visibility, whatever the list distinguishes its entries by.
               A slot, because that is the one part the two lists do not share. -->
          <slot name="badge" />
        </div>
        <p
          v-if="description"
          class="text-sm font-body text-navy/60 dark:text-poster-darkMuted"
          :class="compact ? 'truncate' : ''"
        >
          {{ description }}
        </p>
      </div>
      <!-- Opens in a new tab; noopener/noreferrer so the target cannot reach
           back into this one. -->
      <a
        :href="href"
        target="_blank"
        rel="noopener noreferrer"
        :aria-label="ariaLabel"
        class="shrink-0 self-end sm:self-auto text-ivory bg-sienna hover:brightness-110 dark:bg-sienna-dark dark:hover:brightness-110 focus:ring-4 focus:outline-none focus:ring-sienna/30 font-semibold font-body rounded text-sm px-3 sm:px-4 py-2 transition-all"
      >
        {{ action }}
      </a>
    </div>
  </li>
</template>
