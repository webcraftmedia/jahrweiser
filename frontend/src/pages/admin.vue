<script setup lang="ts">
definePageMeta({
  middleware: ['authenticated', 'admin']
})

const router = useRouter()
const route = useRoute()

const menuItems = ref([
  { label: 'Mitglieder hinzufügen', path: '/admin/members/add' }
])

const mobileMenuOpen = ref(false)

const toggleMobileMenu = () => {
  mobileMenuOpen.value = !mobileMenuOpen.value
}

const isActive = (path: string) => {
  return route.path === path
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <div class="flex">
      <!-- Desktop Sidebar -->
      <aside class="hidden md:flex md:flex-shrink-0">
        <div class="flex flex-col w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
          <div class="flex-1 flex flex-col pt-5 pb-4 overflow-y-auto">
            <div class="flex items-center flex-shrink-0 px-4">
              <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Admin</h2>
            </div>
            <nav class="mt-5 flex-1 px-2 space-y-1">
              <NuxtLink
                v-for="item in menuItems"
                :key="item.path"
                :to="item.path"
                :class="[
                  isActive(item.path)
                    ? 'bg-blue-50 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700',
                  'group flex items-center px-2 py-2 text-sm font-medium rounded-md'
                ]"
              >
                {{ item.label }}
              </NuxtLink>
            </nav>
          </div>
        </div>
      </aside>

      <!-- Mobile Menu Button -->
      <div class="md:hidden fixed top-20 left-4 z-10">
        <button
          @click="toggleMobileMenu"
          class="bg-white dark:bg-gray-800 p-2 rounded-md text-gray-700 dark:text-gray-300 shadow-lg border border-gray-200 dark:border-gray-700"
        >
          <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      <!-- Mobile Sidebar -->
      <div
        v-if="mobileMenuOpen"
        class="md:hidden fixed inset-0 z-40 flex"
        @click.self="mobileMenuOpen = false"
      >
        <div class="relative flex-1 flex flex-col max-w-xs w-full bg-white dark:bg-gray-800 shadow-xl">
          <div class="absolute top-0 right-0 -mr-12 pt-2">
            <button
              @click="mobileMenuOpen = false"
              class="ml-1 flex items-center justify-center h-10 w-10 rounded-full focus:outline-none"
            >
              <svg class="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div class="flex-1 h-0 pt-5 pb-4 overflow-y-auto">
            <div class="flex items-center flex-shrink-0 px-4">
              <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Admin</h2>
            </div>
            <nav class="mt-5 px-2 space-y-1">
              <NuxtLink
                v-for="item in menuItems"
                :key="item.path"
                :to="item.path"
                @click="mobileMenuOpen = false"
                :class="[
                  isActive(item.path)
                    ? 'bg-blue-50 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700',
                  'group flex items-center px-2 py-2 text-sm font-medium rounded-md'
                ]"
              >
                {{ item.label }}
              </NuxtLink>
            </nav>
          </div>
        </div>
        <div class="flex-shrink-0 w-14"></div>
      </div>

      <!-- Main Content -->
      <div class="flex-1 overflow-auto">
        <main class="flex-1">
          <div class="py-6 px-4 sm:px-6 lg:px-8">
            <NuxtPage />
          </div>
        </main>
      </div>
    </div>
  </div>
</template>
