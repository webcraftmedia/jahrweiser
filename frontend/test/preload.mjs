// Preload script: patches localStorage before any modules import (e.g. @vue/devtools-kit).
// Node 25+ defines localStorage as a getter that warns when --localstorage-file is not set.
// Loaded via poolOptions.forks.execArgv --import before module evaluation.
const store = {}
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key) => store[key] ?? null,
    setItem: (key, value) => {
      store[key] = value
    },
    removeItem: (key) => {
      Reflect.deleteProperty(store, key)
    },
    clear: () => {
      for (const key of Object.keys(store)) Reflect.deleteProperty(store, key)
    },
    key: (index) => Object.keys(store)[index] ?? null,
    get length() {
      return Object.keys(store).length
    },
  },
  configurable: true,
  writable: true,
})
