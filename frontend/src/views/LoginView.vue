<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '../auth'
import { describeError } from '../errors'

const auth = useAuth()
const router = useRouter()
const route = useRoute()

const username = ref('')
const password = ref('')
const error = ref('')
const submitting = ref(false)

async function submit() {
  error.value = ''
  submitting.value = true
  try {
    await auth.login(username.value, password.value)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/employees'
    router.push(redirect)
  } catch (e) {
    error.value = describeError(e).message
  } finally {
    submitting.value = false
  }
}

function fill(u: string, p: string) {
  username.value = u
  password.value = p
}
</script>

<template>
  <div class="login card">
    <h1>登入</h1>
    <form class="form single" @submit.prevent="submit">
      <label>帳號 <input v-model="username" autocomplete="username" autofocus /></label>
      <label>
        密碼 <input v-model="password" type="password" autocomplete="current-password" />
      </label>
      <p v-if="error" class="banner error">{{ error }}</p>
      <button type="submit" :disabled="submitting || !username || !password">
        {{ submitting ? '登入中…' : '登入' }}
      </button>
    </form>

    <div class="demo">
      <p>展示帳號（點一下自動填入）：</p>
      <button class="link" @click="fill('admin', 'Admin@123')">admin / Admin@123（管理者）</button>
      <button class="link" @click="fill('viewer', 'Viewer@123')">viewer / Viewer@123（唯讀）</button>
    </div>
  </div>
</template>
