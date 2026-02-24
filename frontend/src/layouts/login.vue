<template>
  <div class="flex flex-col min-h-screen bg-ivory dark:bg-poster-dark relative">
    <Header variant="hero" />

    <!-- Content -->
    <div class="flex-1 flex items-start justify-center px-4">
      <slot />
    </div>

    <Footer />
  </div>
</template>
