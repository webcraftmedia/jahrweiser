<!-- eslint-disable vue/multi-word-component-names -->
<template>
  <!-- Modal backdrop -->
  <Transition name="wc-backdrop">
    <div
      v-if="isOpen"
      class="wc-modal-backdrop"
      @click="handleX"
    />
  </Transition>

  <!-- Main modal -->
  <Transition name="wc-modal">
    <div
      v-if="isOpen"
      id="default-modal"
      tabindex="-1"
      aria-hidden="false"
      class="wc-modal-container"
      @click="handleX"
    >
      <div class="relative p-4 w-full max-w-lg mx-auto">
        <!-- Modal content -->
        <div class="wc-modal-content" @click.prevent.stop>
          <!-- Decorative corner accents -->
          <div class="wc-modal-corner wc-modal-corner-tl" aria-hidden="true"></div>
          <div class="wc-modal-corner wc-modal-corner-tr" aria-hidden="true"></div>
          <div class="wc-modal-corner wc-modal-corner-bl" aria-hidden="true"></div>
          <div class="wc-modal-corner wc-modal-corner-br" aria-hidden="true"></div>

          <!-- Modal header -->
          <div class="wc-modal-header">
            <h3 class="wc-modal-title">
              <slot name="title" />
            </h3>
            <button
              type="button"
              class="wc-modal-close"
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
                  stroke-width="2"
                  d="m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6"
                />
              </svg>
              <span class="sr-only">{{ $t('components.Modal.close') }}</span>
            </button>
          </div>

          <!-- Modal body -->
          <div class="wc-modal-body">
            <slot name="content" />
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
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

<style scoped>
/* Backdrop */
.wc-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgba(250, 249, 247, 0.7);
  backdrop-filter: blur(8px);
}

/* Modal container */
.wc-modal-container {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow-y: auto;
  padding: 1rem;
}

/* Modal content */
.wc-modal-content {
  position: relative;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(12px);
  border-radius: 24px;
  border: 1px solid rgba(248, 187, 217, 0.3);
  box-shadow:
    0 20px 60px -15px rgba(248, 187, 217, 0.3),
    0 10px 30px -10px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

/* Decorative corners */
.wc-modal-corner {
  position: absolute;
  width: 30px;
  height: 30px;
  pointer-events: none;
}

.wc-modal-corner-tl {
  top: 8px;
  left: 8px;
  border-top: 2px solid var(--wc-rose);
  border-left: 2px solid var(--wc-rose);
  border-radius: 8px 0 0 0;
}

.wc-modal-corner-tr {
  top: 8px;
  right: 8px;
  border-top: 2px solid var(--wc-sky);
  border-right: 2px solid var(--wc-sky);
  border-radius: 0 8px 0 0;
}

.wc-modal-corner-bl {
  bottom: 8px;
  left: 8px;
  border-bottom: 2px solid var(--wc-mint);
  border-left: 2px solid var(--wc-mint);
  border-radius: 0 0 0 8px;
}

.wc-modal-corner-br {
  bottom: 8px;
  right: 8px;
  border-bottom: 2px solid var(--wc-lavender);
  border-right: 2px solid var(--wc-lavender);
  border-radius: 0 0 8px 0;
}

/* Modal header */
.wc-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid rgba(248, 187, 217, 0.2);
  background: linear-gradient(135deg, var(--wc-rose-light) 0%, var(--wc-sky-light) 100%);
}

.wc-modal-title {
  font-family: 'Cormorant Garamond', serif;
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--wc-charcoal);
  margin: 0;
}

.wc-modal-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.6);
  color: var(--wc-charcoal-light);
  cursor: pointer;
  transition: all 0.3s ease;
}

.wc-modal-close:hover {
  background: var(--wc-rose-light);
  color: var(--wc-rose-dark);
  transform: rotate(90deg);
}

/* Modal body */
.wc-modal-body {
  padding: 1.5rem;
  font-family: 'Quicksand', sans-serif;
  color: var(--wc-charcoal);
}

/* Transitions */
.wc-backdrop-enter-active,
.wc-backdrop-leave-active {
  transition: opacity 0.3s ease;
}

.wc-backdrop-enter-from,
.wc-backdrop-leave-to {
  opacity: 0;
}

.wc-modal-enter-active,
.wc-modal-leave-active {
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.wc-modal-enter-from {
  opacity: 0;
  transform: scale(0.95) translateY(20px);
}

.wc-modal-leave-to {
  opacity: 0;
  transform: scale(0.95) translateY(-10px);
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .wc-modal-backdrop {
    background: rgba(26, 26, 46, 0.8);
  }

  .wc-modal-content {
    background: rgba(37, 37, 61, 0.95);
    border-color: rgba(206, 147, 216, 0.2);
    box-shadow:
      0 20px 60px -15px rgba(0, 0, 0, 0.4),
      0 10px 30px -10px rgba(206, 147, 216, 0.2);
  }

  .wc-modal-corner-tl {
    border-color: var(--wc-dark-rose);
  }

  .wc-modal-corner-tr {
    border-color: var(--wc-dark-sky);
  }

  .wc-modal-corner-bl {
    border-color: var(--wc-dark-mint);
  }

  .wc-modal-corner-br {
    border-color: var(--wc-dark-lavender);
  }

  .wc-modal-header {
    background: linear-gradient(135deg, rgba(244, 143, 177, 0.15) 0%, rgba(144, 202, 249, 0.15) 100%);
    border-bottom-color: rgba(206, 147, 216, 0.15);
  }

  .wc-modal-title {
    color: var(--wc-dark-text);
  }

  .wc-modal-close {
    background: rgba(45, 45, 74, 0.6);
    color: var(--wc-dark-text-muted);
  }

  .wc-modal-close:hover {
    background: rgba(206, 147, 216, 0.2);
    color: var(--wc-dark-lavender);
  }

  .wc-modal-body {
    color: var(--wc-dark-text);
  }
}
</style>
