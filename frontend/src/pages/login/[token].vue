<template>
  <div v-if="success">Logging in</div>
  <div v-else>
    Error
    <button @click.prevent="navigateTo('/')">Zurück</button>
  </div>
</template>

<script setup lang="ts">
const { loggedIn, fetch: refreshSession } = useUserSession()

if (loggedIn.value) {
  navigateTo('/')
}

const route = useRoute()

const success = ref(true)

onMounted(async () => {
  try {
    await $fetch('/api/redeemLoginLink', {
      method: 'POST',
      body: route.params,
    })
    await refreshSession()
    await navigateTo('/')
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
    success.value = false
  }
})
</script>
