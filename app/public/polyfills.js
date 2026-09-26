/**
 * The handful of runtime APIs our dependencies use that the browsers in
 * .browserslistrc do not have.
 *
 * Deliberately ES5 and deliberately a classic script: it has to parse in the
 * very browsers it exists to rescue, and it has to finish before the app runs.
 * Both fall out of how the browser loads it — `nuxt.config.ts` puts it in the
 * head without `defer` or `async`, and module scripts are deferred by spec, so
 * this always executes first. A Nuxt plugin would not: by the time plugins run,
 * the entry chunk has already installed the router, and the router calls
 * `.at(-1)` on every navigation.
 *
 * Kept to exactly what the bundle needs rather than pulling in core-js, and
 * `scripts/browser-baseline.mjs` is what makes that safe: it fails the build
 * when a dependency starts using an API above the floor that is not listed
 * here — and equally when an entry here is no longer needed. Do not edit this
 * file without running `npm run test:baseline`.
 *
 * `AbortSignal.timeout` is missing below Safari 15.4 too, and is absent here on
 * purpose: Nuxt already calls it as `AbortSignal.timeout?.(n)`, so the gap is
 * handled where it occurs.
 */
;(function () {
  function define(target, name, value) {
    if (!target[name]) {
      Object.defineProperty(target, name, {
        value: value,
        writable: true,
        configurable: true,
      })
    }
  }

  /* Array.prototype.at / String.prototype.at — Safari 15.4, Chrome 92.
     vue-router calls `matched.at(-1)` on every navigation, so without this the
     app dies during hydration on the very first route. */
  function at(index) {
    var i = Math.trunc(index) || 0
    if (i < 0) i += this.length
    return i < 0 || i >= this.length ? undefined : this[i]
  }
  define(Array.prototype, 'at', at)
  define(String.prototype, 'at', at)

  /* Object.hasOwn — Safari 15.4, Chrome 93. */
  define(Object, 'hasOwn', function (object, key) {
    return Object.prototype.hasOwnProperty.call(Object(object), key)
  })

  /* Array.prototype.findLast / findLastIndex — Safari 15.4, Chrome 97. */
  define(Array.prototype, 'findLast', function (predicate, thisArg) {
    for (var i = this.length - 1; i >= 0; i--) {
      if (predicate.call(thisArg, this[i], i, this)) return this[i]
    }
    return undefined
  })
  define(Array.prototype, 'findLastIndex', function (predicate, thisArg) {
    for (var i = this.length - 1; i >= 0; i--) {
      if (predicate.call(thisArg, this[i], i, this)) return i
    }
    return -1
  })

  /* Array.prototype.toSorted / toReversed — Safari 16.4, Chrome 110. Vue's
     reactive-array instrumentation defines these by name, so they only throw
     once something actually calls them — a trap that survives testing on a
     modern machine. */
  define(Array.prototype, 'toSorted', function (compare) {
    return Array.prototype.slice.call(this).sort(compare)
  })
  define(Array.prototype, 'toReversed', function () {
    return Array.prototype.slice.call(this).reverse()
  })

  /* String.prototype.replaceAll — Chrome 85 (Safari has it at 13.1). */
  define(String.prototype, 'replaceAll', function (search, replacement) {
    if (Object.prototype.toString.call(search) === '[object RegExp]') {
      return this.replace(search, replacement)
    }
    return this.split(search).join(replacement)
  })
})()
