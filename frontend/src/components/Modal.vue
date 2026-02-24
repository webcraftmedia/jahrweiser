<!-- eslint-disable vue/multi-word-component-names -->
<template>
  <!-- Main modal -->

  <div
    id="default-modal"
    tabindex="-1"
    aria-hidden="false"
    :class="isOpen ? 'open' : 'hidden'"
    class="overflow-y-auto overflow-x-hidden fixed top-0 right-0 left-0 z-50 justify-center items-center w-full md:inset-0 h-[calc(100%-1rem)] max-h-full"
    @click="handleX"
  >
    <div class="relative p-4 w-full max-h-full">
      <!-- Modal content -->
      <div
        class="modal-card relative bg-ivory dark:bg-poster-darkCard shadow-xl border-2 border-navy/20 dark:border-poster-darkBorder flex flex-col max-h-[calc(100vh-2rem)]"
        @click.prevent.stop
      >
        <!-- Modal header -->
        <div
          class="flex items-center justify-between px-5 py-3 md:px-6 md:py-4 border-b-2 border-navy/15 dark:border-poster-darkBorder bg-navy/3 dark:bg-poster-dark shrink-0"
        >
          <div class="flex items-center gap-3">
            <LogoSmall class="logo-modal" />
            <h3 class="text-xl font-semibold text-navy dark:text-ivory font-display tracking-wide">
              <slot name="title" />
            </h3>
          </div>
          <button
            type="button"
            class="text-navy/50 hover:text-sienna w-8 h-8 inline-flex justify-center items-center transition-colors dark:text-ivory/50 dark:hover:text-sienna-light"
            data-modal-hide="default-modal"
            @click.prevent="handleX"
          >
            <svg
              class="w-3.5 h-3.5"
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 14 14"
            >
              <path
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2.5"
                d="m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6"
              />
            </svg>
            <span class="sr-only">{{ $t('components.Modal.close') }}</span>
          </button>
        </div>
        <!-- Modal body -->
        <div ref="modalBody" class="px-5 py-4 md:px-6 md:py-5 space-y-4 overflow-y-auto">
          <slot name="content" />
        </div>
      </div>
    </div>
  </div>
  <div
    class="bg-navy/50 dark:bg-navy-dark/80 fixed inset-0 z-40"
    :class="isOpen ? 'open' : 'hidden'"
    @click="handleX"
  />
</template>

<script setup lang="ts">
  import LogoSmall from '~/../assets/logo-small.svg'

  const emit = defineEmits(['x'])

  function handleX() {
    emit('x')
  }

  const isOpen = ref(false)
  const modalBody = ref<HTMLElement>()

  function open() {
    isOpen.value = true
    nextTick(() => modalBody.value?.scrollTo(0, 0))
  }

  function close() {
    isOpen.value = false
  }

  defineExpose({
    open,
    close,
  })
</script>

<style scoped>
  @reference "tailwindcss";

  .logo-modal {
    width: 40px;
    height: 40px;
    flex-shrink: 0;
  }

  .modal-card {
    border-radius: 2px;
    box-shadow:
      0 4px 24px rgba(0, 0, 0, 0.15),
      0 0 0 1px rgba(30, 41, 59, 0.05);
  }

  .dark .modal-card {
    box-shadow:
      0 4px 24px rgba(0, 0, 0, 0.4),
      0 0 0 1px rgba(61, 54, 48, 0.3);
  }
</style>

<style>
  .dark .logo-modal circle {
    fill: transparent !important;
    filter: none !important;
  }
  .dark .logo-modal [aria-label='G'] {
    fill: #c2410c !important;
  }
  .dark .logo-modal [aria-label='&'] {
    fill: #d97706 !important;
  }
</style>
