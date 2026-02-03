<!-- eslint-disable vue/multi-word-component-names -->
<template>
  <!-- Backdrop -->
  <Transition
    enter-active-class="transition-opacity duration-200 ease-out"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition-opacity duration-150 ease-in"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div
      v-if="isOpen"
      class="modal-backdrop"
      @click="handleX"
    />
  </Transition>

  <!-- Modal -->
  <Transition
    enter-active-class="animate-unfold"
    leave-active-class="animate-fold-away"
  >
    <div
      v-if="isOpen"
      id="default-modal"
      tabindex="-1"
      aria-hidden="false"
      class="modal-container"
      @click="handleX"
    >
      <div class="relative p-4 w-full max-w-2xl max-h-full mx-auto mt-[10vh]">
        <!-- Modal content - Notepad style -->
        <div class="modal-notepad" @click.prevent.stop>
          <!-- Tape decoration -->
          <div class="tape-top"></div>

          <!-- Modal header -->
          <div class="modal-header">
            <h3 class="modal-title">
              <slot name="title" />
            </h3>
            <button
              type="button"
              class="close-button"
              data-modal-hide="default-modal"
              @click.prevent="handleX"
            >
              <svg
                class="w-4 h-4"
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

          <hr class="sketchy-divider mx-4" />

          <!-- Modal body -->
          <div class="modal-body">
            <slot name="content" />
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
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

<style scoped>
.modal-backdrop {
  background-color: rgba(44, 36, 22, 0.5);
  position: fixed;
  inset: 0;
  z-index: 40;
  backdrop-filter: blur(2px);
}

@media (prefers-color-scheme: dark) {
  .modal-backdrop {
    background-color: rgba(0, 0, 0, 0.7);
  }
}

.modal-container {
  position: fixed;
  top: 0;
  right: 0;
  left: 0;
  z-index: 50;
  overflow-y: auto;
  overflow-x: hidden;
  width: 100%;
  height: calc(100% - 1rem);
  max-height: 100%;
}

.modal-notepad {
  position: relative;
  background-color: var(--paper-light);
  border: 2px solid var(--ink-dark);
  border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
  box-shadow: 5px 5px 0 rgba(44, 36, 22, 0.25);
  transform: rotate(-0.5deg);
}

@media (prefers-color-scheme: dark) {
  .modal-notepad {
    background-color: var(--paper-dark);
    border-color: var(--ink-light);
    box-shadow: 5px 5px 0 rgba(245, 240, 230, 0.1);
  }
}

.tape-top {
  position: absolute;
  top: -12px;
  left: 50%;
  transform: translateX(-50%) rotate(2deg);
  width: 100px;
  height: 28px;
  background-color: rgba(255, 235, 205, 0.85);
  border-left: 1px dashed rgba(44, 36, 22, 0.3);
  border-right: 1px dashed rgba(44, 36, 22, 0.3);
  z-index: 10;
}

@media (prefers-color-scheme: dark) {
  .tape-top {
    background-color: rgba(139, 119, 101, 0.6);
    border-left-color: rgba(245, 240, 230, 0.3);
    border-right-color: rgba(245, 240, 230, 0.3);
  }
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem 1rem;
}

.modal-title {
  font-family: 'Caveat', cursive;
  font-size: 1.75rem;
  font-weight: 600;
  color: var(--ink-dark);
  line-height: 1.2;
}

@media (prefers-color-scheme: dark) {
  .modal-title {
    color: var(--ink-light);
  }
}

.close-button {
  display: inline-flex;
  justify-content: center;
  align-items: center;
  width: 2rem;
  height: 2rem;
  color: var(--ink-dark);
  background-color: transparent;
  border: 2px solid var(--ink-dark);
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.2s ease;
  opacity: 0.6;
}

.close-button:hover {
  opacity: 1;
  background-color: var(--ink-red);
  border-color: var(--ink-red);
  color: var(--ink-light);
  transform: rotate(90deg);
}

@media (prefers-color-scheme: dark) {
  .close-button {
    color: var(--ink-light);
    border-color: var(--ink-light);
  }

  .close-button:hover {
    background-color: var(--ink-red-dark);
    border-color: var(--ink-red-dark);
  }
}

.modal-body {
  padding: 1rem 1.5rem 1.5rem;
  font-family: 'Patrick Hand', cursive;
  font-size: 1.1rem;
  color: var(--ink-dark);
  line-height: 1.6;
}

@media (prefers-color-scheme: dark) {
  .modal-body {
    color: var(--ink-light);
  }
}
</style>
