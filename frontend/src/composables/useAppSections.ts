import IconBlaettchen from '~/assets/icon-blaettchen.svg'
import IconCalendar from '~/assets/icon-calendar.svg'
import IconMap from '~/assets/icon-map.svg'
import IconTelegram from '~/assets/icon-telegram.svg'

/** One top-level section of the app, as both navigations render it. */
export interface AppSection {
  to: string
  /** The section's name, as the burger menu prints it. Always just the name. */
  label: string
  /**
   * What a screen reader is given. The same as `label`, unless the section
   * needs something from the member — the icon rail has nothing but this to
   * carry that, and in the menu the dot must not be the only thing saying it.
   */
  accessibleLabel: string
  icon: unknown
  /** True while this section is open. */
  isActive: (path: string) => boolean
  /** Marks the entry as needing something from the member before it works. */
  warn?: boolean
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

/**
 * The app's top-level sections, in the one place that decides which of them
 * exist for this member.
 *
 * Rendered by two components — the icon rail (beside the content on desktop, as
 * a bottom bar on mobile) and the burger menu, which offers the same entries as
 * text on a phone. They have to agree: a section the rail hides because there is
 * nothing behind it must not be listed in the menu, and the map's marker means
 * the same in both.
 *
 * Fetching is *not* part of reading the list. `load()` belongs to whoever is
 * mounted for a signed-in member and can afford the three requests — the rail —
 * while the header renders on the login page too, where a request would be a
 * 401 and src/plugins/auth-redirect.ts turns that into a forced logout.
 */
export function useAppSections() {
  const { t } = useI18n()
  const { hasChannels, load: loadChannels } = useTelegramChannels()
  const { hasIssues, load: loadIssues } = useBlaettchen()
  const { hasPostalCode, loadStatus } = useMemberMap()

  const sections = computed<AppSection[]>(() => [
    {
      to: '/',
      label: t('components.AppIconRail.calendar'),
      accessibleLabel: t('components.AppIconRail.calendar'),
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
            accessibleLabel: t('components.AppIconRail.blaettchen'),
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
            accessibleLabel: t('components.AppIconRail.telegram'),
            icon: IconTelegram,
            isActive: (path: string) => path === '/telegram',
          },
        ]
      : []),
    // Always offered, unlike the two above: the map exists for every member,
    // it just cannot show anything until they have given a postal code the map
    // can place. The marker says so before the click rather than after it.
    {
      to: '/karte',
      label: t('components.AppIconRail.map'),
      accessibleLabel:
        hasPostalCode.value === false
          ? t('components.AppIconRail.map-incomplete')
          : t('components.AppIconRail.map'),
      icon: IconMap,
      isActive: (path: string) => path === '/karte',
      warn: hasPostalCode.value === false,
    },
  ])

  /**
   * Ask what exists. Called once, by the rail: the map status is the same idea
   * for a different decision — whether to mark the map as incomplete — and is a
   * single-row lookup, not the map data.
   */
  function load(): void {
    void loadChannels()
    void loadIssues()
    void loadStatus()
  }

  return { sections, load }
}
