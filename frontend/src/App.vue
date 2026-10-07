<script setup lang="ts">
import { useAuth } from './auth'
import { ROLE_LABELS } from './types'

const { user, can, logout } = useAuth()
</script>

<template>
  <header class="topbar">
    <nav class="nav">
      <RouterLink to="/employees" class="brand">員工資料管理</RouterLink>
      <template v-if="user">
        <RouterLink to="/employees">員工</RouterLink>
        <!-- 只有具備 user:manage 的人看得到；後端仍會再檢查一次 -->
        <RouterLink v-if="can('user:manage')" to="/users">帳號管理</RouterLink>
      </template>
    </nav>
    <div v-if="user" class="who">
      <span>{{ user.username }}</span>
      <span class="badge" :class="user.role">{{ ROLE_LABELS[user.role] }}</span>
      <RouterLink to="/me/password">修改密碼</RouterLink>
      <button class="link" @click="logout">登出</button>
    </div>
  </header>
  <main class="container">
    <RouterView />
  </main>
</template>
