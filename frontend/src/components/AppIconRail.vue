<script setup lang="ts">
  import IconBlaettchen from '~/assets/icon-blaettchen.svg'
  import IconCalendar from '~/assets/icon-calendar.svg'
  import IconTelegram from '~/assets/icon-telegram.svg'

  /**
   * Top-level navigation, icons only. Rendered twice by the default layout: as
   * a narrow rail beside the content on desktop, as a bottom bar on mobile
   * (thumb reach, and the calendar keeps the full width on small screens).
   */
  const props = defineProps<{ orientation: 'vertical' | 'horizontal' }>()

  const { t } = useI18n()
  const route = useRoute()
  const { hasChannels, load: loadChannels } = useTelegramChannels()
  const { hasIssues, load: loadIssues } = useBlaettchen()

  // Both entries only exist when there is something behind them. Loaded here
  // rather than on the pages so the rail can decide before anyone clicks.
  onMounted(() => {
    void loadChannels()
    void loadIssues()
  })

  interface RailItem {
    to: string
    label: string
    icon: unknown
    /** True while this item's section is open. */
    isActive: (path: string) => boolean
  }

  /**
   * The calendar owns `/` plus the dated permalinks it pushes into the URL
   * (/2026/09, /2026/09/event/<id>) — see the route pattern in pages/index.vue.
   * The pattern stays deliberately flat — a single bounded `\d{4}` followed by
   * a separator — so there is nothing for a backtracking engine to chew on.
   */
  function isCalendarPath(path: string): boolean {
    return path === '/' || /^\/\d{4}(\/|$)/.test(path)
  }

  const items = computed<RailItem[]>(() => [
    {
      to: '/',
      label: t('components.AppIconRail.calendar'),
      icon: IconCalendar,
      isActive: isCalendarPath,
    },
    // Hidden while no issue has been published — and equally when they could
    // not be read at all, same reasoning as Telegram below.
    ...(hasIssues.value
      ? [
          {
            to: '/blaettchen',
            label: t('components.AppIconRail.blaettchen'),
            icon: IconBlaettchen,
            isActive: (path: string) => path === '/blaettchen',
          },
        ]
      : []),
    // Hidden when no invitations are configured — and equally when they could
    // not be read at all, so a broken config never offers members a link into
    // an error page. The endpoint still logs and answers 500 for the operator.
    ...(hasChannels.value
      ? [
          {
            to: '/telegram',
            label: t('components.AppIconRail.telegram'),
            icon: IconTelegram,
            isActive: (path: string) => path === '/telegram',
          },
        ]
      : []),
  ])

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
      :title="item.label"
      :aria-label="item.label"
      :aria-current="item.isActive(route.path) ? 'page' : undefined"
      :class="[
        item.isActive(route.path)
          ? 'text-sienna dark:text-sienna-light bg-sienna/10 dark:bg-sienna/20'
          : 'text-navy/60 dark:text-ivory/60 hover:text-sienna dark:hover:text-sienna-light hover:bg-sienna/5 dark:hover:bg-sienna/10',
        'rail-item flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sienna/40',
        isVertical ? 'mx-2 h-10 rounded-lg' : 'flex-1 py-2.5',
      ]"
    >
      <component :is="item.icon" class="rail-icon" aria-hidden="true" />
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
