<template>
  <div class="flex flex-col h-screen bg-ivory dark:bg-poster-dark relative">
    <Header />
    <div
      class="content flex-1 overflow-y-auto max-w-screen-xl flex flex-wrap justify-between mx-auto w-full"
    >
      <slot />
    </div>
    <Footer />
  </div>
</template>

<style scoped>
  @reference "tailwindcss";
  .content {
    @apply mt-14 mb-0;
  }
</style>
