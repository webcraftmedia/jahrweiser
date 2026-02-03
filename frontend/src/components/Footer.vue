<!-- eslint-disable vue/multi-word-component-names -->
<template>
  <footer class="footer-sketchy">
    <div class="sketchy-divider mb-2"></div>
    <div class="w-full mx-auto max-w-screen-xl flex items-center justify-between px-2">
      <span class="footer-text">
        {{ $t('components.Footer.copyright') }}
        <a href="https://www.webcraft-media.de/" class="footer-link">
          {{ $t('components.Footer.copyright-holder') }}
        </a>
        <p class="inline hidden md:inline">{{ $t('components.Footer.copyright-text') }}</p>
      </span>
      <ul class="flex flex-wrap items-center footer-text">
        <li>
          <NuxtLink
            :to="{ path: 'https://www.webcraft-media.de/#!impressum' }"
            external
            class="footer-link me-4 md:me-6"
          >
            {{ $t('components.Footer.imprint') }}
          </NuxtLink>
        </li>
        <li>
          <NuxtLink
            :to="{ path: 'https://www.webcraft-media.de/#!datenschutz' }"
            external
            class="footer-link me-4 md:me-6"
          >
            {{ $t('components.Footer.privacy-policy') }}
          </NuxtLink>
        </li>
      </ul>
    </div>
  </footer>
</template>

<style scoped>
.footer-sketchy {
  background-color: var(--paper-light);
  position: absolute;
  bottom: 0;
  width: 100%;
  padding: 0.5rem 0.25rem;
}

@media (prefers-color-scheme: dark) {
  .footer-sketchy {
    background-color: var(--paper-dark);
  }
}

.footer-text {
  font-family: 'Patrick Hand', cursive;
  font-size: 0.9rem;
  color: var(--ink-dark);
  opacity: 0.7;
}

@media (prefers-color-scheme: dark) {
  .footer-text {
    color: var(--ink-light);
  }
}

.footer-link {
  color: var(--ink-blue);
  text-decoration: none;
  position: relative;
  transition: color 0.2s ease;
}

.footer-link::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 0;
  width: 0;
  height: 1px;
  background-color: var(--ink-blue);
  transition: width 0.3s ease;
}

.footer-link:hover {
  opacity: 1;
}

.footer-link:hover::after {
  width: 100%;
}

@media (prefers-color-scheme: dark) {
  .footer-link {
    color: var(--ink-blue-dark);
  }

  .footer-link::after {
    background-color: var(--ink-blue-dark);
  }
}
</style>
