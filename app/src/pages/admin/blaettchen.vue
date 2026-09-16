<script setup lang="ts">
  import type { BlaettchenIssue } from '~~/shared/blaettchen'

  import { formatBlaettchenFile, parseBlaettchenFile } from '~~/shared/blaettchen'

  definePageMeta({
    middleware: ['authenticated', 'admin'],
  })

  // The client with the 401 handling — see useApi().
  const api = useApi()
  // The same listing the icon rail and /blaettchen use — reloading it here
  // makes the rail entry appear the moment the first issue is published.
  const { issues, isLoading, loadError, load, urlFor, formatDateShort } = useBlaettchen()

  /** One per refusal the upload endpoint can answer with. */
  type UploadErrorKey = 'invalid' | 'exists' | 'too-large' | 'not-pdf' | 'failed'

  const selectedFile = ref<File | null>(null)
  const number = ref<number | null>(null)
  const date = ref('')
  const title = ref('')
  const replace = ref(false)
  /** True when the chosen file already followed the convention. */
  const prefilled = ref(false)

  const isUploading = ref(false)
  const uploadError = ref<UploadErrorKey | null>(null)
  const uploaded = ref<BlaettchenIssue | null>(null)

  /** Bumped after a successful upload to re-create the file input. */
  const formGeneration = ref(0)

  const pendingDelete = ref<string | null>(null)
  const deleteError = ref(false)

  function onFileChange(event: Event): void {
    selectedFile.value = (event.target as HTMLInputElement).files?.[0] ?? null
    uploadError.value = null
    uploaded.value = null
    prefilled.value = false
    if (!selectedFile.value) return

    // A file that already follows the convention fills the form. Anything else
    // is left to the editor rather than guessed at — the old names carry a
    // month that is not the publication date.
    const parsed = parseBlaettchenFile(selectedFile.value.name)
    if (!parsed) return
    number.value = parsed.number
    date.value = parsed.date
    title.value = parsed.title ?? ''
    prefilled.value = true
  }

  /**
   * The name the file will get, or null while the fields do not yet describe a
   * valid issue. Built and verified with the same functions the server uses, so
   * what the form shows is what will be on disk.
   */
  const targetName = computed<string | null>(() => {
    if (!number.value || !date.value) return null
    const candidate = formatBlaettchenFile({
      number: number.value,
      date: date.value,
      ...(title.value.trim() ? { title: title.value.trim() } : {}),
    })
    return parseBlaettchenFile(candidate) ? candidate : null
  })

  /** The issue this upload would displace — the number identifies an issue. */
  const clash = computed<BlaettchenIssue | null>(
    () => issues.value.find((issue) => issue.number === number.value) ?? null,
  )

  const canUpload = computed(() => !!selectedFile.value && !!targetName.value && !isUploading.value)

  const { t } = useI18n()

  /**
   * Static keys, one per refusal: a template literal would read fine here but
   * hides the keys from the i18n tooling (and from anyone grepping for them).
   */
  const uploadErrorMessage = computed<string | null>(() => {
    if (!uploadError.value) return null
    return {
      invalid: t('pages.admin.blaettchen.upload.error.invalid'),
      exists: t('pages.admin.blaettchen.upload.error.exists'),
      'too-large': t('pages.admin.blaettchen.upload.error.too-large'),
      'not-pdf': t('pages.admin.blaettchen.upload.error.not-pdf'),
      failed: t('pages.admin.blaettchen.upload.error.failed'),
    }[uploadError.value]
  })

  function errorKeyFor(error: unknown): UploadErrorKey {
    // The endpoint answers with a status per refusal, so the form can say what
    // is wrong instead of "upload failed".
    const byStatus: Record<number, UploadErrorKey> = {
      400: 'invalid',
      409: 'exists',
      413: 'too-large',
      415: 'not-pdf',
    }
    return byStatus[(error as { statusCode?: number }).statusCode ?? 0] ?? 'failed'
  }

  function resetForm(): void {
    selectedFile.value = null
    number.value = null
    date.value = ''
    title.value = ''
    replace.value = false
    prefilled.value = false
    // A file input keeps its selection, and re-picking the same file would not
    // even fire a change event. Bumping the key hands Vue a fresh element
    // instead of reaching into the DOM to clear it.
    formGeneration.value += 1
  }

  async function upload(): Promise<void> {
    if (!selectedFile.value || !targetName.value || !number.value) return
    isUploading.value = true
    uploadError.value = null
    uploaded.value = null
    try {
      const form = new FormData()
      form.append('file', selectedFile.value)
      form.append('number', String(number.value))
      form.append('date', date.value)
      if (title.value.trim()) form.append('title', title.value.trim())
      form.append('replace', replace.value ? 'true' : 'false')

      const result = await api<{ issue: BlaettchenIssue; replaced: string[] }>(
        '/api/admin/blaettchen/upload',
        { method: 'POST', body: form },
      )
      uploaded.value = result.issue
      resetForm()
      await load(true)
      // eslint-disable-next-line no-catch-all/no-catch-all -- einzelner api()-Aufruf: Fehler wird geloggt und als Statusmeldung angezeigt
    } catch (error) {
      console.error(error)
      uploadError.value = errorKeyFor(error)
    } finally {
      isUploading.value = false
    }
  }

  async function remove(file: string): Promise<void> {
    deleteError.value = false
    try {
      await api('/api/admin/blaettchen/delete', { method: 'POST', body: { file } })
      pendingDelete.value = null
      await load(true)
      // eslint-disable-next-line no-catch-all/no-catch-all -- einzelner api()-Aufruf: Fehler wird geloggt und als Statusmeldung angezeigt
    } catch (error) {
      console.error(error)
      deleteError.value = true
    }
  }

  onMounted(() => load(true))
</script>

<template>
  <div class="space-y-6">
    <h1 class="hidden md:block text-2xl font-display text-navy dark:text-ivory">
      {{ $t('pages.admin.blaettchen.title') }}
    </h1>

    <!-- Upload form -->
    <div
      class="animate-fade-slide-up bg-white/80 dark:bg-poster-darkCard rounded shadow-lg p-6 border-2 border-navy/15 dark:border-poster-darkBorder"
    >
      <h2 class="text-lg font-display text-navy dark:text-ivory mb-4">
        {{ $t('pages.admin.blaettchen.upload.title') }}
      </h2>
      <form class="space-y-4" @submit.prevent="upload">
        <div>
          <label
            for="blaettchen-file"
            class="block mb-2 text-sm font-medium font-body text-navy dark:text-ivory"
          >
            {{ $t('pages.admin.blaettchen.upload.file') }}
          </label>
          <input
            id="blaettchen-file"
            :key="formGeneration"
            type="file"
            accept="application/pdf,.pdf"
            class="bg-ivory dark:bg-poster-dark border-2 border-navy/20 dark:border-poster-darkBorder text-navy dark:text-ivory text-base rounded font-body focus:border-sienna dark:focus:border-sienna-dark focus:outline-none block w-full p-2.5"
            @change="onFileChange"
          />
          <p
            v-if="prefilled"
            class="mt-2 text-xs font-body text-olive-dark dark:text-olive-light"
            role="status"
          >
            {{ $t('pages.admin.blaettchen.upload.prefilled') }}
          </p>
        </div>

        <div class="grid gap-4 sm:grid-cols-3">
          <div class="sm:col-span-1">
            <label
              for="blaettchen-number"
              class="block mb-2 text-sm font-medium font-body text-navy dark:text-ivory"
            >
              {{ $t('pages.admin.blaettchen.upload.number') }}
            </label>
            <input
              id="blaettchen-number"
              v-model.number="number"
              type="number"
              min="1"
              max="999"
              class="bg-ivory dark:bg-poster-dark border-2 border-navy/20 dark:border-poster-darkBorder text-navy dark:text-ivory text-base rounded font-body focus:border-sienna dark:focus:border-sienna-dark focus:outline-none block w-full p-2.5"
              :placeholder="$t('pages.admin.blaettchen.upload.number-placeholder')"
            />
          </div>
          <div class="sm:col-span-1">
            <label
              for="blaettchen-date"
              class="block mb-2 text-sm font-medium font-body text-navy dark:text-ivory"
            >
              {{ $t('pages.admin.blaettchen.upload.date') }}
            </label>
            <input
              id="blaettchen-date"
              v-model="date"
              type="date"
              class="bg-ivory dark:bg-poster-dark border-2 border-navy/20 dark:border-poster-darkBorder text-navy dark:text-ivory text-base rounded font-body focus:border-sienna dark:focus:border-sienna-dark focus:outline-none block w-full p-2.5"
            />
          </div>
          <div class="sm:col-span-1">
            <label
              for="blaettchen-title"
              class="block mb-2 text-sm font-medium font-body text-navy dark:text-ivory"
            >
              {{ $t('pages.admin.blaettchen.upload.subtitle') }}
            </label>
            <input
              id="blaettchen-title"
              v-model="title"
              type="text"
              maxlength="120"
              class="bg-ivory dark:bg-poster-dark border-2 border-navy/20 dark:border-poster-darkBorder text-navy dark:text-ivory text-base rounded font-body focus:border-sienna dark:focus:border-sienna-dark focus:outline-none block w-full p-2.5"
              :placeholder="$t('pages.admin.blaettchen.upload.subtitle-placeholder')"
            />
          </div>
        </div>

        <!-- What will be on disk, before anything is sent. -->
        <p class="text-xs font-body text-navy/60 dark:text-poster-darkMuted">
          {{ $t('pages.admin.blaettchen.upload.target') }}
          <code v-if="targetName" class="font-mono text-navy dark:text-ivory">{{
            targetName
          }}</code>
          <span v-else>{{ $t('pages.admin.blaettchen.upload.target-incomplete') }}</span>
        </p>

        <!-- Appears exactly when it is relevant: an issue with this number is
             already published, and uploading would destroy it. -->
        <div
          v-if="clash"
          class="rounded border-2 border-sienna/30 dark:border-sienna/40 bg-sienna/5 dark:bg-sienna/10 p-3"
        >
          <p class="mb-2 text-sm font-body text-navy dark:text-ivory">
            {{ $t('pages.admin.blaettchen.upload.clash', { file: clash.file }) }}
          </p>
          <div class="flex items-center">
            <input
              id="blaettchen-replace"
              v-model="replace"
              type="checkbox"
              class="w-4 h-4 accent-sienna"
            />
            <label
              for="blaettchen-replace"
              class="ms-2 text-sm font-body text-navy dark:text-ivory"
            >
              {{ $t('pages.admin.blaettchen.upload.replace') }}
            </label>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            :disabled="!canUpload"
            class="text-ivory bg-sienna hover:brightness-110 dark:bg-sienna-dark dark:hover:brightness-110 focus:ring-4 focus:outline-none focus:ring-sienna/30 font-semibold font-body rounded text-sm px-4 py-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {{
              isUploading
                ? $t('pages.admin.blaettchen.upload.uploading')
                : $t('pages.admin.blaettchen.upload.submit')
            }}
          </button>
          <p
            v-if="uploaded"
            role="status"
            class="text-sm font-body text-olive-dark dark:text-olive-light"
          >
            {{ $t('pages.admin.blaettchen.upload.success', { file: uploaded.file }) }}
          </p>
          <p
            v-if="uploadErrorMessage"
            role="alert"
            class="text-sm font-body text-sienna dark:text-sienna-light"
          >
            {{ uploadErrorMessage }}
          </p>
        </div>
      </form>
    </div>

    <!-- Existing issues -->
    <div
      class="animate-fade-slide-up bg-white/80 dark:bg-poster-darkCard rounded shadow-lg p-6 border-2 border-navy/15 dark:border-poster-darkBorder"
    >
      <h2 class="text-lg font-display text-navy dark:text-ivory mb-4">
        {{ $t('pages.admin.blaettchen.list.title') }}
      </h2>

      <div v-if="isLoading" class="flex items-center justify-center gap-2 py-8">
        <LoadingDots />
      </div>
      <p
        v-else-if="loadError"
        role="alert"
        class="text-sm font-body text-sienna dark:text-sienna-light"
      >
        {{ $t('pages.admin.blaettchen.list.error') }}
      </p>
      <p
        v-else-if="issues.length === 0"
        class="text-sm font-body text-navy/60 dark:text-poster-darkMuted"
      >
        {{ $t('pages.admin.blaettchen.list.empty') }}
      </p>

      <ul v-else class="space-y-3">
        <li
          v-for="issue in issues"
          :key="issue.file"
          class="flex flex-wrap items-center justify-between gap-3 border-b border-navy/5 dark:border-poster-darkBorder/50 pb-3 last:border-b-0 last:pb-0"
        >
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <span class="font-medium font-body text-navy dark:text-ivory">
                {{ $t('pages.blaettchen.issue', { number: issue.number }) }}
              </span>
              <span
                class="inline-block rounded px-2 py-0.5 text-xs font-medium bg-navy/10 dark:bg-poster-darkBorder text-navy/70 dark:text-ivory/70"
              >
                <time :datetime="issue.date">{{ formatDateShort(issue.date) }}</time>
              </span>
            </div>
            <p class="text-sm font-body text-navy/60 dark:text-poster-darkMuted font-mono">
              {{ issue.file }}
            </p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <a
              :href="urlFor(issue)"
              target="_blank"
              rel="noopener noreferrer"
              class="text-sm font-body text-sienna dark:text-sienna-light hover:underline"
            >
              {{ $t('pages.blaettchen.open') }}
            </a>
            <!-- Two steps, because there is no second copy of this PDF. -->
            <template v-if="pendingDelete === issue.file">
              <button
                type="button"
                class="text-ivory bg-sienna hover:brightness-110 dark:bg-sienna-dark font-semibold font-body rounded text-sm px-3 py-1.5 transition-all"
                @click="remove(issue.file)"
              >
                {{ $t('pages.admin.blaettchen.list.delete-confirm') }}
              </button>
              <button
                type="button"
                class="text-sm font-body text-navy/70 dark:text-ivory/70 hover:underline"
                @click="pendingDelete = null"
              >
                {{ $t('pages.admin.blaettchen.list.cancel') }}
              </button>
            </template>
            <button
              v-else
              type="button"
              class="text-sm font-body text-navy/70 dark:text-ivory/70 hover:underline"
              @click="pendingDelete = issue.file"
            >
              {{ $t('pages.admin.blaettchen.list.delete') }}
            </button>
          </div>
        </li>
      </ul>

      <p
        v-if="deleteError"
        role="alert"
        class="mt-4 text-sm font-body text-sienna dark:text-sienna-light"
      >
        {{ $t('pages.admin.blaettchen.list.delete-error') }}
      </p>
    </div>
  </div>
</template>
