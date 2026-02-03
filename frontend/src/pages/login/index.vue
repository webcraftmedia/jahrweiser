<template>
  <!-- Success message after login request -->
  <Transition name="wc-fade" mode="out-in">
    <div v-if="requestedLogin" class="wc-login-container">
      <div class="wc-message-card animate-bloom">
        <!-- Decorative elements -->
        <div class="wc-message-decoration" aria-hidden="true">
          <div class="wc-decoration-circle wc-decoration-1"></div>
          <div class="wc-decoration-circle wc-decoration-2"></div>
        </div>

        <div class="wc-message-icon">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M1.5 8.67v8.58a3 3 0 003 3h15a3 3 0 003-3V8.67l-8.928 5.493a3 3 0 01-3.144 0L1.5 8.67z" />
            <path d="M22.5 6.908V6.75a3 3 0 00-3-3h-15a3 3 0 00-3 3v.158l9.714 5.978a1.5 1.5 0 001.572 0L22.5 6.908z" />
          </svg>
        </div>

        <h3 class="wc-message-title">{{ $t('pages.login.message.title') }}</h3>

        <div class="wc-message-content">
          <p class="wc-message-highlight">{{ $t('pages.login.message.text1') }}</p>
          <p>{{ $t('pages.login.message.text2') }}</p>
          <p class="wc-message-hint">{{ $t('pages.login.message.hint') }}</p>
        </div>

        <button
          type="button"
          class="wc-message-button"
          @click.prevent="showLogin"
        >
          {{ $t('pages.login.message.button') }}
        </button>
      </div>
    </div>

    <!-- Login form -->
    <div v-else class="wc-login-container">
      <div class="wc-login-card animate-bloom">
        <!-- Decorative elements -->
        <div class="wc-card-decoration" aria-hidden="true">
          <div class="wc-decoration-blob wc-blob-1"></div>
          <div class="wc-decoration-blob wc-blob-2"></div>
        </div>

        <form class="wc-login-form" @submit.prevent="requestLoginLink">
          <h2 class="wc-login-title">
            {{ $t('pages.login.form.title') }}
          </h2>

          <div class="wc-form-group">
            <label for="email" class="wc-label">
              {{ $t('pages.login.form.email.label') }}
            </label>
            <div class="wc-input-wrapper">
              <div class="wc-input-icon">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 16" fill="currentColor">
                  <path d="m10.036 8.278 9.258-7.79A1.979 1.979 0 0 0 18 0H2A1.987 1.987 0 0 0 .641.541l9.395 7.737Z" />
                  <path d="M11.241 9.817c-.36.275-.801.425-1.255.427-.428 0-.845-.138-1.187-.395L0 2.6V14a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V2.5l-8.759 7.317Z" />
                </svg>
              </div>
              <input
                id="email-address-icon"
                v-model="credentials.email"
                type="email"
                class="wc-input"
                :placeholder="$t('pages.login.form.email.placeholder')"
                required
              />
            </div>
          </div>

          <button type="submit" class="wc-submit-button">
            <span>{{ $t('pages.login.form.button') }}</span>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="wc-button-icon">
              <path fill-rule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clip-rule="evenodd" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
const { loggedIn } = useUserSession()

if (loggedIn.value) {
  navigateTo('/')
}

const requestedLogin = ref(false)

const credentials = reactive({
  email: '',
})

async function requestLoginLink() {
  await $fetch('/api/requestLoginLink', {
    method: 'POST',
    body: credentials,
  })
  requestedLogin.value = true
}

async function showLogin() {
  requestedLogin.value = false
}
</script>

<style scoped>
/* Container */
.wc-login-container {
  display: flex;
  width: 100%;
  min-height: calc(100vh - 10rem);
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

/* Login Card */
.wc-login-card {
  position: relative;
  width: 100%;
  max-width: 400px;
  padding: 2.5rem;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(12px);
  border-radius: 24px;
  border: 1px solid rgba(248, 187, 217, 0.3);
  box-shadow:
    0 20px 60px -15px rgba(248, 187, 217, 0.3),
    0 10px 30px -10px rgba(0, 0, 0, 0.08);
  overflow: hidden;
}

/* Decorative blobs */
.wc-card-decoration {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.wc-decoration-blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(40px);
  opacity: 0.5;
}

.wc-blob-1 {
  width: 150px;
  height: 150px;
  background: var(--wc-rose-light);
  top: -50px;
  right: -30px;
}

.wc-blob-2 {
  width: 120px;
  height: 120px;
  background: var(--wc-sky-light);
  bottom: -40px;
  left: -30px;
}

/* Form */
.wc-login-form {
  position: relative;
  z-index: 1;
}

.wc-login-title {
  font-family: 'Cormorant Garamond', serif;
  font-size: 2rem;
  font-weight: 600;
  color: var(--wc-charcoal);
  margin-bottom: 2rem;
  text-align: center;
}

.wc-form-group {
  margin-bottom: 1.5rem;
}

.wc-label {
  display: block;
  font-family: 'Quicksand', sans-serif;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--wc-charcoal);
  margin-bottom: 0.5rem;
}

.wc-input-wrapper {
  position: relative;
}

.wc-input-icon {
  position: absolute;
  left: 1rem;
  top: 50%;
  transform: translateY(-50%);
  width: 1.25rem;
  height: 1.25rem;
  color: var(--wc-rose-medium);
  pointer-events: none;
}

.wc-input-icon svg {
  width: 100%;
  height: 100%;
}

.wc-input {
  width: 100%;
  padding: 0.875rem 1rem 0.875rem 3rem;
  font-family: 'Quicksand', sans-serif;
  font-size: 1rem;
  color: var(--wc-charcoal);
  background: rgba(255, 255, 255, 0.8);
  border: 2px solid rgba(248, 187, 217, 0.3);
  border-radius: 12px;
  outline: none;
  transition: all 0.3s ease;
}

.wc-input:focus {
  border-color: var(--wc-rose);
  box-shadow: 0 0 0 4px rgba(248, 187, 217, 0.2);
  background: white;
}

.wc-input::placeholder {
  color: var(--wc-charcoal-light);
  opacity: 0.6;
}

/* Submit button */
.wc-submit-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
  padding: 1rem 1.5rem;
  font-family: 'Quicksand', sans-serif;
  font-size: 1rem;
  font-weight: 600;
  color: white;
  background: linear-gradient(135deg, var(--wc-rose-medium) 0%, var(--wc-rose-dark) 100%);
  border: none;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

.wc-submit-button::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
  transition: left 0.5s ease;
}

.wc-submit-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px -5px rgba(236, 64, 122, 0.4);
}

.wc-submit-button:hover::before {
  left: 100%;
}

.wc-button-icon {
  width: 1.25rem;
  height: 1.25rem;
  transition: transform 0.3s ease;
}

.wc-submit-button:hover .wc-button-icon {
  transform: translateX(4px);
}

/* Message card (success state) */
.wc-message-card {
  position: relative;
  width: 100%;
  max-width: 450px;
  padding: 2.5rem;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(12px);
  border-radius: 24px;
  border: 1px solid rgba(187, 222, 251, 0.4);
  box-shadow:
    0 20px 60px -15px rgba(144, 202, 249, 0.3),
    0 10px 30px -10px rgba(0, 0, 0, 0.08);
  text-align: center;
  overflow: hidden;
}

.wc-message-decoration {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.wc-decoration-circle {
  position: absolute;
  border-radius: 50%;
  filter: blur(40px);
  opacity: 0.5;
}

.wc-decoration-1 {
  width: 150px;
  height: 150px;
  background: var(--wc-sky-light);
  top: -50px;
  left: -30px;
}

.wc-decoration-2 {
  width: 120px;
  height: 120px;
  background: var(--wc-mint-light);
  bottom: -40px;
  right: -30px;
}

.wc-message-icon {
  width: 60px;
  height: 60px;
  margin: 0 auto 1.5rem;
  padding: 1rem;
  background: linear-gradient(135deg, var(--wc-sky-light) 0%, var(--wc-mint-light) 100%);
  border-radius: 50%;
  color: var(--wc-sky-dark);
}

.wc-message-icon svg {
  width: 100%;
  height: 100%;
}

.wc-message-title {
  font-family: 'Cormorant Garamond', serif;
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--wc-charcoal);
  margin-bottom: 1rem;
}

.wc-message-content {
  font-family: 'Quicksand', sans-serif;
  font-size: 0.95rem;
  color: var(--wc-charcoal);
  line-height: 1.6;
  margin-bottom: 1.5rem;
}

.wc-message-highlight {
  font-weight: 600;
  color: var(--wc-sky-dark);
  margin-bottom: 0.5rem;
}

.wc-message-hint {
  margin-top: 1rem;
  font-size: 0.85rem;
  color: var(--wc-charcoal-light);
}

.wc-message-button {
  padding: 0.75rem 1.5rem;
  font-family: 'Quicksand', sans-serif;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--wc-sky-dark);
  background: transparent;
  border: 2px solid var(--wc-sky);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.wc-message-button:hover {
  background: var(--wc-sky-light);
  border-color: var(--wc-sky-medium);
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
  .wc-login-card,
  .wc-message-card {
    background: rgba(37, 37, 61, 0.9);
    border-color: rgba(206, 147, 216, 0.2);
    box-shadow:
      0 20px 60px -15px rgba(0, 0, 0, 0.5),
      0 10px 30px -10px rgba(206, 147, 216, 0.2);
  }

  .wc-blob-1 {
    background: rgba(244, 143, 177, 0.3);
  }

  .wc-blob-2 {
    background: rgba(144, 202, 249, 0.3);
  }

  .wc-login-title,
  .wc-message-title {
    color: var(--wc-dark-text);
  }

  .wc-label {
    color: var(--wc-dark-text);
  }

  .wc-input {
    background: rgba(45, 45, 74, 0.8);
    border-color: rgba(206, 147, 216, 0.2);
    color: var(--wc-dark-text);
  }

  .wc-input:focus {
    border-color: var(--wc-dark-lavender);
    box-shadow: 0 0 0 4px rgba(206, 147, 216, 0.15);
    background: var(--wc-dark-surface);
  }

  .wc-input::placeholder {
    color: var(--wc-dark-text-muted);
  }

  .wc-input-icon {
    color: var(--wc-dark-lavender);
  }

  .wc-submit-button {
    background: linear-gradient(135deg, var(--wc-dark-lavender) 0%, #9c27b0 100%);
  }

  .wc-submit-button:hover {
    box-shadow: 0 8px 25px -5px rgba(206, 147, 216, 0.4);
  }

  .wc-decoration-1 {
    background: rgba(144, 202, 249, 0.2);
  }

  .wc-decoration-2 {
    background: rgba(165, 214, 167, 0.2);
  }

  .wc-message-icon {
    background: linear-gradient(135deg, rgba(144, 202, 249, 0.2) 0%, rgba(165, 214, 167, 0.2) 100%);
    color: var(--wc-dark-sky);
  }

  .wc-message-content {
    color: var(--wc-dark-text);
  }

  .wc-message-highlight {
    color: var(--wc-dark-sky);
  }

  .wc-message-hint {
    color: var(--wc-dark-text-muted);
  }

  .wc-message-button {
    color: var(--wc-dark-sky);
    border-color: var(--wc-dark-sky);
  }

  .wc-message-button:hover {
    background: rgba(144, 202, 249, 0.15);
    border-color: var(--wc-dark-sky);
  }
}
</style>
