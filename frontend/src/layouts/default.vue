<template>
  <div class="flex flex-col h-screen paper-bg-plain">
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
  @apply mt-16 mb-7;
}
</style>
