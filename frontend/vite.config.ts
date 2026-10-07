import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    // 開發時把 /api 轉給 Nest，前端就不用處理跨域，也不用寫死後端網址
    proxy: { '/api': 'http://localhost:3000' },
  },
})
