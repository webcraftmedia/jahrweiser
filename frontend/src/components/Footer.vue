<!-- eslint-disable vue/multi-word-component-names -->
<template>
  <footer class="bg-white dark:bg-gray-800 absolute bottom-0 w-full border-t p-1">
    <div class="w-full mx-auto max-w-screen-xl flex items-center justify-between">
      <span class="text-sm text-gray-500 sm:text-center dark:text-gray-400"
        >{{ $t('components.Footer.copyright') }}
        <a href="https://www.webcraft-media.de/" class="hover:underline">{{
          $t('components.Footer.copyright-holder')
        }}</a>
        <p class="inline hidden md:inline">{{ $t('components.Footer.copyright-text') }}</p>
      </span>
      <ul class="flex flex-wrap items-center text-sm font-medium text-gray-500 dark:text-gray-400">
        <li>
          <NuxtLink
            :to="{ path: 'https://www.webcraft-media.de/#!impressum' }"
            external
            class="hover:underline me-4 md:me-6"
          >
            {{ $t('components.Footer.imprint') }}
          </NuxtLink>
        </li>
        <li>
          <NuxtLink
            :to="{ path: 'https://www.webcraft-media.de/#!datenschutz' }"
            external
            class="hover:underline me-4 md:me-6"
          >
            {{ $t('components.Footer.privacy-policy') }}
          </NuxtLink>
        </li>
      </ul>
    </div>
  </footer>
</template>
