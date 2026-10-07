import { createRouter, createWebHistory } from 'vue-router'
import { useAuth } from './auth'
import type { Permission } from './types'
import ChangePasswordView from './views/ChangePasswordView.vue'
import EmployeeDetailView from './views/EmployeeDetailView.vue'
import EmployeeListView from './views/EmployeeListView.vue'
import LoginView from './views/LoginView.vue'
import UserListView from './views/UserListView.vue'

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean
    /** 進入此頁需要的權限；沒有權限就導回員工列表（後端仍會再檢查一次） */
    permission?: Permission
  }
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/employees' },
    { path: '/login', name: 'login', component: LoginView, meta: { public: true } },
    { path: '/employees', name: 'employee-list', component: EmployeeListView },
    {
      path: '/employees/:id',
      name: 'employee-detail',
      component: EmployeeDetailView,
      props: (route) => ({ id: Number(route.params.id) }),
    },
    {
      path: '/users',
      name: 'user-list',
      component: UserListView,
      meta: { permission: 'user:manage' },
    },
    { path: '/me/password', name: 'change-password', component: ChangePasswordView },
  ],
})

// 與後端相同的思路：預設需要登入，只有標記 public 的頁面例外
router.beforeEach(async (to) => {
  const auth = useAuth()
  await auth.restore()
  if (!to.meta.public && !auth.isLoggedIn.value) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.name === 'login' && auth.isLoggedIn.value) return { name: 'employee-list' }
  if (to.meta.permission && !auth.can(to.meta.permission)) return { name: 'employee-list' }
})

export default router
