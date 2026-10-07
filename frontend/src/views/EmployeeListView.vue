<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, type EmployeeInput, type EmployeeQuery } from '../api'
import { useAuth } from '../auth'
import EmployeeForm from '../components/EmployeeForm.vue'
import { describeError } from '../errors'
import { STATUS_LABELS, type Employee, type Paginated } from '../types'

const { can } = useAuth()
const router = useRouter()

const emptyFilters = () => ({
  keyword: '',
  department: '',
  status: '',
  hireDateFrom: '',
  hireDateTo: '',
})
const filters = reactive(emptyFilters())
const paging = reactive({
  page: 1,
  pageSize: 10,
  sortBy: 'employeeNo',
  sortOrder: 'asc' as 'asc' | 'desc',
})

const result = ref<Paginated<Employee> | null>(null)
const loading = ref(false)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    const query: EmployeeQuery = { ...filters, ...paging }
    result.value = await api.listEmployees(query)
  } catch (e) {
    error.value = describeError(e).message
  } finally {
    loading.value = false
  }
}

function search() {
  paging.page = 1 // 條件改變後回到第一頁，否則可能停在不存在的頁碼
  load()
}

function reset() {
  Object.assign(filters, emptyFilters())
  search()
}

const SORTABLE = ['employeeNo', 'name', 'hireDate'] as const
function sortBy(field: (typeof SORTABLE)[number]) {
  if (paging.sortBy === field) {
    paging.sortOrder = paging.sortOrder === 'asc' ? 'desc' : 'asc'
  } else {
    paging.sortBy = field
    paging.sortOrder = 'asc'
  }
  load()
}
const sortMark = (field: string) =>
  paging.sortBy === field ? (paging.sortOrder === 'asc' ? ' ▲' : ' ▼') : ''

function goto(page: number) {
  paging.page = page
  load()
}

// ---- 新增 ----
const creating = ref(false)
const createErrors = ref<Record<string, string>>({})
const createMessage = ref('')
const submitting = ref(false)

function openCreate() {
  createErrors.value = {}
  createMessage.value = ''
  creating.value = true
}

async function create(input: EmployeeInput) {
  submitting.value = true
  createErrors.value = {}
  createMessage.value = ''
  try {
    const employee = await api.createEmployee(input)
    creating.value = false
    router.push({ name: 'employee-detail', params: { id: employee.id } })
  } catch (e) {
    const { message, fields } = describeError(e)
    createErrors.value = fields
    createMessage.value = message
  } finally {
    submitting.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="page-head">
    <h1>員工列表</h1>
    <!-- 只有具備 employee:create 權限才顯示；後端仍會再檢查一次 -->
    <button v-if="can('employee:create')" @click="openCreate">＋ 新增員工</button>
  </div>

  <form class="filters card" @submit.prevent="search">
    <input v-model="filters.keyword" placeholder="姓名 / Email / 員工編號" class="grow" />
    <input v-model="filters.department" placeholder="部門" />
    <select v-model="filters.status">
      <option value="">全部狀態</option>
      <option v-for="(label, value) in STATUS_LABELS" :key="value" :value="value">{{ label }}</option>
    </select>
    <span class="range">
      到職日 <input v-model="filters.hireDateFrom" type="date" /> ~
      <input v-model="filters.hireDateTo" type="date" />
    </span>
    <button type="submit">搜尋</button>
    <button type="button" class="secondary" @click="reset">清除</button>
  </form>

  <p v-if="error" class="banner error">{{ error }}</p>

  <div class="card table-wrap">
    <table>
      <thead>
        <tr>
          <th class="sortable" @click="sortBy('employeeNo')">員工編號{{ sortMark('employeeNo') }}</th>
          <th class="sortable" @click="sortBy('name')">姓名{{ sortMark('name') }}</th>
          <th>Email</th>
          <th>部門</th>
          <th>職稱</th>
          <th class="sortable" @click="sortBy('hireDate')">到職日{{ sortMark('hireDate') }}</th>
          <th>狀態</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="e in result?.items"
          :key="e.id"
          class="clickable"
          @click="router.push({ name: 'employee-detail', params: { id: e.id } })"
        >
          <td>{{ e.employeeNo }}</td>
          <td>{{ e.name }}</td>
          <td>{{ e.email }}</td>
          <td>{{ e.department }}</td>
          <td>{{ e.jobTitle }}</td>
          <td>{{ e.hireDate }}</td>
          <td><span class="status" :class="e.status">{{ STATUS_LABELS[e.status] }}</span></td>
        </tr>
        <tr v-if="result && result.items.length === 0">
          <td colspan="7" class="empty">沒有符合條件的員工</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div v-if="result" class="pager">
    <span>共 {{ result.meta.total }} 筆</span>
    <button class="secondary" :disabled="paging.page <= 1 || loading" @click="goto(paging.page - 1)">
      上一頁
    </button>
    <span>{{ result.meta.page }} / {{ Math.max(result.meta.totalPages, 1) }}</span>
    <button
      class="secondary"
      :disabled="paging.page >= result.meta.totalPages || loading"
      @click="goto(paging.page + 1)"
    >
      下一頁
    </button>
  </div>

  <div v-if="creating" class="modal-backdrop" @click.self="creating = false">
    <div class="modal card">
      <h2>新增員工</h2>
      <p v-if="createMessage" class="banner error">{{ createMessage }}</p>
      <EmployeeForm
        mode="create"
        :errors="createErrors"
        :submitting="submitting"
        @submit="create"
        @cancel="creating = false"
      />
    </div>
  </div>
</template>
