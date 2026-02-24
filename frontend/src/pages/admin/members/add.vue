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

  const emailSchema = z.email()

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
      return await $fetch<Tag[]>('/api/admin/getUserTags', {
        method: 'POST',
        body: {
          email,
        },
      })
    } catch (error) {
      console.error(error)
      return []
    }
  }

  const confirmEmail = async () => {
    isLoadingTags.value = true
    step.value = 2
    tags.value = await getUserTags(email.value)
    isLoadingTags.value = false
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
    step.value = targetStep
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

      submitResult.value = result ? 'success-with-email' : 'success-without-email'
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
    <h1 class="hidden md:block text-2xl font-semibold text-gray-900 dark:text-white">
      {{ $t('pages.admin.members.add.title') }}
    </h1>

    <!-- Step 1: Email Input -->
    <div
      class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700"
    >
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
          {{ $t('pages.admin.members.add.step1.title') }}
        </h2>
        <button
          v-if="step > 1"
          type="button"
          class="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium"
          @click="goToStep(1)"
        >
          {{ $t('pages.admin.members.add.step1.button-edit') }}
        </button>
      </div>

      <div class="space-y-4">
        <div>
          <label for="email" class="block mb-2 text-sm font-medium text-gray-900 dark:text-white">
            {{ $t('pages.admin.members.add.step1.email-label') }}
          </label>
          <input
            id="email"
            v-model="email"
            type="email"
            class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            :class="{ 'shake border-red-500 dark:border-red-500': isEmailShaking }"
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
          class="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
          @click="confirmEmail"
        >
          {{ $t('pages.admin.members.add.step1.button-next') }}
        </button>

        <div v-if="step > 1" class="flex items-center text-green-600 dark:text-green-400">
          <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
            <path
              fill-rule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clip-rule="evenodd"
            />
          </svg>
          <span class="text-sm font-medium">{{
            $t('pages.admin.members.add.step1.valid-email')
          }}</span>
        </div>
      </div>
    </div>

    <!-- Step 2: Tags Selection -->
    <div
      v-if="step >= 2"
      class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700"
    >
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
          {{ $t('pages.admin.members.add.step2.title') }}
        </h2>
        <button
          v-if="step > 2"
          type="button"
          class="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium"
          @click="goToStep(2)"
        >
          {{ $t('pages.admin.members.add.step1.button-edit') }}
        </button>
      </div>

      <div v-if="isLoadingTags" class="flex items-center justify-center py-8">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>

      <div v-else class="space-y-4">
        <div class="space-y-3">
          <div v-for="(tag, index) in tags" :key="index" class="flex items-center">
            <input
              :id="`tag-${index}`"
              v-model="tag.state"
              type="checkbox"
              class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="step !== 2"
            />
            <label
              :for="`tag-${index}`"
              class="ms-2 text-sm font-medium text-gray-900 dark:text-gray-300"
              :class="{ 'opacity-50': step !== 2 }"
            >
              {{ tag.name }}
            </label>
          </div>
        </div>

        <button
          v-if="step === 2"
          type="button"
          class="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
          @click="confirmTags"
        >
          {{ $t('pages.admin.members.add.step2.button-next') }}
        </button>

        <div v-if="step > 2" class="flex items-center text-green-600 dark:text-green-400">
          <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
            <path
              fill-rule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clip-rule="evenodd"
            />
          </svg>
          <span class="text-sm font-medium">{{
            $t('pages.admin.members.add.step2.permissions-selected')
          }}</span>
        </div>
      </div>
    </div>
    <template v-else />

    <!-- Step 3: Welcome Email -->
    <div
      v-if="step >= 3"
      class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700"
    >
      <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        {{ $t('pages.admin.members.add.step3.title') }}
      </h2>

      <div class="space-y-4">
        <div class="flex items-center">
          <input
            id="welcome-email"
            v-model="sendMail"
            type="checkbox"
            class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
          />
          <label
            for="welcome-email"
            class="ms-2 text-sm font-medium text-gray-900 dark:text-gray-300"
          >
            {{ $t('pages.admin.members.add.step3.send-welcome-email') }}
          </label>
        </div>

        <button
          v-if="!submitResult"
          type="button"
          :disabled="isSubmitting"
          class="text-white bg-green-700 hover:bg-green-800 focus:ring-4 focus:ring-green-300 font-medium rounded-lg text-sm px-5 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-green-600 dark:hover:bg-green-700 dark:focus:ring-green-800"
          @click="submitForm"
        >
          <span v-if="isSubmitting" class="flex items-center">
            <svg
              class="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
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
    <template v-else />

    <!-- Result Display -->
    <div
      v-if="submitResult"
      class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700"
    >
      <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        {{ $t('pages.admin.members.add.result.title') }}
      </h2>

      <!-- Success with Email -->
      <div v-if="submitResult === 'success-with-email'" class="space-y-4">
        <div
          class="flex items-start p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg"
        >
          <svg
            class="w-6 h-6 text-green-600 dark:text-green-400 mr-3 flex-shrink-0"
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
            <h3 class="text-sm font-medium text-green-800 dark:text-green-300">
              {{ $t('pages.admin.members.add.result.success-title') }}
            </h3>
            <p class="mt-1 text-sm text-green-700 dark:text-green-400">
              {{ $t('pages.admin.members.add.result.success-with-email') }}
            </p>
          </div>
        </div>
      </div>

      <!-- Success without Email -->
      <div v-else-if="submitResult === 'success-without-email'" class="space-y-4">
        <div
          class="flex items-start p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg"
        >
          <svg
            class="w-6 h-6 text-blue-600 dark:text-blue-400 mr-3 flex-shrink-0"
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
            <h3 class="text-sm font-medium text-blue-800 dark:text-blue-300">
              {{ $t('pages.admin.members.add.result.success-title') }}
            </h3>
            <p class="mt-1 text-sm text-blue-700 dark:text-blue-400">
              {{ $t('pages.admin.members.add.result.success-without-email') }}
            </p>
          </div>
        </div>
      </div>

      <!-- Error -->
      <div v-else class="space-y-4">
        <div
          class="flex items-start p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
        >
          <svg
            class="w-6 h-6 text-red-600 dark:text-red-400 mr-3 flex-shrink-0"
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
            <h3 class="text-sm font-medium text-red-800 dark:text-red-300">
              {{ $t('pages.admin.members.add.result.error-title') }}
            </h3>
            <p class="mt-1 text-sm text-red-700 dark:text-red-400">
              {{ submitError }}
            </p>
          </div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="mt-4 flex items-center gap-4">
        <button
          type="button"
          class="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
          @click="resetForm"
        >
          {{ $t('pages.admin.members.add.result.button-new') }}
        </button>

        <!-- Retry as button for error case -->
        <button
          v-if="submitResult === 'error'"
          type="button"
          class="text-white bg-red-600 hover:bg-red-700 focus:ring-4 focus:ring-red-300 font-medium rounded-lg text-sm px-5 py-2.5 dark:bg-red-700 dark:hover:bg-red-800 dark:focus:ring-red-900"
          @click="submitForm"
        >
          {{ $t('pages.admin.members.add.result.button-retry') }}
        </button>

        <!-- Retry as link for success cases -->
        <button
          v-else
          type="button"
          class="text-blue-700 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 text-sm font-medium underline"
          @click="submitForm"
        >
          {{ $t('pages.admin.members.add.result.button-retry') }}
        </button>
      </div>
    </div>
    <template v-else />
  </div>
</template>

<style scoped>
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

  .shake {
    animation: shake 0.5s ease-in-out;
  }
</style>
