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
      <div class="relative bg-white rounded-lg shadow-sm dark:bg-gray-700" @click.prevent.stop>
        <!-- Modal header -->
        <div
          class="flex items-center justify-between p-4 md:p-5 border-b rounded-t dark:border-gray-600 border-gray-200"
        >
          <h3 class="text-xl font-semibold text-gray-900 dark:text-white">
            <slot name="title" />
          </h3>
          <button
            type="button"
            class="text-gray-400 bg-transparent hover:bg-gray-200 hover:text-gray-900 rounded-lg text-sm w-8 h-8 ms-auto inline-flex justify-center items-center dark:hover:bg-gray-600 dark:hover:text-white"
            data-modal-hide="default-modal"
            @click.prevent="handleX"
          >
            <svg
              class="w-3 h-3"
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 14 14"
            >
              <path
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6"
              />
            </svg>
            <span class="sr-only">{{ $t('components.Modal.close') }}</span>
          </button>
        </div>
        <!-- Modal body -->
        <div class="p-4 md:p-5 space-y-4">
          <slot name="content" />
        </div>
      </div>
    </div>
  </div>
  <div
    class="bg-gray-900/50 dark:bg-gray-900/80 fixed inset-0 z-40"
    :class="isOpen ? 'open' : 'hidden'"
    @click="handleX"
  />
</template>

<script setup lang="ts">
  /*const props = defineProps({
  open: { type: Boolean, required: true },
})*/

  const emit = defineEmits(['x'])

  function handleX() {
    emit('x')
  }

  const isOpen = ref(false)

  function open() {
    isOpen.value = true
  }

  function close() {
    isOpen.value = false
  }

  defineExpose({
    open,
    close,
  })
</script>
