import { computed, ref } from 'vue';
import { api, refreshSession, setUnauthorizedHandler, tokenStore } from './api';
import router from './router';
import type { CurrentUser, Permission } from './types';

const user = ref<CurrentUser | null>(null);
let restored = false;

/**
 * 頁面重新整理後記憶體中沒有 access token，用 HttpOnly cookie 中的 refresh token 換一個新的，
 * 同時取得登入者資料。每次載入頁面只嘗試一次，沒有 cookie（未登入）就留在登入頁。
 * 權限一律以後端回傳的 permissions 為準，前端不自己從 role 推算。
 */
async function restore() {
  if (restored || user.value) return;
  restored = true;
  try {
    user.value = (await refreshSession()).user;
  } catch {
    tokenStore.clear();
  }
}

async function login(username: string, password: string) {
  const res = await api.login(username, password);
  tokenStore.set(res.accessToken);
  user.value = res.user;
}

/** 修改密碼後舊 token 會失效，改用回應中的新 token，畫面才不會被登出 */
async function changeOwnPassword(currentPassword: string, newPassword: string) {
  const res = await api.changeOwnPassword(currentPassword, newPassword);
  tokenStore.set(res.accessToken);
  user.value = res.user;
}

async function logout() {
  tokenStore.clear();
  user.value = null;
  // 請後端清掉 refresh token cookie（JS 無法自己刪除 HttpOnly cookie）
  await api.logout().catch(() => {});
  router.push({ name: 'login' });
}

// access token 過期且 refresh 也失敗（帳號停用、密碼被修改、cookie 過期）→ 回到登入頁
setUnauthorizedHandler(logout);

export function useAuth() {
  return {
    user: computed(() => user.value),
    isLoggedIn: computed(() => user.value !== null),
    /**
     * 只用來決定「要不要顯示按鈕」（UX）。
     * 就算有人改掉前端程式把按鈕叫出來，後端的 PermissionsGuard 仍然會回 403。
     */
    can: (permission: Permission) =>
      user.value?.permissions.includes(permission) ?? false,
    restore,
    login,
    logout,
    changeOwnPassword,
  };
}
