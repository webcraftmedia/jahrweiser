<script setup lang="ts">
  import type { TelegramChannel } from '~~/shared/telegram'

  import {
    isTelegramUrl,
    TELEGRAM_DESCRIPTION_MAX,
    TELEGRAM_NAME_MAX,
    TELEGRAM_URL_MAX,
  } from '~~/shared/telegram'

  definePageMeta({
    middleware: ['authenticated', 'admin'],
  })

  // The same list /telegram and the icon rail use — reloading it here makes the
  // rail entry appear with the first channel and vanish with the last.
  const { channels, isLoading, loadError, load } = useTelegramChannels()

  interface ChannelForm {
    name: string
    description: string
    url: string
    public: boolean
  }

  function emptyForm(): ChannelForm {
    return { name: '', description: '', url: '', public: false }
  }

  const create = ref<ChannelForm>(emptyForm())
  const isCreating = ref(false)
  const createError = ref(false)

  /** id of the row being edited inline, plus its working copy. */
  const editingId = ref<number | null>(null)
  const edit = ref<ChannelForm>(emptyForm())
  const isSaving = ref(false)
  const editError = ref(false)

  const pendingDelete = ref<number | null>(null)
  const actionError = ref(false)

  /**
   * A saveable channel needs a name and a real Telegram link. Checked with the
   * same function the endpoint validates with, so the button is disabled for
   * exactly the input the server would reject.
   */
  function isComplete(form: ChannelForm): boolean {
    return form.name.trim().length > 0 && isTelegramUrl(form.url.trim())
  }

  /** True once a URL has been typed but is not a Telegram link — for the hint. */
  function urlLooksWrong(form: ChannelForm): boolean {
    return form.url.trim().length > 0 && !isTelegramUrl(form.url.trim())
  }

  function payload(form: ChannelForm) {
    return {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      url: form.url.trim(),
      public: form.public,
    }
  }

  async function submitCreate(): Promise<void> {
    if (!isComplete(create.value) || isCreating.value) return
    isCreating.value = true
    createError.value = false
    try {
      await $fetch('/api/admin/telegram-channels/create', {
        method: 'POST',
        body: payload(create.value),
      })
      create.value = emptyForm()
      await load(true)
      // eslint-disable-next-line no-catch-all/no-catch-all -- einzelner $fetch: Fehler wird geloggt und als Statusmeldung angezeigt
    } catch (error) {
      console.error(error)
      createError.value = true
    } finally {
      isCreating.value = false
    }
  }

  function startEdit(channel: TelegramChannel): void {
    editingId.value = channel.id
    editError.value = false
    edit.value = {
      name: channel.name,
      description: channel.description ?? '',
      url: channel.url,
      public: channel.public,
    }
  }

  async function saveEdit(): Promise<void> {
    if (editingId.value === null || !isComplete(edit.value) || isSaving.value) return
    isSaving.value = true
    editError.value = false
    try {
      await $fetch('/api/admin/telegram-channels/update', {
        method: 'POST',
        body: { id: editingId.value, ...payload(edit.value) },
      })
      editingId.value = null
      await load(true)
      // eslint-disable-next-line no-catch-all/no-catch-all -- einzelner $fetch: Fehler wird geloggt und als Statusmeldung angezeigt
    } catch (error) {
      console.error(error)
      editError.value = true
    } finally {
      isSaving.value = false
    }
  }

  async function move(id: number, direction: 'up' | 'down'): Promise<void> {
    actionError.value = false
    try {
      await $fetch('/api/admin/telegram-channels/move', {
        method: 'POST',
        body: { id, direction },
      })
      await load(true)
      // eslint-disable-next-line no-catch-all/no-catch-all -- einzelner $fetch: Fehler wird geloggt und als Statusmeldung angezeigt
    } catch (error) {
      console.error(error)
      actionError.value = true
    }
  }

  async function remove(id: number): Promise<void> {
    actionError.value = false
    try {
      await $fetch('/api/admin/telegram-channels/delete', { method: 'POST', body: { id } })
      pendingDelete.value = null
      await load(true)
      // eslint-disable-next-line no-catch-all/no-catch-all -- einzelner $fetch: Fehler wird geloggt und als Statusmeldung angezeigt
    } catch (error) {
      console.error(error)
      actionError.value = true
    }
  }

  onMounted(() => load(true))

  const inputClass =
    'bg-ivory dark:bg-poster-dark border-2 border-navy/20 dark:border-poster-darkBorder text-navy dark:text-ivory text-base rounded font-body focus:border-sienna dark:focus:border-sienna-dark focus:outline-none block w-full p-2.5'
  const labelClass = 'block mb-2 text-sm font-medium font-body text-navy dark:text-ivory'
</script>

<template>
  <div class="space-y-6">
    <h1 class="hidden md:block text-2xl font-display text-navy dark:text-ivory">
      {{ $t('pages.admin.telegram.title') }}
    </h1>

    <!-- Create form -->
    <div
      class="animate-fade-slide-up bg-white/80 dark:bg-poster-darkCard rounded shadow-lg p-6 border-2 border-navy/15 dark:border-poster-darkBorder"
    >
      <h2 class="text-lg font-display text-navy dark:text-ivory mb-4">
        {{ $t('pages.admin.telegram.create.title') }}
      </h2>
      <p class="mb-4 text-xs font-body text-navy/60 dark:text-poster-darkMuted">
        {{ $t('pages.admin.telegram.create.hint') }}
      </p>
      <form class="space-y-4" @submit.prevent="submitCreate">
        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label for="channel-name" :class="labelClass">
              {{ $t('pages.admin.telegram.field.name') }}
            </label>
            <input
              id="channel-name"
              v-model="create.name"
              type="text"
              :maxlength="TELEGRAM_NAME_MAX"
              :class="inputClass"
              :placeholder="$t('pages.admin.telegram.field.name-placeholder')"
            />
          </div>
          <div>
            <label for="channel-url" :class="labelClass">
              {{ $t('pages.admin.telegram.field.url') }}
            </label>
            <input
              id="channel-url"
              v-model="create.url"
              type="url"
              :maxlength="TELEGRAM_URL_MAX"
              :class="inputClass"
              placeholder="https://t.me/..."
            />
            <p
              v-if="urlLooksWrong(create)"
              role="alert"
              class="mt-2 text-xs font-body text-sienna dark:text-sienna-light"
            >
              {{ $t('pages.admin.telegram.field.url-invalid') }}
            </p>
          </div>
        </div>
        <div>
          <label for="channel-description" :class="labelClass">
            {{ $t('pages.admin.telegram.field.description') }}
          </label>
          <input
            id="channel-description"
            v-model="create.description"
            type="text"
            :maxlength="TELEGRAM_DESCRIPTION_MAX"
            :class="inputClass"
            :placeholder="$t('pages.admin.telegram.field.description-placeholder')"
          />
        </div>
        <div class="flex items-center">
          <input
            id="channel-public"
            v-model="create.public"
            type="checkbox"
            class="w-4 h-4 accent-sienna"
          />
          <label for="channel-public" class="ms-2 text-sm font-body text-navy dark:text-ivory">
            {{ $t('pages.admin.telegram.field.public') }}
          </label>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            :disabled="!isComplete(create) || isCreating"
            class="text-ivory bg-sienna hover:brightness-110 dark:bg-sienna-dark dark:hover:brightness-110 focus:ring-4 focus:outline-none focus:ring-sienna/30 font-semibold font-body rounded text-sm px-4 py-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {{
              isCreating
                ? $t('pages.admin.telegram.create.creating')
                : $t('pages.admin.telegram.create.button')
            }}
          </button>
          <p
            v-if="createError"
            role="alert"
            class="text-sm font-body text-sienna dark:text-sienna-light"
          >
            {{ $t('pages.admin.telegram.create.error') }}
          </p>
        </div>
      </form>
    </div>

    <!-- Existing channels -->
    <div
      class="animate-fade-slide-up bg-white/80 dark:bg-poster-darkCard rounded shadow-lg p-6 border-2 border-navy/15 dark:border-poster-darkBorder"
    >
      <h2 class="text-lg font-display text-navy dark:text-ivory mb-4">
        {{ $t('pages.admin.telegram.list.title') }}
      </h2>

      <div v-if="isLoading" class="flex items-center justify-center gap-2 py-8">
        <LoadingDots />
      </div>
      <p
        v-else-if="loadError"
        role="alert"
        class="text-sm font-body text-sienna dark:text-sienna-light"
      >
        {{ $t('pages.admin.telegram.list.error') }}
      </p>
      <p
        v-else-if="channels.length === 0"
        class="text-sm font-body text-navy/60 dark:text-poster-darkMuted"
      >
        {{ $t('pages.admin.telegram.list.empty') }}
      </p>

      <ul v-else class="space-y-3">
        <li
          v-for="(channel, index) in channels"
          :key="channel.id"
          class="border-b border-navy/5 dark:border-poster-darkBorder/50 pb-3 last:border-b-0 last:pb-0"
        >
          <!-- Inline edit, like the registration links: no modal to lose the
               list behind, and the row stays where it is. -->
          <form v-if="editingId === channel.id" class="space-y-3" @submit.prevent="saveEdit">
            <div class="grid gap-3 sm:grid-cols-2">
              <input
                v-model="edit.name"
                type="text"
                :maxlength="TELEGRAM_NAME_MAX"
                :class="inputClass"
                :aria-label="$t('pages.admin.telegram.field.name')"
              />
              <input
                v-model="edit.url"
                type="url"
                :maxlength="TELEGRAM_URL_MAX"
                :class="inputClass"
                :aria-label="$t('pages.admin.telegram.field.url')"
              />
            </div>
            <input
              v-model="edit.description"
              type="text"
              :maxlength="TELEGRAM_DESCRIPTION_MAX"
              :class="inputClass"
              :aria-label="$t('pages.admin.telegram.field.description')"
            />
            <div class="flex items-center">
              <input
                :id="`channel-public-${channel.id}`"
                v-model="edit.public"
                type="checkbox"
                class="w-4 h-4 accent-sienna"
              />
              <label
                :for="`channel-public-${channel.id}`"
                class="ms-2 text-sm font-body text-navy dark:text-ivory"
              >
                {{ $t('pages.admin.telegram.field.public') }}
              </label>
            </div>
            <p
              v-if="urlLooksWrong(edit)"
              role="alert"
              class="text-xs font-body text-sienna dark:text-sienna-light"
            >
              {{ $t('pages.admin.telegram.field.url-invalid') }}
            </p>
            <div class="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                :disabled="!isComplete(edit) || isSaving"
                class="text-ivory bg-sienna hover:brightness-110 dark:bg-sienna-dark font-semibold font-body rounded text-sm px-3 py-1.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {{ $t('pages.admin.telegram.list.save') }}
              </button>
              <button
                type="button"
                class="text-sm font-body text-navy/70 dark:text-ivory/70 hover:underline"
                @click="editingId = null"
              >
                {{ $t('pages.admin.telegram.list.cancel') }}
              </button>
              <p
                v-if="editError"
                role="alert"
                class="text-sm font-body text-sienna dark:text-sienna-light"
              >
                {{ $t('pages.admin.telegram.list.save-error') }}
              </p>
            </div>
          </form>

          <div v-else class="flex flex-wrap items-center justify-between gap-3">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-medium font-body text-navy dark:text-ivory">
                  {{ channel.name }}
                </span>
                <span
                  class="inline-block rounded px-2 py-0.5 text-xs font-medium"
                  :class="
                    channel.public
                      ? 'bg-olive/15 text-olive-dark dark:text-olive-light'
                      : 'bg-navy/10 dark:bg-poster-darkBorder text-navy/70 dark:text-ivory/70'
                  "
                >
                  {{
                    channel.public
                      ? $t('pages.telegram.badge.public')
                      : $t('pages.telegram.badge.invite')
                  }}
                </span>
              </div>
              <p
                v-if="channel.description"
                class="text-sm font-body text-navy/60 dark:text-poster-darkMuted"
              >
                {{ channel.description }}
              </p>
              <p class="text-sm font-body text-navy/50 dark:text-poster-darkMuted break-all">
                {{ channel.url }}
              </p>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <!-- eslint-disable @intlify/vue-i18n/no-raw-text -- Pfeile sind
                   rein dekorativ; die Bedeutung steht im aria-label -->
              <!-- Order is what members see on /telegram, so it is edited here
                   rather than derived from a name or a date. -->
              <button
                type="button"
                :disabled="index === 0"
                :aria-label="$t('pages.admin.telegram.list.move-up')"
                :title="$t('pages.admin.telegram.list.move-up')"
                class="px-2 py-1 text-sm font-body text-navy/70 dark:text-ivory/70 hover:text-sienna disabled:opacity-30 disabled:cursor-not-allowed"
                @click="move(channel.id, 'up')"
              >
                ↑
              </button>
              <button
                type="button"
                :disabled="index === channels.length - 1"
                :aria-label="$t('pages.admin.telegram.list.move-down')"
                :title="$t('pages.admin.telegram.list.move-down')"
                class="px-2 py-1 text-sm font-body text-navy/70 dark:text-ivory/70 hover:text-sienna disabled:opacity-30 disabled:cursor-not-allowed"
                @click="move(channel.id, 'down')"
              >
                ↓
              </button>
              <!-- eslint-enable @intlify/vue-i18n/no-raw-text -->
              <button
                type="button"
                class="text-sm font-body text-navy/70 dark:text-ivory/70 hover:underline"
                @click="startEdit(channel)"
              >
                {{ $t('pages.admin.telegram.list.edit') }}
              </button>
              <!-- Two steps: a private invite link cannot be looked up again,
                   it has to be re-issued in Telegram. -->
              <template v-if="pendingDelete === channel.id">
                <button
                  type="button"
                  class="text-ivory bg-sienna hover:brightness-110 dark:bg-sienna-dark font-semibold font-body rounded text-sm px-3 py-1.5 transition-all"
                  @click="remove(channel.id)"
                >
                  {{ $t('pages.admin.telegram.list.delete-confirm') }}
                </button>
                <button
                  type="button"
                  class="text-sm font-body text-navy/70 dark:text-ivory/70 hover:underline"
                  @click="pendingDelete = null"
                >
                  {{ $t('pages.admin.telegram.list.cancel') }}
                </button>
              </template>
              <button
                v-else
                type="button"
                class="text-sm font-body text-navy/70 dark:text-ivory/70 hover:underline"
                @click="pendingDelete = channel.id"
              >
                {{ $t('pages.admin.telegram.list.delete') }}
              </button>
            </div>
          </div>
        </li>
      </ul>

      <p
        v-if="actionError"
        role="alert"
        class="mt-4 text-sm font-body text-sienna dark:text-sienna-light"
      >
        {{ $t('pages.admin.telegram.list.action-error') }}
      </p>
    </div>
  </div>
</template>
