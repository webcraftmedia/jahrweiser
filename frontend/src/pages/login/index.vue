<template>
  <!-- Success message - Post-it style -->
  <Transition
    enter-active-class="animate-pop"
    leave-active-class="animate-fold-away"
  >
    <div v-if="requestedLogin" class="flex w-full">
      <div class="postit-message">
        <div class="flex items-center mb-3">
          <svg
            class="w-5 h-5 mr-2 text-ink-blue dark:text-ink-blue-dark"
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
          <h3 class="postit-title">{{ $t('pages.login.message.title') }}</h3>
        </div>
        <div class="postit-body">
          <p class="font-bold mb-1">{{ $t('pages.login.message.text1') }}</p>
          <p>{{ $t('pages.login.message.text2') }}</p>
          <p class="pt-3 opacity-80 text-sm">{{ $t('pages.login.message.hint') }}</p>
        </div>
        <div class="mt-4">
          <button
            class="sketchy-button-outline text-sm"
            type="button"
            aria-label="Close"
            @click.prevent="showLogin"
          >
            {{ $t('pages.login.message.button') }}
          </button>
        </div>
      </div>
    </div>
  </Transition>

  <!-- Login form - Notebook style -->
  <Transition
    enter-active-class="animate-fade-slide"
    leave-active-class="animate-fold-away"
  >
    <div v-if="!requestedLogin" class="flex w-full">
      <div class="notebook-form">
        <!-- Spiral binding decoration -->
        <div class="spiral-holes"></div>

        <form class="form-content" @submit.prevent="requestLoginLink">
          <h5 class="form-title">
            {{ $t('pages.login.form.title') }}
          </h5>

          <hr class="sketchy-divider my-4" />

          <div class="mb-6">
            <label for="email" class="form-label">
              {{ $t('pages.login.form.email.label') }}
            </label>
            <div class="relative">
              <div class="absolute inset-y-0 start-0 flex items-center ps-3.5 pointer-events-none">
                <svg
                  class="w-4 h-4 opacity-50"
                  aria-hidden="true"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="currentColor"
                  viewBox="0 0 20 16"
                >
                  <path
                    d="m10.036 8.278 9.258-7.79A1.979 1.979 0 0 0 18 0H2A1.987 1.987 0 0 0 .641.541l9.395 7.737Z"
                  />
                  <path
                    d="M11.241 9.817c-.36.275-.801.425-1.255.427-.428 0-.845-.138-1.187-.395L0 2.6V14a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V2.5l-8.759 7.317Z"
                  />
                </svg>
              </div>
              <input
                id="email-address-icon"
                v-model="credentials.email"
                type="text"
                class="form-input"
                :placeholder="$t('pages.login.form.email.placeholder')"
              />
            </div>
          </div>

          <button
            type="submit"
            class="submit-button"
          >
            <span class="button-text">{{ $t('pages.login.form.button') }}</span>
            <svg class="button-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M5 12h14M12 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/>
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
.notebook-form {
  position: relative;
  margin: 2rem auto;
  width: 100%;
  max-width: 24rem;
  background-color: var(--paper-light);
  border: 2px solid var(--ink-dark);
  border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
  box-shadow: 5px 5px 0 rgba(44, 36, 22, 0.2);
  transform: rotate(-0.5deg);
}

@media (prefers-color-scheme: dark) {
  .notebook-form {
    background-color: var(--paper-dark);
    border-color: var(--ink-light);
    box-shadow: 5px 5px 0 rgba(245, 240, 230, 0.1);
  }
}

.spiral-holes {
  position: absolute;
  left: 20px;
  top: 15px;
  bottom: 15px;
  width: 4px;
  background: repeating-linear-gradient(
    to bottom,
    var(--ink-dark) 0px,
    var(--ink-dark) 6px,
    transparent 6px,
    transparent 18px
  );
  opacity: 0.3;
  border-radius: 2px;
}

@media (prefers-color-scheme: dark) {
  .spiral-holes {
    background: repeating-linear-gradient(
      to bottom,
      var(--ink-light) 0px,
      var(--ink-light) 6px,
      transparent 6px,
      transparent 18px
    );
  }
}

.form-content {
  padding: 1.5rem 1.5rem 1.5rem 2.5rem;
}

.form-title {
  font-family: 'Caveat', cursive;
  font-size: 2rem;
  font-weight: 600;
  color: var(--ink-dark);
}

@media (prefers-color-scheme: dark) {
  .form-title {
    color: var(--ink-light);
  }
}

.form-label {
  display: block;
  margin-bottom: 0.5rem;
  font-family: 'Patrick Hand', cursive;
  font-size: 1.1rem;
  color: var(--ink-dark);
}

@media (prefers-color-scheme: dark) {
  .form-label {
    color: var(--ink-light);
  }
}

.form-input {
  width: 100%;
  padding: 0.75rem 0.75rem 0.75rem 2.5rem;
  font-family: 'Patrick Hand', cursive;
  font-size: 1.1rem;
  color: var(--ink-dark);
  background-color: transparent;
  border: none;
  border-bottom: 2px solid var(--ink-dark);
  border-radius: 0;
  outline: none;
  transition: all 0.2s ease;
}

.form-input:focus {
  border-bottom-color: var(--ink-blue);
  background-color: rgba(74, 111, 165, 0.05);
}

.form-input::placeholder {
  color: rgba(44, 36, 22, 0.4);
  font-style: italic;
}

@media (prefers-color-scheme: dark) {
  .form-input {
    color: var(--ink-light);
    border-bottom-color: var(--ink-light);
  }

  .form-input:focus {
    border-bottom-color: var(--ink-blue-dark);
    background-color: rgba(106, 143, 197, 0.1);
  }

  .form-input::placeholder {
    color: rgba(245, 240, 230, 0.4);
  }
}

.submit-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 0.75rem 1.5rem;
  font-family: 'Patrick Hand', cursive;
  font-size: 1.2rem;
  color: var(--ink-light);
  background-color: var(--ink-blue);
  border: 2px solid var(--ink-dark);
  border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
  box-shadow: 3px 3px 0 rgba(44, 36, 22, 0.2);
  cursor: pointer;
  transition: all 0.2s ease;
}

.submit-button:hover {
  transform: translateY(-2px) rotate(-1deg);
  box-shadow: 4px 4px 0 rgba(44, 36, 22, 0.25);
}

.submit-button:active {
  transform: translateY(1px);
  box-shadow: 2px 2px 0 rgba(44, 36, 22, 0.2);
}

@media (prefers-color-scheme: dark) {
  .submit-button {
    background-color: var(--ink-blue-dark);
    border-color: var(--ink-light);
    box-shadow: 3px 3px 0 rgba(245, 240, 230, 0.1);
  }

  .submit-button:hover {
    box-shadow: 4px 4px 0 rgba(245, 240, 230, 0.15);
  }
}

.button-icon {
  width: 1.25rem;
  height: 1.25rem;
  margin-left: 0.5rem;
  transition: transform 0.2s ease;
}

.submit-button:hover .button-icon {
  transform: translateX(4px);
}

/* Post-it message style */
.postit-message {
  max-width: 24rem;
  margin: 2rem auto;
  padding: 1.5rem;
  background-color: #fff9c4;
  box-shadow: 4px 4px 8px rgba(44, 36, 22, 0.3);
  transform: rotate(1deg);
  position: relative;
}

.postit-message::before {
  content: '';
  position: absolute;
  top: -8px;
  left: 50%;
  transform: translateX(-50%) rotate(-3deg);
  width: 60px;
  height: 20px;
  background-color: rgba(255, 235, 205, 0.8);
  border-left: 1px dashed rgba(44, 36, 22, 0.2);
  border-right: 1px dashed rgba(44, 36, 22, 0.2);
}

@media (prefers-color-scheme: dark) {
  .postit-message {
    background-color: #5c5419;
    color: var(--ink-light);
    box-shadow: 4px 4px 8px rgba(0, 0, 0, 0.4);
  }

  .postit-message::before {
    background-color: rgba(139, 119, 101, 0.6);
    border-left-color: rgba(245, 240, 230, 0.2);
    border-right-color: rgba(245, 240, 230, 0.2);
  }
}

.postit-title {
  font-family: 'Caveat', cursive;
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--ink-dark);
}

@media (prefers-color-scheme: dark) {
  .postit-title {
    color: var(--ink-light);
  }
}

.postit-body {
  font-family: 'Kalam', cursive;
  font-size: 1rem;
  color: var(--ink-dark);
  line-height: 1.5;
}

@media (prefers-color-scheme: dark) {
  .postit-body {
    color: var(--ink-light);
  }
}

.sketchy-button-outline {
  font-family: 'Patrick Hand', cursive;
  font-size: 1rem;
  padding: 0.5rem 1rem;
  background-color: transparent;
  color: var(--ink-blue);
  border: 2px solid var(--ink-blue);
  border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
  box-shadow: 2px 2px 0 rgba(44, 36, 22, 0.15);
  cursor: pointer;
  transition: all 0.2s ease;
}

.sketchy-button-outline:hover {
  background-color: var(--ink-blue);
  color: var(--ink-light);
  transform: translateY(-1px) rotate(-1deg);
}

@media (prefers-color-scheme: dark) {
  .sketchy-button-outline {
    color: var(--ink-blue-dark);
    border-color: var(--ink-blue-dark);
  }

  .sketchy-button-outline:hover {
    background-color: var(--ink-blue-dark);
    color: var(--paper-dark);
  }
}
</style>
