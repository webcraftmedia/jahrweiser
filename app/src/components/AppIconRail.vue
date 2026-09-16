<script setup lang="ts">
  /**
   * Top-level navigation, icons only. Rendered twice by the default layout: as
   * a narrow rail beside the content on desktop, as a bottom bar on mobile
   * (thumb reach, and the calendar keeps the full width on small screens).
   *
   * The entries themselves come from useAppSections(), which the burger menu
   * reads too — on a phone the same sections are offered as text there.
   */
  const props = defineProps<{ orientation: 'vertical' | 'horizontal' }>()

  const route = useRoute()
  const { sections: items, load } = useAppSections()

  // The rail owns the loading: it is mounted for signed-in members only and on
  // every page, so the lists are there before anyone clicks. The header renders
  // on the login page too and must not fetch — see useAppSections().
  onMounted(load)

  const isVertical = computed(() => props.orientation === 'vertical')
</script>

<template>
  <nav
    :aria-label="$t('components.AppIconRail.label')"
    :class="
      isVertical
        ? 'flex flex-col gap-1 shrink-0 w-14 py-3 border-r border-navy/10 dark:border-poster-darkBorder bg-ivory dark:bg-poster-darkCard'
        : 'flex flex-row justify-around items-stretch shrink-0 w-full border-t border-navy/10 dark:border-poster-darkBorder bg-ivory dark:bg-poster-darkCard'
    "
  >
    <NuxtLink
      v-for="item in items"
      :key="item.to"
      :to="item.to"
      :title="item.accessibleLabel"
      :aria-label="item.accessibleLabel"
      :aria-current="item.isActive(route.path) ? 'page' : undefined"
      :class="[
        item.isActive(route.path)
          ? 'text-sienna dark:text-sienna-light bg-sienna/10 dark:bg-sienna/20'
          : 'text-navy/60 dark:text-ivory/60 hover:text-sienna dark:hover:text-sienna-light hover:bg-sienna/5 dark:hover:bg-sienna/10',
        'rail-item flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sienna/40',
        isVertical ? 'mx-2 h-10 rounded-lg' : 'flex-1 py-2.5',
      ]"
    >
      <span class="relative flex">
        <component :is="item.icon" class="rail-icon" aria-hidden="true" />
        <!-- The state is in the link's aria-label too; the dot is never the
             only thing carrying it. -->
        <span v-if="item.warn" class="rail-warn" aria-hidden="true" />
      </span>
    </NuxtLink>
  </nav>
</template>

<style scoped>
  .rail-icon {
    width: 1.375rem;
    height: 1.375rem;
    /* nuxt-svgo wraps every imported asset in NuxtIcon, whose global
       `.nuxt-icon--fill * { fill: currentColor }` overrides the `fill="none"`
       in the asset. Stroke and fill therefore end up the same colour: at 60%
       the icon still showed an edge (the two overlap there), but on the active
       item, at full opacity, it collapsed into a solid shape with no contour.
       Holding the fill back keeps the icon solid — it just stops competing
       with its own outline. `fill-opacity` is inherited, so the shapes inside
       pick it up without a `:deep()` selector. */
    fill-opacity: 0.45;
  }

  /* A warning dot, not a count badge: it says "something is missing here", and
     the ring keeps it legible where it overlaps the icon's own strokes. */
  .rail-warn {
    position: absolute;
    top: -0.125rem;
    right: -0.25rem;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 999px;
    background: #d97706;
    box-shadow: 0 0 0 2px #faf5eb;
  }
  :global(.dark) .rail-warn {
    background: #f59e0b;
    box-shadow: 0 0 0 2px #2a2520;
  }

  /* Matches the hover nudge of the section sidebar (components/SidebarLayout.vue). */
  .rail-item {
    transition:
      transform 0.2s ease,
      color 0.15s ease,
      background-color 0.15s ease;
  }
  .rail-item:hover {
    transform: translateY(-1px);
  }

  @media (prefers-reduced-motion: reduce) {
    .rail-item,
    .rail-item:hover {
      transition: none;
      transform: none;
    }
  }
</style>
