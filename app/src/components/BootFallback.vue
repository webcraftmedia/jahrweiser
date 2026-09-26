<template>
  <!--
    Server-rendered, hidden, and unhidden again only if the app never came
    alive. Everything here has to survive the app not existing, which is why it
    is markup plus one classic script rather than a component that reacts to
    something.
  -->
  <div
    id="boot-fallback"
    hidden
    role="alert"
    class="w-full max-w-md mt-8 p-5 border-2 border-sienna/50 dark:border-sienna-dark/50 rounded bg-sienna/10 dark:bg-sienna/5 text-navy dark:text-ivory"
  >
    <h3 class="text-lg font-display mb-2">{{ $t('components.BootFallback.title') }}</h3>
    <p class="text-base font-body">{{ $t('components.BootFallback.text') }}</p>
    <p class="mt-2 text-base font-body">{{ $t('components.BootFallback.hint') }}</p>
    <p class="mt-2 text-sm font-body">{{ $t('components.BootFallback.contact') }}</p>
  </div>

  <!-- For the case where not even the watchdog above runs. -->
  <noscript>
    <div
      role="alert"
      class="w-full max-w-md mt-8 p-5 border-2 border-sienna/50 dark:border-sienna-dark/50 rounded bg-sienna/10 dark:bg-sienna/5 text-navy dark:text-ivory"
    >
      <h3 class="text-lg font-display mb-2">{{ $t('components.BootFallback.title') }}</h3>
      <p class="text-base font-body">{{ $t('components.BootFallback.noscript') }}</p>
    </div>
  </noscript>
</template>

<script setup lang="ts">
  /**
   * Says so when the app fails to start.
   *
   * Every auth page renders a waiting state on the server and replaces it once
   * Vue takes over: three dots on /register, a disabled button on /login. If
   * the bundle never executes — a browser below the baseline, a content
   * blocker, a proxy that mangles JavaScript — that waiting state is final.
   * The member stares at three dots forever, the deadline in
   * `utils/withTimeout.ts` cannot help because it lives in the same bundle that
   * did not run, and the server logs a perfectly ordinary 200. Nothing
   * anywhere says what went wrong.
   *
   * `scripts/browser-baseline.mjs` keeps the known causes from coming back.
   * This keeps the unknown ones from being silent.
   */
  /**
   * Module scripts are deferred, so they run before `load` fires. If the flag
   * is still unset one grace period after `load`, the app is not coming — the
   * bundle failed to parse, failed to download, or was never allowed to run.
   *
   * The absolute timer is the second belt: when a chunk hangs on a dead
   * connection, `load` may never fire at all.
   */
  useHead({
    script: [
      {
        tagPosition: 'bodyClose',
        innerHTML: `(function(){var d=document,s="boot-fallback",done=false;
function c(){if(done)return;if(window.__jwMounted)return;var e=d.getElementById(s);if(!e)return;done=true;e.removeAttribute("hidden")}
if(d.readyState==="complete"){setTimeout(c,1500)}else{window.addEventListener("load",function(){setTimeout(c,1500)})}
setTimeout(c,20000)})()`,
      },
    ],
  })

  // Reached only if hydration worked, which is exactly the question being asked.
  onMounted(() => {
    ;(window as unknown as { __jwMounted?: boolean }).__jwMounted = true
    document.getElementById('boot-fallback')?.setAttribute('hidden', '')
  })
</script>
