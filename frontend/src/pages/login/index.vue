<template>
  <div v-if="requestedLogin">
    Wir haben dir eine E-mail gesendet. Bitte habe ein wenig Geduld und prüfe auch dein Spam-Ordner!
    <button @click.prevent="showLogin">Zurück</button>
  </div>
  <div v-else>
    <form @submit.prevent="requestLoginLink">
      <input v-model="credentials.email" type="email" placeholder="Email" required />
      <button type="submit">Login</button>
    </form>
  </div>
</template>

<script setup lang="ts">
const { loggedIn } = useUserSession()

if (loggedIn.value) {
  navigateTo('/')
}

const requestedLogin = ref(false)

const credentials = reactive({
  email: '',
})

async function requestLoginLink() {
  await $fetch('/api/requestLoginLink', {
    method: 'POST',
    body: credentials,
  })
  requestedLogin.value = true
}

async function showLogin() {
  requestedLogin.value = false
}
</script>
