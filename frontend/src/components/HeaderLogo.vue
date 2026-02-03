<template>
  <div class="wc-logo-wrapper">
    <Logo class="wc-logo" />
  </div>
</template>

<script setup lang="ts">
import Logo from '~/../assets/logo.svg'
</script>

<style scoped>
.wc-logo-wrapper {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.wc-logo-wrapper::before {
  content: '';
  position: absolute;
  inset: -8px;
  background: linear-gradient(
    135deg,
    rgba(248, 187, 217, 0.3) 0%,
    rgba(187, 222, 251, 0.3) 50%,
    rgba(200, 230, 201, 0.3) 100%
  );
  border-radius: 50%;
  filter: blur(8px);
  opacity: 0;
  transition: opacity 0.4s ease;
  z-index: -1;
}

.wc-logo-wrapper:hover::before {
  opacity: 1;
}

.wc-logo {
  width: unset;
  height: 42px;
  color: var(--wc-rose-dark);
  transition: all 0.4s ease;
  filter: drop-shadow(0 2px 4px rgba(248, 187, 217, 0.3));
}

.wc-logo-wrapper:hover .wc-logo {
  transform: scale(1.05);
  filter: drop-shadow(0 4px 8px rgba(248, 187, 217, 0.4));
}

/* Gentle floating animation */
@keyframes logoFloat {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-2px);
  }
}

.wc-logo {
  animation: logoFloat 4s ease-in-out infinite;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .wc-logo {
    color: var(--wc-dark-lavender);
    filter: drop-shadow(0 2px 4px rgba(206, 147, 216, 0.3));
  }

  .wc-logo-wrapper::before {
    background: linear-gradient(
      135deg,
      rgba(244, 143, 177, 0.2) 0%,
      rgba(144, 202, 249, 0.2) 50%,
      rgba(206, 147, 216, 0.2) 100%
    );
  }

  .wc-logo-wrapper:hover .wc-logo {
    filter: drop-shadow(0 4px 8px rgba(206, 147, 216, 0.4));
  }
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .wc-logo {
    animation: none;
  }
}
</style>
