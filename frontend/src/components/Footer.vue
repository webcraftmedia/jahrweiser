<!-- eslint-disable vue/multi-word-component-names -->
<template>
  <footer class="wc-footer">
    <!-- Decorative watercolor border -->
    <div class="wc-footer-border" aria-hidden="true"></div>

    <div class="w-full mx-auto max-w-screen-xl px-4 py-3 flex items-center justify-between">
      <span class="wc-copyright">
        {{ $t('components.Footer.copyright') }}
        <a href="https://www.webcraft-media.de/" class="wc-footer-link">
          {{ $t('components.Footer.copyright-holder') }}
        </a>
        <span class="hidden md:inline">{{ $t('components.Footer.copyright-text') }}</span>
      </span>
      <ul class="wc-footer-nav">
        <li>
          <NuxtLink
            :to="{ path: 'https://www.webcraft-media.de/#!impressum' }"
            external
            class="wc-footer-link"
          >
            {{ $t('components.Footer.imprint') }}
          </NuxtLink>
        </li>
        <li>
          <NuxtLink
            :to="{ path: 'https://www.webcraft-media.de/#!datenschutz' }"
            external
            class="wc-footer-link"
          >
            {{ $t('components.Footer.privacy-policy') }}
          </NuxtLink>
        </li>
      </ul>
    </div>
  </footer>
</template>

<style scoped>
.wc-footer {
  position: relative;
  background: rgba(250, 249, 247, 0.9);
  backdrop-filter: blur(8px);
  z-index: 10;
}

.wc-footer-border {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--wc-rose-light) 15%,
    var(--wc-rose) 30%,
    var(--wc-sky) 50%,
    var(--wc-mint) 70%,
    var(--wc-lavender-light) 85%,
    transparent 100%
  );
  opacity: 0.7;
}

.wc-copyright {
  font-family: 'Quicksand', sans-serif;
  font-size: 0.8rem;
  color: var(--wc-charcoal-light);
}

.wc-footer-nav {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
  list-style: none;
  margin: 0;
  padding: 0;
}

.wc-footer-link {
  font-family: 'Quicksand', sans-serif;
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--wc-charcoal-light);
  text-decoration: none;
  position: relative;
  transition: color 0.3s ease;
}

.wc-footer-link::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 0;
  width: 0;
  height: 1px;
  background: linear-gradient(90deg, var(--wc-rose) 0%, var(--wc-sky) 100%);
  transition: width 0.3s ease;
}

.wc-footer-link:hover {
  color: var(--wc-rose-dark);
}

.wc-footer-link:hover::after {
  width: 100%;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .wc-footer {
    background: rgba(26, 26, 46, 0.9);
  }

  .wc-footer-border {
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(244, 143, 177, 0.3) 15%,
      var(--wc-dark-rose) 30%,
      var(--wc-dark-sky) 50%,
      var(--wc-dark-mint) 70%,
      rgba(206, 147, 216, 0.3) 85%,
      transparent 100%
    );
    opacity: 0.5;
  }

  .wc-copyright {
    color: var(--wc-dark-text-muted);
  }

  .wc-footer-link {
    color: var(--wc-dark-text-muted);
  }

  .wc-footer-link:hover {
    color: var(--wc-dark-lavender);
  }

  .wc-footer-link::after {
    background: linear-gradient(90deg, var(--wc-dark-lavender) 0%, var(--wc-dark-sky) 100%);
  }
}
</style>
