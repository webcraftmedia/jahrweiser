<template>
  <div class="flex h-screen bg-white dark:bg-gray-800">
    <Header />
    <div class="content max-w-screen-xl flex flex-wrap justify-between mx-auto">
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
