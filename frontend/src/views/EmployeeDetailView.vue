<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api, type EmployeeInput } from '../api'
import { useAuth } from '../auth'
import EmployeeForm from '../components/EmployeeForm.vue'
import { describeError } from '../errors'
import { STATUS_LABELS, type Employee } from '../types'

const props = defineProps<{ id: number }>()
const { can } = useAuth()

const employee = ref<Employee | null>(null)
const loadError = ref('')
const editing = ref(false)
const saving = ref(false)
const saved = ref(false)
const formErrors = ref<Record<string, string>>({})
const message = ref('')
const conflict = ref(false)

async function load() {
  loadError.value = ''
  try {
    employee.value = await api.getEmployee(props.id)
  } catch (e) {
    loadError.value = describeError(e).message
  }
}

function startEdit() {
  formErrors.value = {}
  message.value = ''
  conflict.value = false
  saved.value = false
  editing.value = true
}

async function save(changes: EmployeeInput) {
  if (!employee.value) return
  saving.value = true
  formErrors.value = {}
  message.value = ''
  try {
    // 帶上讀取時拿到的 version：如果有人在這段期間改過，後端會回 409
    employee.value = await api.updateEmployee(props.id, {
      ...changes,
      version: employee.value.version,
    })
    editing.value = false
    saved.value = true
  } catch (e) {
    const { message: msg, fields, code } = describeError(e)
    message.value = msg
    formErrors.value = fields
    conflict.value = code === 'EMPLOYEE_VERSION_CONFLICT'
  } finally {
    saving.value = false
  }
}

/** 版本衝突時：取得最新資料，讓使用者看過別人的修改之後再決定要不要重新編輯 */
async function reloadAfterConflict() {
  await load()
  editing.value = false
  conflict.value = false
  message.value = ''
}

onMounted(load)
</script>

<template>
  <RouterLink to="/employees" class="back">← 回到列表</RouterLink>

  <p v-if="loadError" class="banner error">{{ loadError }}</p>

  <template v-if="employee">
    <div class="page-head">
      <h1>
        {{ employee.name }}
        <span class="status" :class="employee.status">{{ STATUS_LABELS[employee.status] }}</span>
      </h1>
      <button v-if="can('employee:update') && !editing" @click="startEdit">編輯</button>
    </div>

    <p v-if="saved" class="banner success">已儲存</p>

    <div v-if="editing" class="card">
      <div v-if="message" class="banner error">
        {{ message }}
        <button v-if="conflict" class="link" @click="reloadAfterConflict">載入最新資料</button>
      </div>
      <EmployeeForm
        mode="edit"
        :initial="employee"
        :errors="formErrors"
        :submitting="saving"
        @submit="save"
        @cancel="editing = false"
      />
    </div>

    <dl v-else class="card details">
      <dt>員工編號</dt><dd>{{ employee.employeeNo }}</dd>
      <dt>Email</dt><dd>{{ employee.email }}</dd>
      <dt>電話</dt><dd>{{ employee.phone ?? '—' }}</dd>
      <dt>部門</dt><dd>{{ employee.department }}</dd>
      <dt>職稱</dt><dd>{{ employee.jobTitle }}</dd>
      <dt>到職日</dt><dd>{{ employee.hireDate }}</dd>
      <dt>離職日</dt><dd>{{ employee.resignationDate ?? '—' }}</dd>
      <dt>資料版本</dt><dd>v{{ employee.version }}・最後更新 {{ new Date(employee.updatedAt).toLocaleString() }}</dd>
    </dl>

    <p v-if="!can('employee:update')" class="hint">你的帳號是唯讀權限，只能檢視資料。</p>
  </template>
</template>
