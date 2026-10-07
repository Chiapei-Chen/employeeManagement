<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import type { EmployeeInput } from '../api'
import { NEXT_STATUSES, STATUS_LABELS, type Employee } from '../types'

/**
 * 新增與修改共用的表單。
 * - create：送出全部欄位，不顯示狀態（新進員工一律在職，與後端規則一致）
 * - edit：員工編號唯讀；只送出「有變更」的欄位（對應後端 PATCH 的部分更新）
 */
const props = defineProps<{
  mode: 'create' | 'edit'
  initial?: Employee
  errors: Record<string, string>
  submitting: boolean
}>()
const emit = defineEmits<{ submit: [input: EmployeeInput]; cancel: [] }>()

function toForm(e?: Employee) {
  return {
    employeeNo: e?.employeeNo ?? '',
    name: e?.name ?? '',
    email: e?.email ?? '',
    phone: e?.phone ?? '',
    department: e?.department ?? '',
    jobTitle: e?.jobTitle ?? '',
    hireDate: e?.hireDate ?? '',
    status: e?.status ?? 'active',
    resignationDate: e?.resignationDate ?? '',
  }
}

const form = reactive(toForm(props.initial))
watch(
  () => props.initial,
  (e) => Object.assign(form, toForm(e)),
)

const statusOptions = computed(() =>
  props.initial ? NEXT_STATUSES[props.initial.status] : NEXT_STATUSES.active,
)
const isResigned = computed(() => form.status === 'resigned')

// 離開「離職」狀態時清掉離職日，避免送出後端一定會拒絕的組合
watch(isResigned, (resigned) => {
  if (!resigned) form.resignationDate = ''
})

function buildInput(): EmployeeInput {
  // 表單上的空字串代表「沒有值」，選填欄位轉成 null
  const values: EmployeeInput = {
    name: form.name,
    email: form.email,
    phone: form.phone.trim() === '' ? null : form.phone,
    department: form.department,
    jobTitle: form.jobTitle,
    hireDate: form.hireDate,
  }
  if (props.mode === 'create') {
    return { employeeNo: form.employeeNo, ...values }
  }

  Object.assign(values, {
    status: form.status,
    resignationDate: form.resignationDate === '' ? null : form.resignationDate,
  })
  const original = props.initial!
  return Object.fromEntries(
    Object.entries(values).filter(
      ([key, value]) => value !== original[key as keyof Employee],
    ),
  ) as EmployeeInput
}

const hasChanges = computed(() => props.mode === 'create' || Object.keys(buildInput()).length > 0)
</script>

<template>
  <form class="form" novalidate @submit.prevent="emit('submit', buildInput())">
    <label>
      <span>員工編號 <span class="req">*</span></span>
      <input v-model="form.employeeNo" :disabled="mode === 'edit'" placeholder="E0001" />
      <small v-if="mode === 'edit'" class="hint">建立後不可修改</small>
      <small v-if="errors.employeeNo" class="err">{{ errors.employeeNo }}</small>
    </label>
    <label>
      <span>姓名 <span class="req">*</span></span>
      <input v-model="form.name" />
      <small v-if="errors.name" class="err">{{ errors.name }}</small>
    </label>
    <label>
      <span>Email <span class="req">*</span></span>
      <input v-model="form.email" type="email" />
      <small v-if="errors.email" class="err">{{ errors.email }}</small>
    </label>
    <label>
      電話
      <input v-model="form.phone" placeholder="0912-345-678" />
      <small v-if="errors.phone" class="err">{{ errors.phone }}</small>
    </label>
    <label>
      <span>部門 <span class="req">*</span></span>
      <input v-model="form.department" />
      <small v-if="errors.department" class="err">{{ errors.department }}</small>
    </label>
    <label>
      <span>職稱 <span class="req">*</span></span>
      <input v-model="form.jobTitle" />
      <small v-if="errors.jobTitle" class="err">{{ errors.jobTitle }}</small>
    </label>
    <label>
      <span>到職日 <span class="req">*</span></span>
      <input v-model="form.hireDate" type="date" />
      <small v-if="errors.hireDate" class="err">{{ errors.hireDate }}</small>
    </label>

    <template v-if="mode === 'edit'">
      <label>
        狀態
        <select v-model="form.status" :disabled="statusOptions.length === 1">
          <option v-for="s in statusOptions" :key="s" :value="s">{{ STATUS_LABELS[s] }}</option>
        </select>
        <small v-if="statusOptions.length === 1" class="hint">已離職，無法再變更狀態</small>
        <small v-if="errors.status" class="err">{{ errors.status }}</small>
      </label>
      <label v-if="isResigned">
        <span>離職日 <span class="req">*</span></span>
        <input v-model="form.resignationDate" type="date" />
        <small v-if="errors.resignationDate" class="err">{{ errors.resignationDate }}</small>
      </label>
    </template>

    <div class="actions">
      <button type="button" class="secondary" @click="emit('cancel')">取消</button>
      <button type="submit" :disabled="submitting || !hasChanges">
        {{ submitting ? '儲存中…' : mode === 'create' ? '新增' : '儲存' }}
      </button>
    </div>
  </form>
</template>
