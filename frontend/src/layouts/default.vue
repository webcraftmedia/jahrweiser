<template>
  <div class="flex flex-col h-screen bg-white dark:bg-gray-800">
    <Header />
    <div class="content flex-1 overflow-y-auto max-w-screen-xl flex flex-wrap justify-between mx-auto w-full">
      <slot />
    </div>
    <Footer />
  </div>
</template>

<style scoped>
@reference "tailwindcss";
.content {
  @apply mt-16;
  box-shadow: -10px 0 20px -10px rgba(0, 0, 0, 0.1), 10px 0 20px -10px rgba(0, 0, 0, 0.1);
}

@media (prefers-color-scheme: dark) {
  .content {
    box-shadow: -10px 0 20px -10px rgba(0, 0, 0, 0.3), 10px 0 20px -10px rgba(0, 0, 0, 0.3);
  }
}
</style>
