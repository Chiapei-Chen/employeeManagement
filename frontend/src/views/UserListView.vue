<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { api } from '../api'
import { useAuth } from '../auth'
import { describeError } from '../errors'
import { ROLE_LABELS, type ManagedUser, type Role } from '../types'

const { user: me } = useAuth()

const users = ref<ManagedUser[]>([])
const banner = ref<{ type: 'error' | 'success'; text: string } | null>(null)

async function load() {
  try {
    users.value = await api.listUsers()
  } catch (e) {
    banner.value = { type: 'error', text: describeError(e).message }
  }
}

function replace(updated: ManagedUser) {
  users.value = users.value.map((u) => (u.id === updated.id ? updated : u))
}

// ---- 查詢 ----
// 帳號數量少、API 不分頁，前端已經拿到全部帳號，所以直接在前端篩選（即時、不需要再呼叫 API）
const emptyFilters = () => ({ keyword: '', role: '', status: '' })
const filters = reactive(emptyFilters())

const filtered = computed(() => {
  const keyword = filters.keyword.trim().toLowerCase()
  return users.value.filter(
    (u) =>
      (!keyword || u.username.includes(keyword)) &&
      (!filters.role || u.role === filters.role) &&
      (!filters.status || (filters.status === 'active') === u.isActive),
  )
})

// ---- 新增帳號（彈跳視窗） ----
const emptyForm = () => ({ username: '', password: '', role: 'readonly' as Role })
const form = reactive(emptyForm())
const formErrors = ref<Record<string, string>>({})
const formMessage = ref('')
const showCreate = ref(false)
const creating = ref(false)

function openCreate() {
  Object.assign(form, emptyForm())
  formErrors.value = {}
  formMessage.value = ''
  showCreate.value = true
}

async function create() {
  // 必填欄位先在前端提示缺什麼；格式等其他規則交給後端驗證，前端只負責顯示
  const missing: Record<string, string> = {}
  if (!form.username.trim()) missing.username = '請輸入帳號'
  if (!form.password) missing.password = '請輸入初始密碼'
  formErrors.value = missing
  formMessage.value = ''
  if (Object.keys(missing).length) return

  creating.value = true
  try {
    const created = await api.createUser({ ...form })
    users.value = [...users.value, created]
    showCreate.value = false
    banner.value = { type: 'success', text: `已建立帳號 ${created.username}` }
  } catch (e) {
    const { message, fields } = describeError(e)
    formErrors.value = fields
    formMessage.value = message
  } finally {
    creating.value = false
  }
}

// ---- 修改角色 / 啟用狀態 ----
async function update(target: ManagedUser, changes: { role?: Role; isActive?: boolean }) {
  banner.value = null
  try {
    replace(await api.updateUser(target.id, changes))
  } catch (e) {
    banner.value = { type: 'error', text: describeError(e).message }
    await load() // 失敗時還原畫面上的下拉選單
  }
}

async function toggleActive(target: ManagedUser) {
  const action = target.isActive ? '停用' : '啟用'
  const note = target.isActive ? '\n停用後對方會立即被登出。' : ''
  if (!confirm(`確定要${action} ${target.username}？${note}`)) return
  await update(target, { isActive: !target.isActive })
}

// ---- 重設密碼 ----
const resetting = ref<ManagedUser | null>(null)
const newPassword = ref('')
const resetError = ref('')

function openReset(target: ManagedUser) {
  resetting.value = target
  newPassword.value = ''
  resetError.value = ''
}

async function submitReset() {
  if (!resetting.value) return
  if (!newPassword.value) {
    resetError.value = '請輸入新密碼'
    return
  }
  try {
    await api.resetUserPassword(resetting.value.id, newPassword.value)
    banner.value = {
      type: 'success',
      text: `已重設 ${resetting.value.username} 的密碼，對方需要用新密碼重新登入`,
    }
    resetting.value = null
  } catch (e) {
    const { message, fields } = describeError(e)
    resetError.value = fields.newPassword ?? message
  }
}

onMounted(load)
</script>

<template>
  <div class="page-head">
    <h1>帳號管理</h1>
    <button @click="openCreate">＋ 新增帳號</button>
  </div>

  <p v-if="banner" class="banner" :class="banner.type">{{ banner.text }}</p>

  <div class="filters card">
    <input v-model="filters.keyword" placeholder="搜尋帳號" class="grow" />
    <select v-model="filters.role">
      <option value="">全部角色</option>
      <option v-for="(label, value) in ROLE_LABELS" :key="value" :value="value">{{ label }}</option>
    </select>
    <select v-model="filters.status">
      <option value="">全部狀態</option>
      <option value="active">啟用</option>
      <option value="inactive">停用</option>
    </select>
    <button type="button" class="secondary" @click="Object.assign(filters, emptyFilters())">
      清除
    </button>
  </div>

  <div class="card table-wrap">
    <table>
      <thead>
        <tr>
          <th>帳號</th>
          <th>角色</th>
          <th>狀態</th>
          <th>密碼最後修改</th>
          <th>建立時間</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="u in filtered" :key="u.id" :class="{ inactive: !u.isActive }">
          <td>
            {{ u.username }}
            <span v-if="u.id === me?.id" class="hint">（你自己）</span>
          </td>
          <td>{{ ROLE_LABELS[u.role] }}</td>
          <td>
            <span class="status" :class="u.isActive ? 'active' : 'resigned'">
              {{ u.isActive ? '啟用' : '停用' }}
            </span>
          </td>
          <td>{{ u.passwordChangedAt ? new Date(u.passwordChangedAt).toLocaleString() : '—' }}</td>
          <td>{{ new Date(u.createdAt).toLocaleDateString() }}</td>
          <td>
            <div class="row-actions">
              <template v-if="u.id !== me?.id">
                <button class="secondary small" @click="toggleActive(u)">
                  {{ u.isActive ? '停用' : '啟用' }}
                </button>
                <button class="secondary small" @click="openReset(u)">重設密碼</button>
              </template>
              <RouterLink v-else to="/me/password">修改我的密碼</RouterLink>
            </div>
          </td>
        </tr>
        <tr v-if="users.length && !filtered.length">
          <td colspan="6" class="empty">沒有符合條件的帳號</td>
        </tr>
      </tbody>
    </table>
  </div>
  <div class="pager">
    <span>共 {{ filtered.length }} 筆<template v-if="filtered.length !== users.length">（全部 {{ users.length }} 筆）</template></span>
  </div>

  <div v-if="showCreate" class="modal-backdrop" @click.self="showCreate = false">
    <form class="modal card form single narrow" novalidate @submit.prevent="create">
      <h2>新增帳號</h2>
      <p v-if="formMessage" class="banner error">{{ formMessage }}</p>
      <label>
        <span>帳號 <span class="req">*</span></span>
        <input v-model="form.username" placeholder="例如：hr.amy" autocomplete="off" autofocus />
        <small v-if="formErrors.username" class="err">{{ formErrors.username }}</small>
        <small v-else class="hint">3~50 字元，英數字與 . _ -，建立後不可修改</small>
      </label>
      <label>
        <span>初始密碼 <span class="req">*</span></span>
        <input v-model="form.password" type="password" autocomplete="new-password" />
        <small v-if="formErrors.password" class="err">{{ formErrors.password }}</small>
        <small v-else class="hint">至少 8 字元、最多 72 bytes（約 24 個中文字），請將密碼另外告知對方</small>
      </label>
      <label>
        <span>角色 <span class="req">*</span></span>
        <select v-model="form.role">
          <option v-for="(label, value) in ROLE_LABELS" :key="value" :value="value">{{ label }}</option>
        </select>
        <small class="hint">
          {{ form.role === 'admin' ? '可以新增、修改員工，以及管理帳號' : '只能查看員工資料' }}
        </small>
      </label>
      <div class="actions">
        <button type="button" class="secondary" @click="showCreate = false">取消</button>
        <button type="submit" :disabled="creating">{{ creating ? '建立中…' : '建立' }}</button>
      </div>
    </form>
  </div>

  <div v-if="resetting" class="modal-backdrop" @click.self="resetting = null">
    <form class="modal card form single narrow" novalidate @submit.prevent="submitReset">
      <h2>重設 {{ resetting.username }} 的密碼</h2>
      <p class="hint">重設後，對方目前已登入的裝置會立即被登出。</p>
      <label>
        <span>新密碼 <span class="req">*</span></span>
        <input v-model="newPassword" type="password" autocomplete="new-password" autofocus />
        <small v-if="resetError" class="err">{{ resetError }}</small>
        <small v-else class="hint">至少 8 字元、最多 72 bytes（約 24 個中文字）</small>
      </label>
      <div class="actions">
        <button type="button" class="secondary" @click="resetting = null">取消</button>
        <button type="submit">重設</button>
      </div>
    </form>
  </div>
</template>
