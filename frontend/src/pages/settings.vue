<script setup lang="ts">
  definePageMeta({
    middleware: ['authenticated'],
  })

  const { t } = useI18n()
  const { fetch: refreshSession, user } = useUserSession()

  const subscribed = ref<boolean | null>(null)
  const saving = ref(false)
  const message = ref<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const firstName = ref('')
  const lastName = ref('')
  // Last persisted values, to disable "save" when nothing changed.
  const savedFirstName = ref('')
  const savedLastName = ref('')
  const profileLoaded = ref(false)
  const savingName = ref(false)
  const nameMessage = ref<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const isNameDirty = computed(
    () =>
      firstName.value.trim() !== savedFirstName.value ||
      lastName.value.trim() !== savedLastName.value,
  )
  const canSaveName = computed(() => firstName.value.trim().length > 0 && isNameDirty.value)

  async function loadProfile() {
    try {
      const data = await $fetch<{ firstName: string; lastName: string }>('/api/me/profile')
      firstName.value = data.firstName
      lastName.value = data.lastName
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
        body: { firstName: firstName.value.trim(), lastName: lastName.value.trim() },
      })
      // Mark the new values as persisted so "save" disables until the next edit.
      savedFirstName.value = firstName.value.trim()
      savedLastName.value = lastName.value.trim()
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

  async function load() {
    try {
      const data = await $fetch<{ subscribed: boolean; explicit: boolean }>('/api/me/newsletter')
      subscribed.value = data.subscribed
    } catch {
      subscribed.value = false
    }
  }

  async function toggle() {
    if (subscribed.value === null) return
    saving.value = true
    message.value = null
    const next = !subscribed.value
    try {
      await $fetch('/api/me/newsletter', {
        method: 'POST',
        body: { subscribed: next },
      })
      subscribed.value = next
      message.value = { kind: 'ok', text: t('pages.settings.newsletter.saved') }
    } catch {
      message.value = { kind: 'err', text: t('pages.settings.newsletter.error') }
    } finally {
      saving.value = false
    }
  }

  await load()
  await loadProfile()
</script>

<template>
  <div class="max-w-2xl mx-auto p-4 md:p-6">
    <h1 class="text-2xl font-semibold font-display mb-6">{{ t('pages.settings.title') }}</h1>

    <div class="space-y-6">
      <section
        class="bg-ivory dark:bg-poster-darkCard border border-navy/10 dark:border-poster-darkBorder rounded-lg p-4 md:p-6"
      >
        <h2 class="text-lg font-semibold mb-2">{{ t('pages.settings.profile.heading') }}</h2>
        <p class="text-sm text-navy/80 dark:text-ivory/80 mb-4">
          {{ t('pages.settings.profile.description') }}
        </p>

        <div v-if="!profileLoaded" class="text-navy/60 dark:text-ivory/60">
          {{ t('pages.settings.loading') }}
        </div>
        <form v-else class="space-y-4" @submit.prevent="saveName">
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
                class="bg-white dark:bg-poster-dark border-2 border-navy/20 dark:border-poster-darkBorder text-navy dark:text-ivory text-base rounded focus:border-sienna dark:focus:border-sienna-dark focus:outline-none block w-full p-2.5"
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
                class="bg-white dark:bg-poster-dark border-2 border-navy/20 dark:border-poster-darkBorder text-navy dark:text-ivory text-base rounded focus:border-sienna dark:focus:border-sienna-dark focus:outline-none block w-full p-2.5"
              />
            </div>
          </div>
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
        </form>
      </section>

      <section
        class="bg-ivory dark:bg-poster-darkCard border border-navy/10 dark:border-poster-darkBorder rounded-lg p-4 md:p-6"
      >
        <h2 class="text-lg font-semibold mb-2">{{ t('pages.settings.newsletter.heading') }}</h2>
        <p class="text-sm text-navy/80 dark:text-ivory/80 mb-4">
          {{ t('pages.settings.newsletter.description') }}
        </p>

        <div v-if="subscribed === null" class="text-navy/60 dark:text-ivory/60">
          {{ t('pages.settings.loading') }}
        </div>
        <div v-else class="flex items-center gap-3">
          <span
            :class="
              subscribed
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-navy/70 dark:text-ivory/70'
            "
          >
            {{
              subscribed
                ? t('pages.settings.newsletter.enabled')
                : t('pages.settings.newsletter.disabled')
            }}
          </span>
          <button
            type="button"
            class="ml-auto bg-sienna hover:brightness-110 text-ivory font-semibold rounded px-4 py-2 disabled:opacity-50"
            :disabled="saving"
            @click="toggle"
          >
            {{
              saving
                ? t('pages.settings.newsletter.saving')
                : subscribed
                  ? t('pages.settings.newsletter.toggleOff')
                  : t('pages.settings.newsletter.toggleOn')
            }}
          </button>
        </div>

        <p
          v-if="message"
          :class="
            message.kind === 'ok'
              ? 'mt-3 text-sm text-emerald-700 dark:text-emerald-400'
              : 'mt-3 text-sm text-red-700 dark:text-red-400'
          "
        >
          {{ message.text }}
        </p>
      </section>
    </div>
  </div>
</template>
