<script setup lang="ts">
  definePageMeta({
    middleware: ['authenticated'],
  })

  const { t } = useI18n()

  const subscribed = ref<boolean | null>(null)
  const saving = ref(false)
  const message = ref<{ kind: 'ok' | 'err'; text: string } | null>(null)

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
</script>

<template>
  <div class="max-w-2xl mx-auto p-4 md:p-6">
    <h1 class="text-2xl font-semibold font-display mb-6">{{ t('pages.settings.title') }}</h1>

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
</template>
