<template>
  <NuxtLayout>
    <NuxtPage :transition="{ name: 'page', mode: 'out-in' }" />
  </NuxtLayout>
</template>

<style>
  .page-enter-active {
    animation: fadeSlideUp 0.35s ease-out;
  }
  .page-leave-active {
    animation: fadeSlideUp 0.2s ease-in reverse;
  }
</style>
