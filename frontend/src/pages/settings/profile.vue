<script setup lang="ts">
  import type { PostalCodeLookup } from '~~/shared/map'

  definePageMeta({
    middleware: ['authenticated'],
  })

  // The client with the 401 handling — see useApi().
  const api = useApi()
  const { t } = useI18n()
  const { fetch: refreshSession, user } = useUserSession()
  // The rail's map marker reads this. Set on a successful save so it clears (or
  // appears, when the code was deleted) on the spot rather than on the next
  // full page load — the member is looking straight at it.
  const { hasPostalCode } = useMemberMap()

  const firstName = ref('')
  const lastName = ref('')
  const postalCode = ref('')
  // Last persisted values, to disable "save" when nothing changed.
  const savedFirstName = ref('')
  const savedLastName = ref('')
  const savedPostalCode = ref('')
  const profileLoaded = ref(false)
  const savingName = ref(false)
  const nameMessage = ref<{ kind: 'ok' | 'err'; text: string } | null>(null)

  /**
   * What we know about what is in the postal-code field.
   *
   * `unchecked` is the one that is not about the input: the lookup itself
   * failed. Saving stays possible then — a flaky request must not lock the
   * form, and the endpoint that stores the value validates it anyway.
   */
  type PostalState = 'empty' | 'format' | 'checking' | 'known' | 'unknown' | 'unchecked'

  /** Five digits. Checked in the browser so the obvious case needs no request. */
  const POSTAL_PATTERN = /^\d{5}$/
  /** Long enough that typing five digits is one lookup, not five. */
  const LOOKUP_DELAY_MS = 350

  const postalState = ref<PostalState>('empty')
  /** The place the code names, once the map has confirmed one. */
  const postalOrt = ref('')

  let lookupTimer: ReturnType<typeof setTimeout> | undefined
  /**
   * Only the newest lookup may write the state. Answers can overtake each
   * other, and the one for "6462" arriving after the one for "64625" would
   * report the field as wrong while it is right.
   */
  let lookupSeq = 0

  async function lookupPostalCode(code: string, seq: number): Promise<void> {
    try {
      const answer = await api<PostalCodeLookup>('/api/map/postal-code', { query: { plz: code } })
      if (seq !== lookupSeq) return
      postalState.value = answer.known ? 'known' : 'unknown'
      postalOrt.value = answer.ort ?? ''
      // eslint-disable-next-line no-catch-all/no-catch-all -- einzelner api()-Aufruf: Speichern bleibt moeglich, der Server validiert ohnehin
    } catch (error) {
      if (seq !== lookupSeq) return
      console.error(error)
      postalState.value = 'unchecked'
    }
  }

  // Runs for the loaded profile too: a stored code is confirmed with its town
  // the moment the form appears, which is also how a member finds out that what
  // a DAV client put there is not one the map knows.
  watch(postalCode, (value) => {
    const code = value.trim()
    postalOrt.value = ''
    // Invalidates whatever is in flight, and cancels whatever is pending.
    lookupSeq += 1
    clearTimeout(lookupTimer)
    if (!code) {
      postalState.value = 'empty'
      return
    }
    if (!POSTAL_PATTERN.test(code)) {
      postalState.value = 'format'
      return
    }
    postalState.value = 'checking'
    const seq = lookupSeq
    lookupTimer = setTimeout(() => {
      void lookupPostalCode(code, seq)
    }, LOOKUP_DELAY_MS)
  })

  onBeforeUnmount(() => {
    clearTimeout(lookupTimer)
  })

  /**
   * The line under the field. Rendered as a live region, so it is not only the
   * sighted who get told that 64625 is Bensheim.
   */
  const postalMessage = computed<{ kind: 'ok' | 'err' | 'muted'; text: string } | null>(() => {
    switch (postalState.value) {
      case 'known':
        return {
          kind: 'ok',
          text: t('pages.settings.profile.postalCode-known', {
            plz: postalCode.value.trim(),
            ort: postalOrt.value,
          }),
        }
      case 'format':
        return { kind: 'err', text: t('pages.settings.profile.postalCode-format') }
      case 'unknown':
        return { kind: 'err', text: t('pages.settings.profile.postalCode-unknown') }
      case 'checking':
        return { kind: 'muted', text: t('pages.settings.profile.postalCode-checking') }
      case 'unchecked':
        return { kind: 'muted', text: t('pages.settings.profile.postalCode-unchecked') }
      default:
        return null
    }
  })

  /** Nothing to correct — the code is empty, confirmed, or uncheckable. */
  const postalAcceptable = computed(
    () =>
      postalState.value === 'empty' ||
      postalState.value === 'known' ||
      postalState.value === 'unchecked',
  )

  // Save is offered whenever something changed — including clearing a field,
  // which removes the stored value — and only while the postal code is one the
  // map can place. The endpoint refuses a bad one anyway; refusing it here says
  // so before the round trip, and next to the field it is about.
  const canSaveName = computed(
    () =>
      postalAcceptable.value &&
      (firstName.value.trim() !== savedFirstName.value ||
        lastName.value.trim() !== savedLastName.value ||
        postalCode.value.trim() !== savedPostalCode.value),
  )

  async function loadProfile() {
    try {
      const data = await api<{ firstName: string; lastName: string; postalCode: string }>(
        '/api/me/profile',
      )
      firstName.value = data.firstName
      lastName.value = data.lastName
      postalCode.value = data.postalCode
      // eslint-disable-next-line no-catch-all/no-catch-all -- geloggt; Fallback auf den Session-Namen ist gewollt
    } catch (error) {
      // Fallback if the profile endpoint is unreachable: derive first/last from
      // the session display name so the form is still pre-filled and usable.
      // Logged, because otherwise a broken endpoint looks like an empty profile.
      console.warn('Failed to load profile, falling back to session name:', error)
      const name = String(user.value?.name ?? '').trim()
      const idx = name.indexOf(' ')
      firstName.value = idx === -1 ? name : name.slice(0, idx)
      lastName.value = idx === -1 ? '' : name.slice(idx + 1).trim()
    } finally {
      savedFirstName.value = firstName.value.trim()
      savedLastName.value = lastName.value.trim()
      savedPostalCode.value = postalCode.value.trim()
      profileLoaded.value = true
    }
  }

  async function saveName() {
    if (!canSaveName.value) return
    savingName.value = true
    nameMessage.value = null
    const sent = {
      firstName: firstName.value.trim(),
      lastName: lastName.value.trim(),
      postalCode: postalCode.value.trim(),
    }
    try {
      await api('/api/me/profile', { method: 'POST', body: sent })
      // Mark the new values as persisted so "save" disables until the next edit.
      savedFirstName.value = sent.firstName
      savedLastName.value = sent.lastName
      savedPostalCode.value = sent.postalCode
      // What was stored is a code the map can place — the endpoint accepted it,
      // and it only accepts those. So the rail's marker can be settled from
      // here, without asking the status endpoint again.
      hasPostalCode.value = sent.postalCode !== ''
      nameMessage.value = { kind: 'ok', text: t('pages.settings.profile.saved') }
      // Best-effort: refresh the session so the header greeting updates. A
      // failure here must NOT turn a successful save into an error.
      void refreshSession().catch(() => {})
      // eslint-disable-next-line no-catch-all/no-catch-all -- einzelner api()-Aufruf: Server-Begruendung wird im UI angezeigt
    } catch (error) {
      // Surface the server's reason (e.g. "Contact not found") so a failure is
      // diagnosable instead of a generic message.
      const reason = (error as { data?: { statusMessage?: string } }).data?.statusMessage
      if (reason === 'invalid-postal-code') {
        // The one rejection the form can name in the member's own words, and
        // point at: the field it is about, not a line under the button.
        postalState.value = 'unknown'
        postalOrt.value = ''
        nameMessage.value = null
        return
      }
      nameMessage.value = {
        kind: 'err',
        text: reason
          ? `${t('pages.settings.profile.error')} (${reason})`
          : t('pages.settings.profile.error'),
      }
    } finally {
      savingName.value = false
    }
  }

  // Loaded after the first render, not before it: awaiting here would make Vue
  // hold the whole page back and the loading state below could never show —
  // on a slow connection the user would just sit on the previous page.
  onMounted(() => {
    void loadProfile()
  })
</script>

<template>
  <div class="space-y-6">
    <h1 class="hidden md:block text-2xl font-display text-navy dark:text-ivory">
      {{ t('pages.settings.menu.profile') }}
    </h1>

    <section
      class="bg-white/80 dark:bg-poster-darkCard rounded shadow-lg p-6 border-2 border-navy/15 dark:border-poster-darkBorder"
    >
      <p class="text-sm text-navy/80 dark:text-ivory/80 mb-4">
        {{ t('pages.settings.profile.intro') }}
      </p>

      <div v-if="!profileLoaded" class="text-navy/60 dark:text-ivory/60">
        {{ t('pages.settings.loading') }}
      </div>
      <form v-else class="space-y-4" @submit.prevent="saveName">
        <div>
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                for="settings-firstName"
                class="block mb-1.5 text-sm font-medium text-navy dark:text-ivory"
              >
                {{ t('pages.settings.profile.firstName') }}
              </label>
              <input
                id="settings-firstName"
                v-model.trim="firstName"
                type="text"
                autocomplete="given-name"
                class="bg-ivory dark:bg-poster-dark border-2 border-navy/20 dark:border-poster-darkBorder text-navy dark:text-ivory text-base rounded focus:border-sienna dark:focus:border-sienna-dark focus:outline-none block w-full p-2.5"
              />
            </div>
            <div>
              <label
                for="settings-lastName"
                class="block mb-1.5 text-sm font-medium text-navy dark:text-ivory"
              >
                {{ t('pages.settings.profile.lastName') }}
              </label>
              <input
                id="settings-lastName"
                v-model.trim="lastName"
                type="text"
                autocomplete="family-name"
                class="bg-ivory dark:bg-poster-dark border-2 border-navy/20 dark:border-poster-darkBorder text-navy dark:text-ivory text-base rounded focus:border-sienna dark:focus:border-sienna-dark focus:outline-none block w-full p-2.5"
              />
            </div>
          </div>
          <p class="mt-2 text-xs text-navy/60 dark:text-poster-darkMuted">
            {{ t('pages.settings.profile.description') }}
          </p>
        </div>

        <div>
          <label
            for="settings-postalCode"
            class="block mb-1.5 text-sm font-medium text-navy dark:text-ivory"
          >
            {{ t('pages.settings.profile.postalCode') }}
          </label>
          <input
            id="settings-postalCode"
            v-model.trim="postalCode"
            type="text"
            inputmode="numeric"
            autocomplete="postal-code"
            maxlength="5"
            aria-describedby="settings-postalCode-state settings-postalCode-hint"
            :aria-invalid="postalMessage?.kind === 'err' ? 'true' : undefined"
            class="bg-ivory dark:bg-poster-dark border-2 text-navy dark:text-ivory text-base rounded focus:outline-none block w-full sm:max-w-[12rem] p-2.5"
            :class="
              postalMessage?.kind === 'err'
                ? 'border-red-600 dark:border-red-500 focus:border-red-600 dark:focus:border-red-500'
                : 'border-navy/20 dark:border-poster-darkBorder focus:border-sienna dark:focus:border-sienna-dark'
            "
            :placeholder="t('pages.settings.profile.postalCode-placeholder')"
          />
          <!-- Always in the DOM, so a screen reader is told what changed rather
               than finding a new paragraph it never hears about. -->
          <p
            id="settings-postalCode-state"
            role="status"
            class="mt-2 text-xs empty:mt-0"
            :class="{
              'text-emerald-700 dark:text-emerald-400': postalMessage?.kind === 'ok',
              'text-red-700 dark:text-red-400': postalMessage?.kind === 'err',
              'text-navy/60 dark:text-poster-darkMuted': postalMessage?.kind === 'muted',
            }"
          >
            {{ postalMessage?.text }}
          </p>
          <p
            id="settings-postalCode-hint"
            class="mt-2 text-xs text-navy/60 dark:text-poster-darkMuted"
          >
            {{ t('pages.settings.profile.postalCode-hint') }}
          </p>
        </div>

        <div class="flex flex-col items-end gap-2">
          <button
            type="submit"
            class="bg-sienna hover:brightness-110 text-ivory font-semibold rounded px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="savingName || !canSaveName"
          >
            {{ savingName ? t('pages.settings.profile.saving') : t('pages.settings.profile.save') }}
          </button>
          <p
            v-if="nameMessage"
            :class="
              nameMessage.kind === 'ok'
                ? 'text-sm text-emerald-700 dark:text-emerald-400'
                : 'text-sm text-red-700 dark:text-red-400'
            "
          >
            {{ nameMessage.text }}
          </p>
        </div>
      </form>
    </section>
  </div>
</template>
