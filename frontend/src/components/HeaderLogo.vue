<template>
  <div class="logo-wrapper">
    <Logo class="logo" />
  </div>
</template>

<script setup lang="ts">
import Logo from '~/../assets/logo.svg'
</script>

<style scoped>
.logo-wrapper {
  display: inline-block;
  transition: transform 0.3s ease;
}

.logo-wrapper:hover {
  animation: logo-wobble 0.6s ease-in-out;
}

@keyframes logo-wobble {
  0%, 100% {
    transform: rotate(0deg);
  }
  20% {
    transform: rotate(-3deg);
  }
  40% {
    transform: rotate(3deg);
  }
  60% {
    transform: rotate(-2deg);
  }
  80% {
    transform: rotate(2deg);
  }
}

.logo {
  width: unset;
  height: 40px;
  color: var(--ink-dark);
}

@media (prefers-color-scheme: dark) {
  .logo {
    color: var(--ink-light);
  }
}
</style>
