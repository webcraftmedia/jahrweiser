<template>
  <div class="flex flex-col h-screen bg-white dark:bg-gray-800">
    <Header />
    <div class="content flex-1 w-full overflow-hidden">
      <slot />
    </div>
    <Footer />
  </div>
</template>

<style scoped>
@reference "tailwindcss";
.content {
  @apply mt-16;
}
</style>
