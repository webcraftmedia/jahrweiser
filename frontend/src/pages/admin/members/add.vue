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
    <h1 class="hidden md:block text-2xl font-display text-navy dark:text-ivory">
      {{ $t('pages.admin.members.add.title') }}
    </h1>

    <!-- Step 1: Email Input -->
    <div
      class="animate-fade-slide-up bg-white/80 dark:bg-poster-darkCard rounded shadow-lg p-6 border-2 border-navy/15 dark:border-poster-darkBorder"
    >
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-lg font-display text-navy dark:text-ivory">
          {{ $t('pages.admin.members.add.step1.title') }}
        </h2>
        <button
          v-if="step > 1"
          type="button"
          class="text-sienna hover:text-sienna-light dark:text-sienna-light dark:hover:text-sienna text-sm font-medium font-body transition-colors"
          @click="goToStep(1)"
        >
          {{ $t('pages.admin.members.add.step1.button-edit') }}
        </button>
      </div>

      <div class="space-y-4">
        <div>
          <label
            for="email"
            class="block mb-2 text-base font-medium font-body text-navy dark:text-ivory"
          >
            {{ $t('pages.admin.members.add.step1.email-label') }}
          </label>
          <input
            id="email"
            v-model="email"
            type="email"
            class="bg-ivory dark:bg-poster-dark border-2 text-navy dark:text-ivory text-base rounded font-body focus:ring-sienna focus:border-sienna dark:focus:ring-sienna-dark dark:focus:border-sienna-dark block w-full p-3 placeholder-navy/40 dark:placeholder-poster-darkMuted disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            :class="{
              'shake border-sienna dark:border-sienna-light': isEmailShaking,
              'border-navy/20 dark:border-poster-darkBorder': !isEmailShaking,
            }"
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
          class="text-ivory bg-sienna hover:brightness-110 dark:bg-sienna-dark dark:hover:brightness-110 focus:ring-4 focus:outline-none focus:ring-sienna/30 font-semibold font-body rounded text-base px-5 py-2.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          @click="confirmEmail"
        >
          {{ $t('pages.admin.members.add.step1.button-next') }}
        </button>

        <div v-if="step > 1" class="flex items-center text-olive dark:text-olive-light">
          <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
            <path
              fill-rule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clip-rule="evenodd"
            />
          </svg>
          <span class="text-sm font-medium font-body">{{
            $t('pages.admin.members.add.step1.valid-email')
          }}</span>
        </div>
      </div>
    </div>

    <!-- Step 2: Tags Selection -->
    <div
      v-if="step >= 2"
      class="animate-fade-slide-up stagger-1 bg-white/80 dark:bg-poster-darkCard rounded shadow-lg p-6 border-2 border-navy/15 dark:border-poster-darkBorder"
    >
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-lg font-display text-navy dark:text-ivory">
          {{ $t('pages.admin.members.add.step2.title') }}
        </h2>
        <button
          v-if="step > 2"
          type="button"
          class="text-sienna hover:text-sienna-light dark:text-sienna-light dark:hover:text-sienna text-sm font-medium font-body transition-colors"
          @click="goToStep(2)"
        >
          {{ $t('pages.admin.members.add.step1.button-edit') }}
        </button>
      </div>

      <div v-if="isLoadingTags" class="flex items-center justify-center gap-2 py-8">
        <span class="loading-dot" />
        <span class="loading-dot" style="animation-delay: 0.15s" />
        <span class="loading-dot" style="animation-delay: 0.3s" />
      </div>

      <div v-else class="space-y-4">
        <div class="space-y-3">
          <div
            v-for="(tag, index) in tags"
            :key="index"
            class="flex items-center animate-fade-slide-up"
            :style="{ animationDelay: `${index * 50}ms` }"
          >
            <input
              :id="`tag-${index}`"
              v-model="tag.state"
              type="checkbox"
              class="w-4 h-4 text-sienna bg-ivory dark:bg-poster-dark border-navy/20 dark:border-poster-darkBorder rounded focus:ring-sienna dark:focus:ring-sienna-dark focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed accent-sienna"
              :disabled="step !== 2"
            />
            <label
              :for="`tag-${index}`"
              class="ms-2 text-sm font-medium font-body text-navy dark:text-ivory"
              :class="{ 'opacity-50': step !== 2 }"
            >
              {{ tag.name }}
            </label>
          </div>
        </div>

        <button
          v-if="step === 2"
          type="button"
          class="text-ivory bg-sienna hover:brightness-110 dark:bg-sienna-dark dark:hover:brightness-110 focus:ring-4 focus:outline-none focus:ring-sienna/30 font-semibold font-body rounded text-base px-5 py-2.5 transition-all"
          @click="confirmTags"
        >
          {{ $t('pages.admin.members.add.step2.button-next') }}
        </button>

        <div v-if="step > 2" class="flex items-center text-olive dark:text-olive-light">
          <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
            <path
              fill-rule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clip-rule="evenodd"
            />
          </svg>
          <span class="text-sm font-medium font-body">{{
            $t('pages.admin.members.add.step2.permissions-selected')
          }}</span>
        </div>
      </div>
    </div>
    <template v-else />

    <!-- Step 3: Welcome Email -->
    <div
      v-if="step >= 3"
      class="animate-fade-slide-up stagger-2 bg-white/80 dark:bg-poster-darkCard rounded shadow-lg p-6 border-2 border-navy/15 dark:border-poster-darkBorder"
    >
      <h2 class="text-lg font-display text-navy dark:text-ivory mb-4">
        {{ $t('pages.admin.members.add.step3.title') }}
      </h2>

      <div class="space-y-4">
        <div class="flex items-center">
          <input
            id="welcome-email"
            v-model="sendMail"
            type="checkbox"
            class="w-4 h-4 text-sienna bg-ivory dark:bg-poster-dark border-navy/20 dark:border-poster-darkBorder rounded focus:ring-sienna dark:focus:ring-sienna-dark focus:ring-2 accent-sienna"
          />
          <label
            for="welcome-email"
            class="ms-2 text-sm font-medium font-body text-navy dark:text-ivory"
          >
            {{ $t('pages.admin.members.add.step3.send-welcome-email') }}
          </label>
        </div>

        <button
          v-if="!submitResult"
          type="button"
          :disabled="isSubmitting"
          class="text-ivory bg-olive hover:brightness-110 dark:bg-olive-dark dark:hover:brightness-110 focus:ring-4 focus:outline-none focus:ring-olive/30 font-semibold font-body rounded text-base px-5 py-2.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          @click="submitForm"
        >
          <span v-if="isSubmitting" class="flex items-center gap-1.5">
            <span class="loading-dot !w-[6px] !h-[6px] !bg-ivory" />
            <span class="loading-dot !w-[6px] !h-[6px] !bg-ivory" style="animation-delay: 0.15s" />
            <span class="loading-dot !w-[6px] !h-[6px] !bg-ivory" style="animation-delay: 0.3s" />
            <span class="ml-1">{{ $t('pages.admin.members.add.step3.processing') }}</span>
          </span>
          <span v-else>{{ $t('pages.admin.members.add.step3.button-submit') }}</span>
        </button>
      </div>
    </div>
    <template v-else />

    <!-- Result Display -->
    <div
      v-if="submitResult"
      class="animate-fade-slide-up bg-white/80 dark:bg-poster-darkCard rounded shadow-lg p-6 border-2 border-navy/15 dark:border-poster-darkBorder"
    >
      <h2 class="text-lg font-display text-navy dark:text-ivory mb-4">
        {{ $t('pages.admin.members.add.result.title') }}
      </h2>

      <!-- Success with Email -->
      <div v-if="submitResult === 'success-with-email'" class="space-y-4">
        <div
          class="flex items-start p-4 bg-olive/10 dark:bg-olive/5 border-2 border-olive/50 dark:border-olive/30 rounded"
        >
          <svg
            class="animate-stamp w-6 h-6 text-olive dark:text-olive-light mr-3 flex-shrink-0"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fill-rule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clip-rule="evenodd"
            />
          </svg>
          <div class="font-body">
            <h3 class="text-sm font-medium text-olive-dark dark:text-olive-light">
              {{ $t('pages.admin.members.add.result.success-title') }}
            </h3>
            <p class="mt-1 text-sm text-olive-dark/80 dark:text-olive-light/80">
              {{ $t('pages.admin.members.add.result.success-with-email') }}
            </p>
          </div>
        </div>
      </div>

      <!-- Success without Email -->
      <div v-else-if="submitResult === 'success-without-email'" class="space-y-4">
        <div
          class="flex items-start p-4 bg-mustard/10 dark:bg-mustard/5 border-2 border-mustard/50 dark:border-mustard/30 rounded"
        >
          <svg
            class="animate-stamp w-6 h-6 text-mustard dark:text-mustard-light mr-3 flex-shrink-0"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fill-rule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              clip-rule="evenodd"
            />
          </svg>
          <div class="font-body">
            <h3 class="text-sm font-medium text-navy dark:text-ivory">
              {{ $t('pages.admin.members.add.result.success-title') }}
            </h3>
            <p class="mt-1 text-sm text-navy/80 dark:text-ivory/80">
              {{ $t('pages.admin.members.add.result.success-without-email') }}
            </p>
          </div>
        </div>
      </div>

      <!-- Error -->
      <div v-else class="space-y-4">
        <div
          class="flex items-start p-4 bg-sienna/10 dark:bg-sienna/5 border-2 border-sienna/50 dark:border-sienna/30 rounded"
        >
          <svg
            class="w-6 h-6 text-sienna dark:text-sienna-light mr-3 flex-shrink-0"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fill-rule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clip-rule="evenodd"
            />
          </svg>
          <div class="font-body">
            <h3 class="text-sm font-medium text-sienna-dark dark:text-sienna-light">
              {{ $t('pages.admin.members.add.result.error-title') }}
            </h3>
            <p class="mt-1 text-sm text-sienna-dark/80 dark:text-sienna-light/80">
              {{ submitError }}
            </p>
          </div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="mt-4 flex items-center gap-4">
        <button
          type="button"
          class="text-ivory bg-sienna hover:brightness-110 dark:bg-sienna-dark dark:hover:brightness-110 focus:ring-4 focus:outline-none focus:ring-sienna/30 font-semibold font-body rounded text-base px-5 py-2.5 transition-all"
          @click="resetForm"
        >
          {{ $t('pages.admin.members.add.result.button-new') }}
        </button>

        <!-- Retry as button for error case -->
        <button
          v-if="submitResult === 'error'"
          type="button"
          class="px-5 py-2.5 text-base font-semibold font-body border-2 border-sienna text-sienna dark:text-sienna-light dark:border-sienna-dark rounded hover:bg-sienna hover:text-ivory dark:hover:bg-sienna-dark dark:hover:text-ivory transition-colors"
          @click="submitForm"
        >
          {{ $t('pages.admin.members.add.result.button-retry') }}
        </button>

        <!-- Retry as link for success cases -->
        <button
          v-else
          type="button"
          class="text-sienna dark:text-sienna-light hover:text-sienna-dark dark:hover:text-sienna text-sm font-medium font-body underline transition-colors"
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

  .stagger-1 {
    animation-delay: 0.1s;
  }
  .stagger-2 {
    animation-delay: 0.2s;
  }
</style>
