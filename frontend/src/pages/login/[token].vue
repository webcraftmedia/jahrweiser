<template>
  <!-- Loading state -->
  <Transition name="wc-fade" mode="out-in">
    <div v-if="success" class="wc-token-container">
      <div class="wc-loading-card animate-bloom">
        <div class="wc-spinner-wrapper">
          <div class="wc-spinner"></div>
          <div class="wc-spinner-glow"></div>
        </div>
        <p class="wc-loading-text">{{ $t('pages.login.token.loading') }}</p>
      </div>
    </div>

    <!-- Error state -->
    <div v-else class="wc-token-container">
      <div class="wc-error-card animate-bloom">
        <!-- Decorative elements -->
        <div class="wc-error-decoration" aria-hidden="true">
          <div class="wc-decoration-circle wc-decoration-1"></div>
          <div class="wc-decoration-circle wc-decoration-2"></div>
        </div>

        <div class="wc-error-icon">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path fill-rule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clip-rule="evenodd" />
          </svg>
        </div>

        <h3 class="wc-error-title">{{ $t('pages.login.error.title') }}</h3>

        <div class="wc-error-content">
          <p>{{ $t('pages.login.error.text') }}</p>
        </div>

        <button
          type="button"
          class="wc-error-button"
          @click.prevent="navigateTo('/')"
        >
          {{ $t('pages.login.message.button') }}
        </button>
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
/* Container */
.wc-token-container {
  display: flex;
  width: 100%;
  min-height: calc(100vh - 10rem);
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

/* Loading card */
.wc-loading-card {
  text-align: center;
  padding: 3rem;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(12px);
  border-radius: 24px;
  border: 1px solid rgba(248, 187, 217, 0.3);
  box-shadow: 0 20px 60px -15px rgba(248, 187, 217, 0.3);
}

/* Custom spinner */
.wc-spinner-wrapper {
  position: relative;
  width: 60px;
  height: 60px;
  margin: 0 auto 1.5rem;
}

.wc-spinner {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: conic-gradient(
    from 0deg,
    transparent 0deg,
    var(--wc-rose) 90deg,
    var(--wc-sky) 180deg,
    var(--wc-mint) 270deg,
    transparent 360deg
  );
  animation: wcSpin 1.5s linear infinite;
  position: relative;
}

.wc-spinner::before {
  content: '';
  position: absolute;
  inset: 6px;
  background: white;
  border-radius: 50%;
}

.wc-spinner-glow {
  position: absolute;
  inset: -10px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(248, 187, 217, 0.3) 0%, transparent 70%);
  animation: wcPulse 2s ease-in-out infinite;
}

@keyframes wcSpin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

@keyframes wcPulse {
  0%, 100% { opacity: 0.5; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.1); }
}

.wc-loading-text {
  font-family: 'Quicksand', sans-serif;
  font-size: 1rem;
  color: var(--wc-charcoal);
  animation: wcFadeText 2s ease-in-out infinite;
}

@keyframes wcFadeText {
  0%, 100% { opacity: 0.7; }
  50% { opacity: 1; }
}

/* Error card */
.wc-error-card {
  position: relative;
  width: 100%;
  max-width: 400px;
  padding: 2.5rem;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(12px);
  border-radius: 24px;
  border: 1px solid rgba(255, 167, 38, 0.3);
  box-shadow:
    0 20px 60px -15px rgba(255, 167, 38, 0.2),
    0 10px 30px -10px rgba(0, 0, 0, 0.08);
  text-align: center;
  overflow: hidden;
}

.wc-error-decoration {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.wc-decoration-circle {
  position: absolute;
  border-radius: 50%;
  filter: blur(40px);
  opacity: 0.4;
}

.wc-decoration-1 {
  width: 150px;
  height: 150px;
  background: var(--wc-peach-light);
  top: -50px;
  left: -30px;
}

.wc-decoration-2 {
  width: 120px;
  height: 120px;
  background: var(--wc-rose-light);
  bottom: -40px;
  right: -30px;
}

.wc-error-icon {
  width: 60px;
  height: 60px;
  margin: 0 auto 1.5rem;
  padding: 1rem;
  background: linear-gradient(135deg, var(--wc-peach-light) 0%, var(--wc-rose-light) 100%);
  border-radius: 50%;
  color: var(--wc-peach-dark);
}

.wc-error-icon svg {
  width: 100%;
  height: 100%;
}

.wc-error-title {
  font-family: 'Cormorant Garamond', serif;
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--wc-charcoal);
  margin-bottom: 1rem;
}

.wc-error-content {
  font-family: 'Quicksand', sans-serif;
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--wc-charcoal);
  line-height: 1.6;
  margin-bottom: 1.5rem;
}

.wc-error-button {
  padding: 0.75rem 1.5rem;
  font-family: 'Quicksand', sans-serif;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--wc-peach-dark);
  background: transparent;
  border: 2px solid var(--wc-peach);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.wc-error-button:hover {
  background: var(--wc-peach-light);
  border-color: var(--wc-peach-medium);
}

/* Transition */
.wc-fade-enter-active,
.wc-fade-leave-active {
  transition: all 0.4s ease;
}

.wc-fade-enter-from,
.wc-fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .wc-loading-card {
    background: rgba(37, 37, 61, 0.9);
    border-color: rgba(206, 147, 216, 0.2);
    box-shadow: 0 20px 60px -15px rgba(0, 0, 0, 0.5);
  }

  .wc-spinner::before {
    background: var(--wc-dark-bg);
  }

  .wc-spinner-glow {
    background: radial-gradient(circle, rgba(206, 147, 216, 0.3) 0%, transparent 70%);
  }

  .wc-loading-text {
    color: var(--wc-dark-text);
  }

  .wc-error-card {
    background: rgba(37, 37, 61, 0.9);
    border-color: rgba(255, 204, 128, 0.2);
    box-shadow:
      0 20px 60px -15px rgba(0, 0, 0, 0.5),
      0 10px 30px -10px rgba(255, 204, 128, 0.15);
  }

  .wc-decoration-1 {
    background: rgba(255, 204, 128, 0.2);
  }

  .wc-decoration-2 {
    background: rgba(244, 143, 177, 0.2);
  }

  .wc-error-icon {
    background: linear-gradient(135deg, rgba(255, 204, 128, 0.2) 0%, rgba(244, 143, 177, 0.2) 100%);
    color: var(--wc-dark-peach);
  }

  .wc-error-title {
    color: var(--wc-dark-text);
  }

  .wc-error-content {
    color: var(--wc-dark-text);
  }

  .wc-error-button {
    color: var(--wc-dark-peach);
    border-color: var(--wc-dark-peach);
  }

  .wc-error-button:hover {
    background: rgba(255, 204, 128, 0.15);
  }
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .wc-spinner,
  .wc-spinner-glow,
  .wc-loading-text {
    animation: none;
  }
}
</style>
