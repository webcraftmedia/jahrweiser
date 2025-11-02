<!-- eslint-disable vue/multi-word-component-names -->
<template>
  <footer class="bg-white dark:bg-gray-800 absolute bottom-0 w-full border-t">
    <div class="w-full mx-auto max-w-screen-xl p-1 md:flex md:items-center md:justify-between">
      <span class="text-sm text-gray-500 sm:text-center dark:text-gray-400"
        >{{ $t('components.Footer.copyright') }}
        <a href="https://www.webcraft-media.de/" class="hover:underline">{{
          $t('components.Footer.copyright-holder')
        }}</a
        >{{ $t('components.Footer.copyright-text') }}
      </span>
      <ul
        class="flex flex-wrap items-center mt-3 text-sm font-medium text-gray-500 dark:text-gray-400 sm:mt-0"
      >
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
