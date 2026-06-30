<script setup lang="ts">
  definePageMeta({
    middleware: ['authenticated'],
  })

  const { t } = useI18n()
  const { fetch: refreshSession, user } = useUserSession()

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

  // Save is offered whenever something changed — including clearing a field,
  // which removes the stored value.
  const canSaveName = computed(
    () =>
      firstName.value.trim() !== savedFirstName.value ||
      lastName.value.trim() !== savedLastName.value ||
      postalCode.value.trim() !== savedPostalCode.value,
  )

  async function loadProfile() {
    try {
      const data = await $fetch<{ firstName: string; lastName: string; postalCode: string }>(
        '/api/me/profile',
      )
      firstName.value = data.firstName
      lastName.value = data.lastName
      postalCode.value = data.postalCode
    } catch {
      // Fallback if the profile endpoint is unreachable: derive first/last from
      // the session display name so the form is still pre-filled and usable.
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
    try {
      await $fetch('/api/me/profile', {
        method: 'POST',
        body: {
          firstName: firstName.value.trim(),
          lastName: lastName.value.trim(),
          postalCode: postalCode.value.trim(),
        },
      })
      // Mark the new values as persisted so "save" disables until the next edit.
      savedFirstName.value = firstName.value.trim()
      savedLastName.value = lastName.value.trim()
      savedPostalCode.value = postalCode.value.trim()
      nameMessage.value = { kind: 'ok', text: t('pages.settings.profile.saved') }
      // Best-effort: refresh the session so the header greeting updates. A
      // failure here must NOT turn a successful save into an error.
      void refreshSession().catch(() => {})
    } catch (error) {
      // Surface the server's reason (e.g. "Contact not found") so a failure is
      // diagnosable instead of a generic message.
      const reason = (error as { data?: { statusMessage?: string } }).data?.statusMessage
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

  await loadProfile()
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
            maxlength="16"
            class="bg-ivory dark:bg-poster-dark border-2 border-navy/20 dark:border-poster-darkBorder text-navy dark:text-ivory text-base rounded focus:border-sienna dark:focus:border-sienna-dark focus:outline-none block w-full sm:max-w-[12rem] p-2.5"
            :placeholder="t('pages.settings.profile.postalCode-placeholder')"
          />
          <p class="mt-2 text-xs text-navy/60 dark:text-poster-darkMuted">
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
