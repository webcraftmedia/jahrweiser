<template>
  <div class="flex h-screen">
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
  @apply mt-16
}
</style>