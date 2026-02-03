<script setup lang="ts">
import { z } from 'zod'

definePageMeta({
  middleware: ['authenticated', 'admin'],
})

interface Tag {
  name: string
  state: boolean
}

const email = ref('')
const tags = ref<Tag[]>([])
const sendMail = ref(true)

const step = ref(1)
const isLoadingTags = ref(false)
const isSubmitting = ref(false)
const submitResult = ref<'success-with-email' | 'success-without-email' | 'error' | null>(null)
const submitError = ref<string | null>(null)
const isEmailShaking = ref(false)

const emailSchema = z.string().email()

const isValidEmail = computed(() => {
  try {
    emailSchema.parse(email.value)
    return true
  } catch {
    return false
  }
})

async function getUserTags(email: string): Promise<Tag[]> {
  try {
    return $fetch<Tag[]>('/api/admin/getUserTags', {
      method: 'POST',
      body: {
        email,
      },
    })
  } catch (error) {
    console.log(error)
    return []
  }
}

const confirmEmail = async () => {
  if (!isValidEmail.value) return

  isLoadingTags.value = true
  tags.value = await getUserTags(email.value)
  isLoadingTags.value = false

  step.value = 2
}

const handleEmailEnter = async () => {
  if (isValidEmail.value) {
    await confirmEmail()
  } else {
    isEmailShaking.value = true
    setTimeout(() => {
      isEmailShaking.value = false
    }, 500)
  }
}

const confirmTags = () => {
  step.value = 3
}

const goToStep = (targetStep: number) => {
  if (targetStep === 1) {
    step.value = 1
  } else if (targetStep === 2 && isValidEmail.value) {
    step.value = 2
  } else if (targetStep === 3 && isValidEmail.value) {
    step.value = 3
  }

  submitResult.value = null
  submitError.value = null
}

const submitForm = async () => {
  isSubmitting.value = true
  submitResult.value = null
  submitError.value = null

  try {
    const result = await $fetch<boolean>('/api/admin/updateUserTags', {
      method: 'POST',
      body: {
        email: email.value,
        tags: tags.value,
        sendMail: sendMail.value,
      },
    })

    if (result === true) {
      submitResult.value = 'success-with-email'
    } else if (result === false) {
      submitResult.value = 'success-without-email'
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    submitResult.value = 'error'
    submitError.value = error?.message || $t('pages.admin.members.add.result.error-unknown')
  } finally {
    isSubmitting.value = false
  }
}

const resetForm = () => {
  email.value = ''
  tags.value = []
  sendMail.value = true
  step.value = 1
  submitResult.value = null
  submitError.value = null
}
</script>

<template>
  <div class="space-y-6">
    <h1 class="page-title hidden md:block">
      {{ $t('pages.admin.members.add.title') }}
    </h1>

    <!-- Step 1: Email Input -->
    <div class="step-card">
      <div class="step-header">
        <div class="step-number-container">
          <span class="step-number">1</span>
        </div>
        <h2 class="step-title">
          {{ $t('pages.admin.members.add.step1.title') }}
        </h2>
        <button
          v-if="step > 1"
          type="button"
          class="edit-button"
          @click="goToStep(1)"
        >
          {{ $t('pages.admin.members.add.step1.button-edit') }}
        </button>
      </div>

      <div class="step-content">
        <div>
          <label for="email" class="input-label">
            {{ $t('pages.admin.members.add.step1.email-label') }}
          </label>
          <input
            id="email"
            v-model="email"
            type="email"
            class="sketchy-input-field"
            :class="{ 'shake-animation': isEmailShaking }"
            :placeholder="$t('pages.admin.members.add.step1.email-placeholder')"
            :disabled="step !== 1"
            required
            @keyup.enter="handleEmailEnter"
          />
        </div>

        <button
          v-if="step === 1"
          type="button"
          :disabled="!isValidEmail"
          class="primary-button"
          @click="confirmEmail"
        >
          {{ $t('pages.admin.members.add.step1.button-next') }}
          <svg class="button-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 12h14M12 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>

        <Transition enter-active-class="animate-pop">
          <div v-if="step > 1" class="success-indicator">
            <svg class="check-icon" viewBox="0 0 20 20" fill="currentColor">
              <path
                fill-rule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clip-rule="evenodd"
              />
            </svg>
            <span>{{ $t('pages.admin.members.add.step1.valid-email') }}</span>
          </div>
        </Transition>
      </div>
    </div>

    <!-- Step 2: Tags Selection -->
    <Transition enter-active-class="animate-fade-slide-up">
      <div v-if="step >= 2" class="step-card">
        <div class="step-header">
          <div class="step-number-container">
            <span class="step-number">2</span>
          </div>
          <h2 class="step-title">
            {{ $t('pages.admin.members.add.step2.title') }}
          </h2>
          <button
            v-if="step > 2"
            type="button"
            class="edit-button"
            @click="goToStep(2)"
          >
            {{ $t('pages.admin.members.add.step1.button-edit') }}
          </button>
        </div>

        <div class="step-content">
          <div v-if="isLoadingTags" class="loading-spinner">
            <svg class="spinner-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>

          <div v-else class="space-y-4">
            <div class="tags-list stagger-children">
              <div v-for="(tag, index) in tags" :key="index" class="tag-item">
                <label class="checkbox-container">
                  <input
                    :id="`tag-${index}`"
                    v-model="tag.state"
                    type="checkbox"
                    class="checkbox-input"
                    :disabled="step !== 2"
                  />
                  <span class="checkbox-custom" :class="{ 'checked': tag.state }">
                    <svg v-if="tag.state" class="check-mark" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M2 6l3 3 5-6" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </span>
                  <span class="checkbox-label" :class="{ 'opacity-50': step !== 2 }">
                    {{ tag.name }}
                  </span>
                </label>
              </div>
            </div>

            <button
              v-if="step === 2"
              type="button"
              class="primary-button"
              @click="confirmTags"
            >
              {{ $t('pages.admin.members.add.step2.button-next') }}
              <svg class="button-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5 12h14M12 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>

            <Transition enter-active-class="animate-pop">
              <div v-if="step > 2" class="success-indicator">
                <svg class="check-icon" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fill-rule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clip-rule="evenodd"
                  />
                </svg>
                <span>{{ $t('pages.admin.members.add.step2.permissions-selected') }}</span>
              </div>
            </Transition>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Step 3: Welcome Email -->
    <Transition enter-active-class="animate-fade-slide-up">
      <div v-if="step >= 3" class="step-card">
        <div class="step-header">
          <div class="step-number-container">
            <span class="step-number">3</span>
          </div>
          <h2 class="step-title">
            {{ $t('pages.admin.members.add.step3.title') }}
          </h2>
        </div>

        <div class="step-content">
          <div class="mb-4">
            <label class="checkbox-container">
              <input
                id="welcome-email"
                v-model="sendMail"
                type="checkbox"
                class="checkbox-input"
              />
              <span class="checkbox-custom" :class="{ 'checked': sendMail }">
                <svg v-if="sendMail" class="check-mark" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M2 6l3 3 5-6" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </span>
              <span class="checkbox-label">
                {{ $t('pages.admin.members.add.step3.send-welcome-email') }}
              </span>
            </label>
          </div>

          <button
            v-if="!submitResult"
            type="button"
            :disabled="isSubmitting"
            class="submit-button"
            @click="submitForm"
          >
            <span v-if="isSubmitting" class="flex items-center">
              <svg class="spinner-small" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" opacity="0.25"/>
                <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/>
              </svg>
              {{ $t('pages.admin.members.add.step3.processing') }}
            </span>
            <span v-else class="flex items-center">
              {{ $t('pages.admin.members.add.step3.button-submit') }}
              <svg class="button-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
          </button>
        </div>
      </div>
    </Transition>

    <!-- Result Display -->
    <Transition enter-active-class="animate-pop">
      <div v-if="submitResult" class="result-card">
        <h2 class="result-title">
          {{ $t('pages.admin.members.add.result.title') }}
        </h2>

        <!-- Success with Email -->
        <div v-if="submitResult === 'success-with-email'" class="result-message result-success">
          <svg class="result-icon" viewBox="0 0 20 20" fill="currentColor">
            <path
              fill-rule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clip-rule="evenodd"
            />
          </svg>
          <div>
            <h3 class="result-message-title">
              {{ $t('pages.admin.members.add.result.success-title') }}
            </h3>
            <p class="result-message-text">
              {{ $t('pages.admin.members.add.result.success-with-email') }}
            </p>
          </div>
        </div>

        <!-- Success without Email -->
        <div v-if="submitResult === 'success-without-email'" class="result-message result-info">
          <svg class="result-icon" viewBox="0 0 20 20" fill="currentColor">
            <path
              fill-rule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              clip-rule="evenodd"
            />
          </svg>
          <div>
            <h3 class="result-message-title">
              {{ $t('pages.admin.members.add.result.success-title') }}
            </h3>
            <p class="result-message-text">
              {{ $t('pages.admin.members.add.result.success-without-email') }}
            </p>
          </div>
        </div>

        <!-- Error -->
        <div v-if="submitResult === 'error'" class="result-message result-error">
          <svg class="result-icon" viewBox="0 0 20 20" fill="currentColor">
            <path
              fill-rule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clip-rule="evenodd"
            />
          </svg>
          <div>
            <h3 class="result-message-title">
              {{ $t('pages.admin.members.add.result.error-title') }}
            </h3>
            <p class="result-message-text">
              {{ submitError }}
            </p>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="result-actions">
          <button
            type="button"
            class="primary-button"
            @click="resetForm"
          >
            {{ $t('pages.admin.members.add.result.button-new') }}
          </button>

          <button
            v-if="submitResult === 'error'"
            type="button"
            class="error-button"
            @click="submitForm"
          >
            {{ $t('pages.admin.members.add.result.button-retry') }}
          </button>

          <button
            v-if="submitResult === 'success-with-email' || submitResult === 'success-without-email'"
            type="button"
            class="link-button"
            @click="submitForm"
          >
            {{ $t('pages.admin.members.add.result.button-retry') }}
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.page-title {
  font-family: 'Caveat', cursive;
  font-size: 2.25rem;
  font-weight: 600;
  color: var(--ink-dark);
  margin-bottom: 1rem;
}

@media (prefers-color-scheme: dark) {
  .page-title {
    color: var(--ink-light);
  }
}

/* Step Card */
.step-card {
  background-color: var(--paper-light);
  border: 2px solid var(--ink-dark);
  border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
  box-shadow: 4px 4px 0 rgba(44, 36, 22, 0.15);
  padding: 1.5rem;
  transition: all 0.2s ease;
}

.step-card:hover {
  box-shadow: 5px 5px 0 rgba(44, 36, 22, 0.2);
}

@media (prefers-color-scheme: dark) {
  .step-card {
    background-color: var(--paper-dark);
    border-color: var(--ink-light);
    box-shadow: 4px 4px 0 rgba(245, 240, 230, 0.08);
  }

  .step-card:hover {
    box-shadow: 5px 5px 0 rgba(245, 240, 230, 0.12);
  }
}

.step-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.step-number-container {
  flex-shrink: 0;
}

.step-number {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  font-family: 'Caveat', cursive;
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--ink-light);
  background-color: var(--ink-blue);
  border-radius: 50%;
}

@media (prefers-color-scheme: dark) {
  .step-number {
    background-color: var(--ink-blue-dark);
    color: var(--paper-dark);
  }
}

.step-title {
  flex: 1;
  font-family: 'Caveat', cursive;
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--ink-dark);
}

@media (prefers-color-scheme: dark) {
  .step-title {
    color: var(--ink-light);
  }
}

.step-content {
  padding-left: 2.75rem;
}

/* Input Styles */
.input-label {
  display: block;
  margin-bottom: 0.5rem;
  font-family: 'Patrick Hand', cursive;
  font-size: 1.1rem;
  color: var(--ink-dark);
}

@media (prefers-color-scheme: dark) {
  .input-label {
    color: var(--ink-light);
  }
}

.sketchy-input-field {
  width: 100%;
  padding: 0.75rem 1rem;
  margin-bottom: 1rem;
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

.sketchy-input-field:focus {
  border-bottom-color: var(--ink-blue);
  background-color: rgba(74, 111, 165, 0.05);
}

.sketchy-input-field:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.sketchy-input-field::placeholder {
  color: rgba(44, 36, 22, 0.4);
  font-style: italic;
}

@media (prefers-color-scheme: dark) {
  .sketchy-input-field {
    color: var(--ink-light);
    border-bottom-color: var(--ink-light);
  }

  .sketchy-input-field:focus {
    border-bottom-color: var(--ink-blue-dark);
    background-color: rgba(106, 143, 197, 0.1);
  }

  .sketchy-input-field::placeholder {
    color: rgba(245, 240, 230, 0.4);
  }
}

/* Shake Animation */
.shake-animation {
  animation: shake 0.5s ease-in-out;
  border-bottom-color: var(--ink-red) !important;
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
  20%, 40%, 60%, 80% { transform: translateX(5px); }
}

/* Buttons */
.primary-button {
  display: inline-flex;
  align-items: center;
  padding: 0.6rem 1.25rem;
  font-family: 'Patrick Hand', cursive;
  font-size: 1.1rem;
  color: var(--ink-light);
  background-color: var(--ink-blue);
  border: 2px solid var(--ink-dark);
  border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
  box-shadow: 3px 3px 0 rgba(44, 36, 22, 0.15);
  cursor: pointer;
  transition: all 0.2s ease;
}

.primary-button:hover:not(:disabled) {
  transform: translateY(-2px) rotate(-1deg);
  box-shadow: 4px 4px 0 rgba(44, 36, 22, 0.2);
}

.primary-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (prefers-color-scheme: dark) {
  .primary-button {
    background-color: var(--ink-blue-dark);
    border-color: var(--ink-light);
    box-shadow: 3px 3px 0 rgba(245, 240, 230, 0.08);
  }

  .primary-button:hover:not(:disabled) {
    box-shadow: 4px 4px 0 rgba(245, 240, 230, 0.12);
  }
}

.submit-button {
  display: inline-flex;
  align-items: center;
  padding: 0.6rem 1.25rem;
  font-family: 'Patrick Hand', cursive;
  font-size: 1.1rem;
  color: var(--ink-light);
  background-color: var(--ink-green);
  border: 2px solid var(--ink-dark);
  border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
  box-shadow: 3px 3px 0 rgba(44, 36, 22, 0.15);
  cursor: pointer;
  transition: all 0.2s ease;
}

.submit-button:hover:not(:disabled) {
  transform: translateY(-2px) rotate(-1deg);
  box-shadow: 4px 4px 0 rgba(44, 36, 22, 0.2);
}

.submit-button:disabled {
  opacity: 0.7;
  cursor: wait;
}

@media (prefers-color-scheme: dark) {
  .submit-button {
    background-color: var(--ink-green-dark);
    border-color: var(--ink-light);
  }
}

.error-button {
  display: inline-flex;
  align-items: center;
  padding: 0.6rem 1.25rem;
  font-family: 'Patrick Hand', cursive;
  font-size: 1.1rem;
  color: var(--ink-light);
  background-color: var(--ink-red);
  border: 2px solid var(--ink-dark);
  border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
  box-shadow: 3px 3px 0 rgba(44, 36, 22, 0.15);
  cursor: pointer;
  transition: all 0.2s ease;
}

.error-button:hover {
  transform: translateY(-2px) rotate(-1deg);
}

@media (prefers-color-scheme: dark) {
  .error-button {
    background-color: var(--ink-red-dark);
    border-color: var(--ink-light);
  }
}

.edit-button {
  font-family: 'Patrick Hand', cursive;
  font-size: 1rem;
  color: var(--ink-blue);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
  text-decoration: underline;
  text-decoration-style: wavy;
  text-underline-offset: 3px;
}

.edit-button:hover {
  color: var(--ink-dark);
}

@media (prefers-color-scheme: dark) {
  .edit-button {
    color: var(--ink-blue-dark);
  }

  .edit-button:hover {
    color: var(--ink-light);
  }
}

.link-button {
  font-family: 'Patrick Hand', cursive;
  font-size: 1rem;
  color: var(--ink-blue);
  background: transparent;
  border: none;
  cursor: pointer;
  text-decoration: underline;
}

.link-button:hover {
  color: var(--ink-dark);
}

@media (prefers-color-scheme: dark) {
  .link-button {
    color: var(--ink-blue-dark);
  }

  .link-button:hover {
    color: var(--ink-light);
  }
}

.button-arrow,
.button-check {
  width: 1.25rem;
  height: 1.25rem;
  margin-left: 0.5rem;
  transition: transform 0.2s ease;
}

.primary-button:hover:not(:disabled) .button-arrow {
  transform: translateX(3px);
}

.submit-button:hover:not(:disabled) .button-check {
  transform: scale(1.1);
}

/* Checkbox Styles */
.checkbox-container {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.checkbox-input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.checkbox-custom {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  border: 2px solid var(--ink-dark);
  border-radius: 4px;
  background-color: var(--paper-light);
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.checkbox-custom.checked {
  background-color: var(--ink-blue);
  border-color: var(--ink-blue);
}

.check-mark {
  width: 0.75rem;
  height: 0.75rem;
  color: var(--ink-light);
  stroke-dasharray: 20;
  stroke-dashoffset: 20;
  animation: draw-check 0.3s ease-out forwards;
}

@keyframes draw-check {
  to {
    stroke-dashoffset: 0;
  }
}

@media (prefers-color-scheme: dark) {
  .checkbox-custom {
    background-color: var(--paper-dark);
    border-color: var(--ink-light);
  }

  .checkbox-custom.checked {
    background-color: var(--ink-blue-dark);
    border-color: var(--ink-blue-dark);
  }
}

.checkbox-label {
  margin-left: 0.75rem;
  font-family: 'Patrick Hand', cursive;
  font-size: 1.1rem;
  color: var(--ink-dark);
}

@media (prefers-color-scheme: dark) {
  .checkbox-label {
    color: var(--ink-light);
  }
}

/* Tags List */
.tags-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.tag-item {
  padding: 0.5rem 0;
}

/* Success Indicator */
.success-indicator {
  display: flex;
  align-items: center;
  margin-top: 0.75rem;
  color: var(--ink-green);
  font-family: 'Patrick Hand', cursive;
  font-size: 1rem;
}

@media (prefers-color-scheme: dark) {
  .success-indicator {
    color: var(--ink-green-dark);
  }
}

.check-icon {
  width: 1.25rem;
  height: 1.25rem;
  margin-right: 0.5rem;
}

/* Loading Spinner */
.loading-spinner {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

.spinner-icon {
  width: 2rem;
  height: 2rem;
  color: var(--ink-blue);
  animation: pencil-spin 1.2s ease-in-out infinite;
}

@keyframes pencil-spin {
  0%, 100% { transform: rotate(-45deg) translateX(0); }
  50% { transform: rotate(-45deg) translateX(5px); }
}

@media (prefers-color-scheme: dark) {
  .spinner-icon {
    color: var(--ink-blue-dark);
  }
}

.spinner-small {
  width: 1.25rem;
  height: 1.25rem;
  margin-right: 0.5rem;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Result Card */
.result-card {
  background-color: var(--paper-light);
  border: 2px solid var(--ink-dark);
  border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
  box-shadow: 4px 4px 0 rgba(44, 36, 22, 0.15);
  padding: 1.5rem;
}

@media (prefers-color-scheme: dark) {
  .result-card {
    background-color: var(--paper-dark);
    border-color: var(--ink-light);
    box-shadow: 4px 4px 0 rgba(245, 240, 230, 0.08);
  }
}

.result-title {
  font-family: 'Caveat', cursive;
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--ink-dark);
  margin-bottom: 1rem;
}

@media (prefers-color-scheme: dark) {
  .result-title {
    color: var(--ink-light);
  }
}

.result-message {
  display: flex;
  align-items: flex-start;
  padding: 1rem;
  border-radius: 8px;
  margin-bottom: 1rem;
}

.result-success {
  background-color: rgba(74, 122, 90, 0.15);
  border: 1px solid var(--ink-green);
}

.result-info {
  background-color: rgba(74, 111, 165, 0.15);
  border: 1px solid var(--ink-blue);
}

.result-error {
  background-color: rgba(165, 74, 74, 0.15);
  border: 1px solid var(--ink-red);
}

@media (prefers-color-scheme: dark) {
  .result-success {
    background-color: rgba(106, 154, 122, 0.15);
    border-color: var(--ink-green-dark);
  }

  .result-info {
    background-color: rgba(106, 143, 197, 0.15);
    border-color: var(--ink-blue-dark);
  }

  .result-error {
    background-color: rgba(197, 106, 106, 0.15);
    border-color: var(--ink-red-dark);
  }
}

.result-icon {
  width: 1.5rem;
  height: 1.5rem;
  margin-right: 0.75rem;
  flex-shrink: 0;
}

.result-success .result-icon {
  color: var(--ink-green);
}

.result-info .result-icon {
  color: var(--ink-blue);
}

.result-error .result-icon {
  color: var(--ink-red);
}

@media (prefers-color-scheme: dark) {
  .result-success .result-icon {
    color: var(--ink-green-dark);
  }

  .result-info .result-icon {
    color: var(--ink-blue-dark);
  }

  .result-error .result-icon {
    color: var(--ink-red-dark);
  }
}

.result-message-title {
  font-family: 'Caveat', cursive;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--ink-dark);
  margin-bottom: 0.25rem;
}

.result-message-text {
  font-family: 'Patrick Hand', cursive;
  font-size: 1rem;
  color: var(--ink-dark);
  opacity: 0.9;
}

@media (prefers-color-scheme: dark) {
  .result-message-title,
  .result-message-text {
    color: var(--ink-light);
  }
}

.result-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}
</style>
