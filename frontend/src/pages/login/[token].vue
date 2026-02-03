<template>
  <!-- Loading state - Pencil writing animation -->
  <Transition
    enter-active-class="animate-fade-slide"
    leave-active-class="animate-fold-away"
  >
    <div v-if="success" class="flex w-full">
      <div class="loading-container">
        <div class="pencil-loader">
          <svg class="pencil-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <div class="writing-line"></div>
        </div>
        <p class="loading-text">{{ $t('pages.login.token.loading') }}</p>
      </div>
    </div>
  </Transition>

  <!-- Error state - Post-it style -->
  <Transition
    enter-active-class="animate-pop"
    leave-active-class="animate-fold-away"
  >
    <div v-if="!success" class="flex w-full">
      <div class="error-postit">
        <div class="flex items-center mb-3">
          <svg
            class="w-5 h-5 mr-2"
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              d="M10 .5a9.5 9.5 0 1 0 9.5 9.5A9.51 9.51 0 0 0 10 .5ZM9.5 4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM12 15H8a1 1 0 0 1 0-2h1v-3H8a1 1 0 0 1 0-2h2a1 1 0 0 1 1 1v4h1a1 1 0 0 1 0 2Z"
            />
          </svg>
          <span class="sr-only">{{ $t('pages.login.message.info') }}</span>
          <h3 class="error-title">{{ $t('pages.login.error.title') }}</h3>
        </div>
        <div class="error-body">
          <p class="font-bold">{{ $t('pages.login.error.text') }}</p>
        </div>
        <div class="mt-4">
          <button
            class="error-button"
            type="button"
            aria-label="Close"
            @click.prevent="navigateTo('/')"
          >
            {{ $t('pages.login.message.button') }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
const { loggedIn, fetch: refreshSession } = useUserSession()

if (loggedIn.value) {
  navigateTo('/')
}

const route = useRoute()

const success = ref(true)

onMounted(async () => {
  try {
    await $fetch('/api/redeemLoginLink', {
      method: 'POST',
      body: route.params,
    })
    await refreshSession()
    await navigateTo('/')
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
    success.value = false
  }
})
</script>

<style scoped>
.loading-container {
  margin: 3rem auto;
  text-align: center;
}

.pencil-loader {
  position: relative;
  width: 80px;
  height: 80px;
  margin: 0 auto 1.5rem;
}

.pencil-icon {
  width: 40px;
  height: 40px;
  color: var(--ink-blue);
  animation: pencil-write 1.2s ease-in-out infinite;
  transform-origin: bottom right;
}

@keyframes pencil-write {
  0%, 100% {
    transform: translateX(0) translateY(0) rotate(-45deg);
  }
  25% {
    transform: translateX(5px) translateY(5px) rotate(-40deg);
  }
  50% {
    transform: translateX(10px) translateY(0) rotate(-45deg);
  }
  75% {
    transform: translateX(5px) translateY(-5px) rotate(-50deg);
  }
}

.writing-line {
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  height: 2px;
  background-color: var(--ink-dark);
  border-radius: 1px;
  animation: line-grow 1.2s ease-in-out infinite;
}

@keyframes line-grow {
  0%, 100% {
    width: 0;
    opacity: 0;
  }
  50% {
    width: 40px;
    opacity: 0.5;
  }
}

@media (prefers-color-scheme: dark) {
  .pencil-icon {
    color: var(--ink-blue-dark);
  }

  .writing-line {
    background-color: var(--ink-light);
  }
}

.loading-text {
  font-family: 'Patrick Hand', cursive;
  font-size: 1.2rem;
  color: var(--ink-dark);
  opacity: 0.8;
}

@media (prefers-color-scheme: dark) {
  .loading-text {
    color: var(--ink-light);
  }
}

/* Error Post-it - Pink variant */
.error-postit {
  max-width: 24rem;
  margin: 2rem auto;
  padding: 1.5rem;
  background-color: #ffcdd2;
  box-shadow: 4px 4px 8px rgba(44, 36, 22, 0.3);
  transform: rotate(-1deg);
  position: relative;
}

.error-postit::before {
  content: '';
  position: absolute;
  top: -8px;
  left: 50%;
  transform: translateX(-50%) rotate(2deg);
  width: 60px;
  height: 20px;
  background-color: rgba(255, 235, 205, 0.8);
  border-left: 1px dashed rgba(44, 36, 22, 0.2);
  border-right: 1px dashed rgba(44, 36, 22, 0.2);
}

@media (prefers-color-scheme: dark) {
  .error-postit {
    background-color: #5c2a2a;
    color: var(--ink-light);
    box-shadow: 4px 4px 8px rgba(0, 0, 0, 0.4);
  }

  .error-postit::before {
    background-color: rgba(139, 119, 101, 0.6);
    border-left-color: rgba(245, 240, 230, 0.2);
    border-right-color: rgba(245, 240, 230, 0.2);
  }
}

.error-title {
  font-family: 'Caveat', cursive;
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--ink-red);
}

@media (prefers-color-scheme: dark) {
  .error-title {
    color: var(--ink-red-dark);
  }
}

.error-body {
  font-family: 'Kalam', cursive;
  font-size: 1rem;
  color: var(--ink-dark);
  line-height: 1.5;
}

@media (prefers-color-scheme: dark) {
  .error-body {
    color: var(--ink-light);
  }
}

.error-button {
  font-family: 'Patrick Hand', cursive;
  font-size: 1rem;
  padding: 0.5rem 1rem;
  background-color: transparent;
  color: var(--ink-red);
  border: 2px solid var(--ink-red);
  border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
  box-shadow: 2px 2px 0 rgba(44, 36, 22, 0.15);
  cursor: pointer;
  transition: all 0.2s ease;
}

.error-button:hover {
  background-color: var(--ink-red);
  color: var(--ink-light);
  transform: translateY(-1px) rotate(-1deg);
}

@media (prefers-color-scheme: dark) {
  .error-button {
    color: var(--ink-red-dark);
    border-color: var(--ink-red-dark);
  }

  .error-button:hover {
    background-color: var(--ink-red-dark);
    color: var(--paper-dark);
  }
}
</style>
