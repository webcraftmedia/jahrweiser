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
    <div class="flex h-screen overflow-hidden">
      <!-- Desktop Sidebar - Full Height -->
      <aside class="hidden md:flex md:flex-shrink-0 h-screen">
        <div class="flex flex-col w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 h-full">
          <div class="flex items-center flex-shrink-0 px-4 pt-5 pb-4">
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Admin</h2>
          </div>
          <nav class="flex-1 px-2 space-y-1 overflow-y-auto">
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
      </aside>

      <!-- Mobile Menu Button -->
      <div class="md:hidden fixed top-20 left-4 z-50">
        <button
          @click="toggleMobileMenu"
          class="bg-white dark:bg-gray-800 p-2 rounded-md text-gray-700 dark:text-gray-300 shadow-lg border border-gray-200 dark:border-gray-700"
        >
          <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      <!-- Mobile Drawer Backdrop -->
      <Transition
        enter-active-class="transition-opacity ease-linear duration-300"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition-opacity ease-linear duration-300"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div
          v-if="mobileMenuOpen"
          class="md:hidden fixed inset-0 bg-gray-600 bg-opacity-75 z-40"
          @click="mobileMenuOpen = false"
        ></div>
      </Transition>

      <!-- Mobile Drawer -->
      <Transition
        enter-active-class="transition ease-in-out duration-300 transform"
        enter-from-class="-translate-x-full"
        enter-to-class="translate-x-0"
        leave-active-class="transition ease-in-out duration-300 transform"
        leave-from-class="translate-x-0"
        leave-to-class="-translate-x-full"
      >
        <div
          v-if="mobileMenuOpen"
          class="md:hidden fixed inset-y-0 left-0 z-50 flex flex-col w-64 bg-white dark:bg-gray-800 shadow-xl"
        >
          <div class="flex items-center justify-between flex-shrink-0 px-4 pt-5 pb-4">
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Admin</h2>
            <button
              @click="mobileMenuOpen = false"
              class="ml-1 flex items-center justify-center h-10 w-10 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none"
            >
              <svg class="h-6 w-6 text-gray-600 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <nav class="flex-1 px-2 space-y-1 overflow-y-auto">
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
      </Transition>

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
