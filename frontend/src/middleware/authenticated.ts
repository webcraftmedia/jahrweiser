export default defineNuxtRouteMiddleware(async (to) => {
  const { loggedIn } = useUserSession()

  // redirect the user to the login screen if they're not authenticated
  if (!loggedIn.value) {
    return navigateTo({
      path: '/login',
      query: to.path === '/' ? undefined : { redirect: to.path },
    })
  }
})
