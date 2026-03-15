export default defineNuxtPlugin(() => {
  if (typeof globalThis.$fetch?.create !== 'function') return

  const { clear } = useUserSession()

  globalThis.$fetch = globalThis.$fetch.create({
    async onResponseError({ response }) {
      if (response.status === 401) {
        await clear()
        await navigateTo('/login')
      }
    },
  })
})
