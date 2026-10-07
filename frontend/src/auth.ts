import { computed, ref } from 'vue'
import { api, setUnauthorizedHandler, tokenStore } from './api'
import router from './router'
import type { CurrentUser, Permission } from './types'

const user = ref<CurrentUser | null>(null)

/**
 * 頁面重新整理後，用 localStorage 中的 token 呼叫 /auth/me 還原登入狀態。
 * 權限一律以後端回傳的 permissions 為準，前端不自己從 role 推算。
 */
async function restore() {
  if (!tokenStore.get() || user.value) return
  try {
    user.value = await api.me()
  } catch {
    tokenStore.clear()
  }
}

async function login(username: string, password: string) {
  const res = await api.login(username, password)
  tokenStore.set(res.accessToken)
  user.value = res.user
}

/** 修改密碼後舊 token 會失效，改用回應中的新 token，畫面才不會被登出 */
async function changeOwnPassword(currentPassword: string, newPassword: string) {
  const res = await api.changeOwnPassword(currentPassword, newPassword)
  tokenStore.set(res.accessToken)
  user.value = res.user
}

function logout() {
  tokenStore.clear()
  user.value = null
  router.push({ name: 'login' })
}

// token 過期、帳號被停用 → 任何 API 收到 401 都回到登入頁
setUnauthorizedHandler(logout)

export function useAuth() {
  return {
    user: computed(() => user.value),
    isLoggedIn: computed(() => user.value !== null),
    /**
     * 只用來決定「要不要顯示按鈕」（UX）。
     * 就算有人改掉前端程式把按鈕叫出來，後端的 PermissionsGuard 仍然會回 403。
     */
    can: (permission: Permission) => user.value?.permissions.includes(permission) ?? false,
    restore,
    login,
    logout,
    changeOwnPassword,
  }
}
