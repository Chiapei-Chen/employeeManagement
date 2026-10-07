<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useAuth } from '../auth'
import { describeError } from '../errors'

const auth = useAuth()

const form = reactive({ currentPassword: '', newPassword: '', confirmPassword: '' })
const errors = ref<Record<string, string>>({})
const message = ref('')
const done = ref(false)
const submitting = ref(false)

// 「再輸入一次」只是防止打錯字的 UX，所以只在前端檢查，不送到後端
const mismatch = computed(
  () => form.confirmPassword !== '' && form.confirmPassword !== form.newPassword,
)

async function submit() {
  if (mismatch.value) return
  submitting.value = true
  errors.value = {}
  message.value = ''
  done.value = false
  try {
    await auth.changeOwnPassword(form.currentPassword, form.newPassword)
    Object.assign(form, { currentPassword: '', newPassword: '', confirmPassword: '' })
    done.value = true
  } catch (e) {
    const { message: msg, fields } = describeError(e)
    errors.value = fields
    message.value = msg
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="card narrow-page">
    <h1>修改密碼</h1>
    <p class="hint">修改後，你在其他裝置上的登入會失效；目前這個畫面會維持登入。</p>

    <p v-if="done" class="banner success">密碼已更新</p>
    <p v-if="message" class="banner error">{{ message }}</p>

    <form class="form single" novalidate @submit.prevent="submit">
      <label>
        <span>目前的密碼 <span class="req">*</span></span>
        <input v-model="form.currentPassword" type="password" autocomplete="current-password" />
        <small v-if="errors.currentPassword" class="err">{{ errors.currentPassword }}</small>
      </label>
      <label>
        <span>新密碼 <span class="req">*</span></span>
        <input v-model="form.newPassword" type="password" autocomplete="new-password" />
        <small v-if="errors.newPassword" class="err">{{ errors.newPassword }}</small>
        <small v-else class="hint">至少 8 字元、最多 72 bytes（約 24 個中文字）</small>
      </label>
      <label>
        <span>再輸入一次新密碼 <span class="req">*</span></span>
        <input v-model="form.confirmPassword" type="password" autocomplete="new-password" />
        <small v-if="mismatch" class="err">兩次輸入的新密碼不一致</small>
      </label>
      <div class="actions">
        <button
          type="submit"
          :disabled="
            submitting || !form.currentPassword || !form.newPassword || !form.confirmPassword || mismatch
          "
        >
          {{ submitting ? '更新中…' : '更新密碼' }}
        </button>
      </div>
    </form>
  </div>
</template>
