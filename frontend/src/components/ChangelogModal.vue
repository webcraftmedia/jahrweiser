<template>
  <Modal ref="modal" @x="modal?.close()">
    <template #title>
      {{ $t('components.Footer.changelog') }}
    </template>
    <template #content>
      <p class="font-semibold text-navy/70 dark:text-ivory/70 mb-4">
        {{ $t('components.Footer.changelog-intro-before') }}
        <a
          href="https://github.com/webcraftmedia/jahrweiser"
          target="_blank"
          rel="noopener noreferrer"
          class="inline text-sienna dark:text-sienna-light hover:underline transition-colors"
          @click.stop
        >
          <svg class="inline w-4 h-4 align-middle" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path
              d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
            />
          </svg>
          {{ $t('components.Footer.changelog-intro-after') }}</a>.
      </p>

      <div class="space-y-3">
        <details
          v-for="(section, index) in sections"
          :ref="
            (el: any) => {
              if (index === 0 && el) el.open = true
            }
          "
          :key="section.version"
          class="group border border-navy/15 dark:border-poster-darkBorder rounded"
        >
          <summary
            class="flex items-center justify-between cursor-pointer px-4 py-2.5 bg-navy/5 dark:bg-poster-dark hover:bg-navy/10 dark:hover:bg-poster-darkCard transition-colors select-none list-none [&::-webkit-details-marker]:hidden"
            @click.stop
          >
            <!-- eslint-disable-next-line @intlify/vue-i18n/no-raw-text -->
            <span class="font-semibold text-navy dark:text-ivory font-display">
              v{{ section.version }}
            </span>
            <span class="text-sm text-navy/50 dark:text-ivory/50">
              {{ section.date }}
            </span>
          </summary>
          <!-- eslint-disable vue/no-v-html -->
          <div
            class="changelog-content px-4 py-3 text-sm text-navy/80 dark:text-ivory/80"
            v-html="section.html"
            @click.stop
          />
        </details>
      </div>
    </template>
  </Modal>
</template>

<script setup lang="ts">
  import Modal from './Modal.vue'

  import changelogRaw from '~/../../CHANGELOG.md?raw'

  const modal = ref<InstanceType<typeof Modal>>()

  interface ChangelogSection {
    version: string
    date: string
    html: string
  }

  function parseChangelog(raw: string): ChangelogSection[] {
    const versionBlocks = raw.split(/^## /m).slice(1)

    return versionBlocks.map((block) => {
      const lines = block.split('\n')
      const header = lines[0]!
      const match = header.match(/^(.+?)\s*\((.+?)\)/)
      const version = match?.[1] ?? header
      const date = match?.[2] ?? ''

      const content = lines.slice(1).join('\n').trim()
      const html = markdownToHtml(content)

      return { version, date, html }
    })
  }

  function markdownToHtml(md: string): string {
    let html = ''
    const lines = md.split('\n')
    let inList = false

    for (const line of lines) {
      if (line.startsWith('### ')) {
        if (inList) {
          html += '</ul>'
          inList = false
        }
        html += `<h4 class="font-semibold mt-3 mb-1">${escapeHtml(line.slice(4))}</h4>`
      } else if (line.startsWith('* ')) {
        if (!inList) {
          html += '<ul class="list-disc pl-5 space-y-0.5">'
          inList = true
        }
        html += `<li>${linkify(escapeHtml(line.slice(2)))}</li>`
      } else if (line.trim() === '') {
        if (inList) {
          html += '</ul>'
          inList = false
        }
      }
    }
    if (inList) html += '</ul>'

    return html
  }

  function escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function linkify(str: string): string {
    // Convert escaped markdown links [text](url) back to <a> tags
    // Since we escaped HTML, brackets and parens are still intact
    return str
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(
        /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-sienna dark:text-sienna-light hover:underline">$1</a>',
      )
  }

  const sections = parseChangelog(changelogRaw)

  function open() {
    modal.value?.open()
  }

  defineExpose({ open })
</script>
