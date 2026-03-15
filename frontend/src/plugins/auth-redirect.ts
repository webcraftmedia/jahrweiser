export default defineNuxtPlugin(() => {
  if (typeof globalThis.$fetch.create !== 'function') return

  const { clear } = useUserSession()

  globalThis.$fetch = globalThis.$fetch.create({
    async onResponseError({ request, response }) {
      const url =
        typeof request === 'string'
          ? request
          : request instanceof URL
            ? request.pathname
            : request.url
      if (response.status === 401 && !url.includes('/api/redeemLoginLink')) {
        await clear()
        await navigateTo('/login')
      }
    },
  })
})
