export default defineNuxtRouteMiddleware((to, from) => {
  const { user } = useUserSession()

  if (user.value?.role !== 'admin') {
    return navigateTo('/')
  }
})
