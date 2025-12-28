import { defineConfig } from 'vite'
import react from '@vitejs/react-refresh'

export default defineConfig({
  plugins: [react()],
  base: '/khan3.0/', // This must match your repo name exactly
})
