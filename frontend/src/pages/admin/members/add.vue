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

  // Reset result when going back to edit
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
  <div class="wc-members-add">
    <h1 class="wc-page-title">
      {{ $t('pages.admin.members.add.title') }}
    </h1>

    <!-- Step 1: Email Input -->
    <div class="wc-step-card">
      <div class="wc-step-header">
        <h2 class="wc-step-title">
          {{ $t('pages.admin.members.add.step1.title') }}
        </h2>
        <button
          v-if="step > 1"
          type="button"
          class="wc-edit-link"
          @click="goToStep(1)"
        >
          {{ $t('pages.admin.members.add.step1.button-edit') }}
        </button>
      </div>

      <div class="wc-step-content">
        <div class="wc-form-group">
          <label for="email" class="wc-label">
            {{ $t('pages.admin.members.add.step1.email-label') }}
          </label>
          <input
            id="email"
            v-model="email"
            type="email"
            class="wc-input"
            :class="{ 'wc-input-shake wc-input-error': isEmailShaking }"
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
          class="wc-button wc-button-sky"
          @click="confirmEmail"
        >
          {{ $t('pages.admin.members.add.step1.button-next') }}
        </button>

        <div v-if="step > 1" class="wc-success-indicator">
          <svg class="wc-success-icon" fill="currentColor" viewBox="0 0 20 20">
            <path
              fill-rule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clip-rule="evenodd"
            />
          </svg>
          <span class="wc-success-text">{{
            $t('pages.admin.members.add.step1.valid-email')
          }}</span>
        </div>
      </div>
    </div>

    <!-- Step 2: Tags Selection -->
    <div
      v-if="step >= 2"
      class="wc-step-card"
    >
      <div class="wc-step-header">
        <h2 class="wc-step-title">
          {{ $t('pages.admin.members.add.step2.title') }}
        </h2>
        <button
          v-if="step > 2"
          type="button"
          class="wc-edit-link"
          @click="goToStep(2)"
        >
          {{ $t('pages.admin.members.add.step1.button-edit') }}
        </button>
      </div>

      <div v-if="isLoadingTags" class="wc-loading">
        <div class="wc-spinner"></div>
      </div>

      <div v-else class="wc-step-content">
        <div class="wc-tags-list">
          <div v-for="(tag, index) in tags" :key="index" class="wc-checkbox-group">
            <input
              :id="`tag-${index}`"
              v-model="tag.state"
              type="checkbox"
              class="wc-checkbox"
              :disabled="step !== 2"
            />
            <label
              :for="`tag-${index}`"
              class="wc-checkbox-label"
              :class="{ 'wc-checkbox-label-disabled': step !== 2 }"
            >
              {{ tag.name }}
            </label>
          </div>
        </div>

        <button
          v-if="step === 2"
          type="button"
          class="wc-button wc-button-sky"
          @click="confirmTags"
        >
          {{ $t('pages.admin.members.add.step2.button-next') }}
        </button>

        <div v-if="step > 2" class="wc-success-indicator">
          <svg class="wc-success-icon" fill="currentColor" viewBox="0 0 20 20">
            <path
              fill-rule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clip-rule="evenodd"
            />
          </svg>
          <span class="wc-success-text">{{
            $t('pages.admin.members.add.step2.permissions-selected')
          }}</span>
        </div>
      </div>
    </div>

    <!-- Step 3: Welcome Email -->
    <div
      v-if="step >= 3"
      class="wc-step-card"
    >
      <h2 class="wc-step-title wc-step-title-standalone">
        {{ $t('pages.admin.members.add.step3.title') }}
      </h2>

      <div class="wc-step-content">
        <div class="wc-checkbox-group">
          <input
            id="welcome-email"
            v-model="sendMail"
            type="checkbox"
            class="wc-checkbox"
          />
          <label
            for="welcome-email"
            class="wc-checkbox-label"
          >
            {{ $t('pages.admin.members.add.step3.send-welcome-email') }}
          </label>
        </div>

        <button
          v-if="!submitResult"
          type="button"
          :disabled="isSubmitting"
          class="wc-button wc-button-mint"
          @click="submitForm"
        >
          <span v-if="isSubmitting" class="wc-button-loading">
            <svg
              class="wc-button-spinner"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                class="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                stroke-width="4"
              ></circle>
              <path
                class="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            {{ $t('pages.admin.members.add.step3.processing') }}
          </span>
          <span v-else>{{ $t('pages.admin.members.add.step3.button-submit') }}</span>
        </button>
      </div>
    </div>

    <!-- Result Display -->
    <div
      v-if="submitResult"
      class="wc-step-card"
    >
      <h2 class="wc-step-title wc-step-title-standalone">
        {{ $t('pages.admin.members.add.result.title') }}
      </h2>

      <!-- Success with Email -->
      <div v-if="submitResult === 'success-with-email'" class="wc-result-content">
        <div class="wc-success">
          <svg
            class="wc-result-icon wc-result-icon-success"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fill-rule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clip-rule="evenodd"
            />
          </svg>
          <div>
            <h3 class="wc-result-title wc-result-title-success">
              {{ $t('pages.admin.members.add.result.success-title') }}
            </h3>
            <p class="wc-result-text wc-result-text-success">
              {{ $t('pages.admin.members.add.result.success-with-email') }}
            </p>
          </div>
        </div>
      </div>

      <!-- Success without Email -->
      <div v-if="submitResult === 'success-without-email'" class="wc-result-content">
        <div class="wc-info">
          <svg
            class="wc-result-icon wc-result-icon-info"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fill-rule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              clip-rule="evenodd"
            />
          </svg>
          <div>
            <h3 class="wc-result-title wc-result-title-info">
              {{ $t('pages.admin.members.add.result.success-title') }}
            </h3>
            <p class="wc-result-text wc-result-text-info">
              {{ $t('pages.admin.members.add.result.success-without-email') }}
            </p>
          </div>
        </div>
      </div>

      <!-- Error -->
      <div v-if="submitResult === 'error'" class="wc-result-content">
        <div class="wc-error">
          <svg
            class="wc-result-icon wc-result-icon-error"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fill-rule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clip-rule="evenodd"
            />
          </svg>
          <div>
            <h3 class="wc-result-title wc-result-title-error">
              {{ $t('pages.admin.members.add.result.error-title') }}
            </h3>
            <p class="wc-result-text wc-result-text-error">
              {{ submitError }}
            </p>
          </div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="wc-result-actions">
        <button
          type="button"
          class="wc-button wc-button-sky"
          @click="resetForm"
        >
          {{ $t('pages.admin.members.add.result.button-new') }}
        </button>

        <!-- Retry as button for error case -->
        <button
          v-if="submitResult === 'error'"
          type="button"
          class="wc-button wc-button-error"
          @click="submitForm"
        >
          {{ $t('pages.admin.members.add.result.button-retry') }}
        </button>

        <!-- Retry as link for success cases -->
        <button
          v-if="submitResult === 'success-with-email' || submitResult === 'success-without-email'"
          type="button"
          class="wc-link-button"
          @click="submitForm"
        >
          {{ $t('pages.admin.members.add.result.button-retry') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wc-members-add {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.wc-page-title {
  display: none;
  font-family: 'Cormorant Garamond', serif;
  font-size: 1.75rem;
  font-weight: 600;
  color: var(--wc-charcoal);
}

@media (min-width: 768px) {
  .wc-page-title {
    display: block;
  }
}

.wc-step-card {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(10px);
  border-radius: 20px;
  border: 1px solid rgba(248, 187, 217, 0.3);
  box-shadow:
    0 4px 20px -5px rgba(248, 187, 217, 0.2),
    0 2px 10px -3px rgba(0, 0, 0, 0.05);
  padding: 1.5rem;
  transition: all 0.4s ease;
}

@media (prefers-color-scheme: dark) {
  .wc-step-card {
    background: rgba(45, 45, 74, 0.8);
    border-color: rgba(244, 143, 177, 0.2);
    box-shadow:
      0 4px 20px -5px rgba(244, 143, 177, 0.15),
      0 2px 10px -3px rgba(0, 0, 0, 0.2);
  }
}

.wc-step-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.wc-step-title {
  font-family: 'Cormorant Garamond', serif;
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--wc-charcoal);
}

.wc-step-title-standalone {
  margin-bottom: 1rem;
}

.wc-edit-link {
  font-family: 'Quicksand', sans-serif;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--wc-sky-dark);
  background: none;
  border: none;
  cursor: pointer;
  transition: color 0.3s ease;
}

.wc-edit-link:hover {
  color: var(--wc-sky-medium);
}

@media (prefers-color-scheme: dark) {
  .wc-edit-link {
    color: var(--wc-sky-medium);
  }

  .wc-edit-link:hover {
    color: var(--wc-sky);
  }
}

.wc-step-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.wc-form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.wc-label {
  font-family: 'Quicksand', sans-serif;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--wc-charcoal);
}

.wc-input {
  font-family: 'Quicksand', sans-serif;
  font-size: 1rem;
  padding: 0.875rem 1.25rem;
  background: rgba(255, 255, 255, 0.6);
  border: 2px solid transparent;
  border-radius: 15px;
  color: var(--wc-charcoal);
  transition: all 0.3s ease;
  outline: none;
  width: 100%;
}

.wc-input::placeholder {
  color: var(--wc-charcoal-light);
  opacity: 0.7;
}

.wc-input:focus {
  background: rgba(255, 255, 255, 0.9);
  border-color: var(--wc-rose);
  box-shadow: 0 0 0 4px rgba(248, 187, 217, 0.2);
}

.wc-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.wc-input-error {
  border-color: #ef9a9a;
}

@media (prefers-color-scheme: dark) {
  .wc-input {
    background: rgba(45, 45, 74, 0.6);
    color: var(--wc-charcoal);
  }

  .wc-input:focus {
    background: rgba(45, 45, 74, 0.9);
    border-color: var(--wc-rose-medium);
    box-shadow: 0 0 0 4px rgba(244, 143, 177, 0.15);
  }
}

@keyframes shake {
  0%,
  100% {
    transform: translateX(0);
  }
  25% {
    transform: translateX(-10px);
  }
  75% {
    transform: translateX(10px);
  }
}

.wc-input-shake {
  animation: shake 0.5s ease-in-out;
}

.wc-button {
  font-family: 'Quicksand', sans-serif;
  font-weight: 600;
  padding: 0.75rem 1.75rem;
  background: linear-gradient(135deg, var(--wc-rose) 0%, var(--wc-rose-medium) 100%);
  color: white;
  border: none;
  border-radius: 50px;
  box-shadow: 0 4px 15px -3px rgba(248, 187, 217, 0.5);
  cursor: pointer;
  transition: all 0.3s ease;
  align-self: flex-start;
}

.wc-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px -3px rgba(248, 187, 217, 0.6);
}

.wc-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.wc-button-sky {
  background: linear-gradient(135deg, var(--wc-sky) 0%, var(--wc-sky-medium) 100%);
  box-shadow: 0 4px 15px -3px rgba(144, 202, 249, 0.5);
  color: var(--wc-charcoal);
}

.wc-button-sky:hover {
  box-shadow: 0 6px 20px -3px rgba(144, 202, 249, 0.6);
}

.wc-button-mint {
  background: linear-gradient(135deg, var(--wc-mint) 0%, var(--wc-mint-medium) 100%);
  box-shadow: 0 4px 15px -3px rgba(165, 214, 167, 0.5);
  color: var(--wc-charcoal);
}

.wc-button-mint:hover {
  box-shadow: 0 6px 20px -3px rgba(165, 214, 167, 0.6);
}

.wc-button-error {
  background: linear-gradient(135deg, #ef9a9a 0%, #e57373 100%);
  box-shadow: 0 4px 15px -3px rgba(239, 154, 154, 0.5);
}

.wc-button-error:hover {
  box-shadow: 0 6px 20px -3px rgba(239, 154, 154, 0.6);
}

.wc-button-loading {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.wc-button-spinner {
  width: 1.25rem;
  height: 1.25rem;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.wc-success-indicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--wc-mint-dark);
}

.wc-success-icon {
  width: 1.25rem;
  height: 1.25rem;
}

.wc-success-text {
  font-family: 'Quicksand', sans-serif;
  font-size: 0.875rem;
  font-weight: 600;
}

@media (prefers-color-scheme: dark) {
  .wc-success-indicator {
    color: var(--wc-mint-medium);
  }
}

.wc-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

.wc-spinner {
  width: 2rem;
  height: 2rem;
  border: 3px solid rgba(248, 187, 217, 0.3);
  border-top-color: var(--wc-rose-medium);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.wc-tags-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.wc-checkbox-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.wc-checkbox {
  appearance: none;
  width: 1.25rem;
  height: 1.25rem;
  border: 2px solid var(--wc-rose);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  transition: all 0.3s ease;
  position: relative;
  flex-shrink: 0;
}

.wc-checkbox:checked {
  background: linear-gradient(135deg, var(--wc-rose) 0%, var(--wc-rose-medium) 100%);
  border-color: var(--wc-rose-medium);
}

.wc-checkbox:checked::after {
  content: '';
  position: absolute;
  left: 5px;
  top: 2px;
  width: 5px;
  height: 9px;
  border: solid white;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.wc-checkbox:focus {
  box-shadow: 0 0 0 4px rgba(248, 187, 217, 0.2);
}

.wc-checkbox:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (prefers-color-scheme: dark) {
  .wc-checkbox {
    background: rgba(45, 45, 74, 0.6);
    border-color: var(--wc-rose-medium);
  }
}

.wc-checkbox-label {
  font-family: 'Quicksand', sans-serif;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--wc-charcoal);
  cursor: pointer;
}

.wc-checkbox-label-disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.wc-result-content {
  margin-bottom: 1rem;
}

.wc-success,
.wc-error,
.wc-info {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 1rem;
  border-radius: 15px;
}

.wc-success {
  background: linear-gradient(135deg, var(--wc-mint-light) 0%, rgba(200, 230, 201, 0.5) 100%);
  border: 1px solid var(--wc-mint-medium);
}

.wc-error {
  background: linear-gradient(135deg, #ffebee 0%, rgba(255, 205, 210, 0.5) 100%);
  border: 1px solid #ef9a9a;
}

.wc-info {
  background: linear-gradient(135deg, var(--wc-sky-light) 0%, rgba(187, 222, 251, 0.5) 100%);
  border: 1px solid var(--wc-sky-medium);
}

@media (prefers-color-scheme: dark) {
  .wc-success {
    background: linear-gradient(135deg, rgba(165, 214, 167, 0.15) 0%, rgba(165, 214, 167, 0.05) 100%);
    border-color: var(--wc-mint-medium);
  }

  .wc-error {
    background: linear-gradient(135deg, rgba(239, 154, 154, 0.15) 0%, rgba(239, 154, 154, 0.05) 100%);
    border-color: #ef9a9a;
  }

  .wc-info {
    background: linear-gradient(135deg, rgba(144, 202, 249, 0.15) 0%, rgba(144, 202, 249, 0.05) 100%);
    border-color: var(--wc-sky-medium);
  }
}

.wc-result-icon {
  width: 1.5rem;
  height: 1.5rem;
  flex-shrink: 0;
}

.wc-result-icon-success {
  color: var(--wc-mint-dark);
}

.wc-result-icon-error {
  color: #e57373;
}

.wc-result-icon-info {
  color: var(--wc-sky-dark);
}

@media (prefers-color-scheme: dark) {
  .wc-result-icon-success {
    color: var(--wc-mint-medium);
  }

  .wc-result-icon-error {
    color: #ef9a9a;
  }

  .wc-result-icon-info {
    color: var(--wc-sky-medium);
  }
}

.wc-result-title {
  font-family: 'Quicksand', sans-serif;
  font-size: 0.875rem;
  font-weight: 600;
  margin-bottom: 0.25rem;
}

.wc-result-title-success {
  color: var(--wc-mint-dark);
}

.wc-result-title-error {
  color: #c62828;
}

.wc-result-title-info {
  color: var(--wc-sky-dark);
}

@media (prefers-color-scheme: dark) {
  .wc-result-title-success {
    color: var(--wc-mint-medium);
  }

  .wc-result-title-error {
    color: #ef9a9a;
  }

  .wc-result-title-info {
    color: var(--wc-sky-medium);
  }
}

.wc-result-text {
  font-family: 'Quicksand', sans-serif;
  font-size: 0.875rem;
}

.wc-result-text-success {
  color: var(--wc-mint-dark);
}

.wc-result-text-error {
  color: #c62828;
}

.wc-result-text-info {
  color: var(--wc-sky-dark);
}

@media (prefers-color-scheme: dark) {
  .wc-result-text-success {
    color: var(--wc-mint);
  }

  .wc-result-text-error {
    color: #ffcdd2;
  }

  .wc-result-text-info {
    color: var(--wc-sky);
  }
}

.wc-result-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.wc-link-button {
  font-family: 'Quicksand', sans-serif;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--wc-sky-dark);
  background: none;
  border: none;
  cursor: pointer;
  text-decoration: underline;
  transition: color 0.3s ease;
}

.wc-link-button:hover {
  color: var(--wc-sky-medium);
}

@media (prefers-color-scheme: dark) {
  .wc-link-button {
    color: var(--wc-sky-medium);
  }

  .wc-link-button:hover {
    color: var(--wc-sky);
  }
}
</style>
