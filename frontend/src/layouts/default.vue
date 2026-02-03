<template>
  <div class="wc-layout flex flex-col min-h-screen">
    <!-- Watercolor background blobs -->
    <div class="wc-bg-blobs" aria-hidden="true">
      <div class="wc-blob wc-blob-1"></div>
      <div class="wc-blob wc-blob-2"></div>
      <div class="wc-blob wc-blob-3"></div>
    </div>

    <Header />
    <main
      class="content flex-1 overflow-y-auto max-w-screen-xl flex flex-wrap justify-between mx-auto w-full relative z-10"
    >
      <slot />
    </main>
    <Footer />
  </div>
</template>

<style scoped>
@reference "tailwindcss";

.wc-layout {
  background: var(--wc-cream);
  font-family: 'Quicksand', sans-serif;
  color: var(--wc-charcoal);
  position: relative;
  overflow-x: hidden;
}

/* Animated background blobs */
.wc-bg-blobs {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  overflow: hidden;
}

.wc-blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.4;
  animation: blobFloat 20s ease-in-out infinite;
}

.wc-blob-1 {
  width: 500px;
  height: 500px;
  background: linear-gradient(135deg, var(--wc-rose-light) 0%, var(--wc-rose) 100%);
  top: -100px;
  right: -100px;
  animation-delay: 0s;
}

.wc-blob-2 {
  width: 400px;
  height: 400px;
  background: linear-gradient(135deg, var(--wc-sky-light) 0%, var(--wc-sky) 100%);
  bottom: -50px;
  left: -100px;
  animation-delay: -7s;
}

.wc-blob-3 {
  width: 350px;
  height: 350px;
  background: linear-gradient(135deg, var(--wc-mint-light) 0%, var(--wc-mint) 100%);
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  animation-delay: -14s;
}

@keyframes blobFloat {
  0%, 100% {
    transform: translate(0, 0) scale(1);
  }
  25% {
    transform: translate(30px, -30px) scale(1.05);
  }
  50% {
    transform: translate(-20px, 20px) scale(0.95);
  }
  75% {
    transform: translate(20px, 10px) scale(1.02);
  }
}

.content {
  @apply mt-16 mb-7 px-4;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .wc-layout {
    background: var(--wc-dark-bg);
    color: var(--wc-dark-text);
  }

  .wc-blob {
    opacity: 0.15;
  }

  .wc-blob-1 {
    background: linear-gradient(135deg, var(--wc-dark-rose) 0%, #c2185b 100%);
  }

  .wc-blob-2 {
    background: linear-gradient(135deg, var(--wc-dark-sky) 0%, #1976d2 100%);
  }

  .wc-blob-3 {
    background: linear-gradient(135deg, var(--wc-dark-lavender) 0%, #7b1fa2 100%);
  }
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .wc-blob {
    animation: none;
  }
}
</style>
