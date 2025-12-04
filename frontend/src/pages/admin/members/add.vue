<script setup lang="ts">
definePageMeta({
  middleware: ['authenticated', 'admin']
})

interface TagItem {
  label: string
  value: boolean
}

const email = ref('')
const tags = ref<TagItem[]>([])
const sendWelcomeEmail = ref(true)

const step = ref(1)
const isLoadingTags = ref(false)

const mockFetchTags = async (): Promise<TagItem[]> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve([
        { label: 'GG&G', value: true },
        { label: 'Kultur-Steher', value: false }
      ])
    }, 500)
  })
}

const confirmEmail = async () => {
  if (!email.value) return

  isLoadingTags.value = true
  tags.value = await mockFetchTags()
  isLoadingTags.value = false

  step.value = 2
}

const confirmTags = () => {
  step.value = 3
}

const submitForm = () => {
  console.log('Form submitted:', {
    email: email.value,
    tags: tags.value,
    sendWelcomeEmail: sendWelcomeEmail.value
  })
  // Hier würde der finale API-Call stattfinden
}
</script>

<template>
  <div class="space-y-6">
    <h1 class="hidden md:block text-2xl font-semibold text-gray-900 dark:text-white">
      Mitglieder hinzufügen
    </h1>

    <!-- Step 1: Email Input -->
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
      <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Schritt 1: E-Mail-Adresse eingeben
      </h2>

      <div class="space-y-4">
        <div>
          <label for="email" class="block mb-2 text-sm font-medium text-gray-900 dark:text-white">
            E-Mail-Adresse
          </label>
          <input
            id="email"
            v-model="email"
            type="email"
            class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
            placeholder="mitglied@beispiel.de"
            :disabled="step > 1"
            required
          />
        </div>

        <button
          v-if="step === 1"
          type="button"
          :disabled="!email"
          class="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
          @click="confirmEmail"
        >
          Weiter
        </button>

        <div v-if="step > 1" class="flex items-center text-green-600 dark:text-green-400">
          <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
          </svg>
          <span class="text-sm font-medium">E-Mail bestätigt</span>
        </div>
      </div>
    </div>

    <!-- Step 2: Tags Selection -->
    <div
      v-if="step >= 2"
      class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700"
    >
      <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Schritt 2: Tags auswählen
      </h2>

      <div v-if="isLoadingTags" class="flex items-center justify-center py-8">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>

      <div v-else class="space-y-4">
        <div class="space-y-3">
          <div v-for="(tag, index) in tags" :key="index" class="flex items-center">
            <input
              :id="`tag-${index}`"
              v-model="tag.value"
              type="checkbox"
              class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
              :disabled="step > 2"
            />
            <label
              :for="`tag-${index}`"
              class="ms-2 text-sm font-medium text-gray-900 dark:text-gray-300"
            >
              {{ tag.label }}
            </label>
          </div>
        </div>

        <button
          v-if="step === 2"
          type="button"
          class="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
          @click="confirmTags"
        >
          Weiter
        </button>

        <div v-if="step > 2" class="flex items-center text-green-600 dark:text-green-400">
          <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
          </svg>
          <span class="text-sm font-medium">Tags ausgewählt</span>
        </div>
      </div>
    </div>

    <!-- Step 3: Welcome Email -->
    <div
      v-if="step >= 3"
      class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700"
    >
      <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Schritt 3: Abschluss
      </h2>

      <div class="space-y-4">
        <div class="flex items-center">
          <input
            id="welcome-email"
            v-model="sendWelcomeEmail"
            type="checkbox"
            class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
          />
          <label
            for="welcome-email"
            class="ms-2 text-sm font-medium text-gray-900 dark:text-gray-300"
          >
            Begrüßungsmail versenden
          </label>
        </div>

        <button
          type="button"
          class="text-white bg-green-700 hover:bg-green-800 focus:ring-4 focus:ring-green-300 font-medium rounded-lg text-sm px-5 py-2.5 dark:bg-green-600 dark:hover:bg-green-700 dark:focus:ring-green-800"
          @click="submitForm"
        >
          Mitglied hinzufügen
        </button>
      </div>
    </div>
  </div>
</template>
