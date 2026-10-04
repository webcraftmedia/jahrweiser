import type { ActivityBucket } from '~~/shared/activity'

/**
 * The words for each "last active" span, shared by the dashboard bars and the
 * members' list so both say the same thing. Spelled out key by key because the
 * i18n lint forbids built keys — a typo there would only show at runtime.
 */
export function useActivityLabel(): (bucket: ActivityBucket) => string {
  const { t } = useI18n()
  return (bucket) =>
    ({
      day: t('pages.admin.activity.day'),
      week: t('pages.admin.activity.week'),
      month: t('pages.admin.activity.month'),
      quarter: t('pages.admin.activity.quarter'),
      older: t('pages.admin.activity.older'),
      never: t('pages.admin.activity.never'),
    })[bucket]
}
