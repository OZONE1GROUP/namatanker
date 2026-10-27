import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

// Deliberately separate from vite.config.ts (used only by `vitest`, never by
// `npm run dev`/`npm run build`) so adding the test setup can never affect the
// app's own dev server or production build. Vitest does not auto-merge a
// sibling vite.config.ts's plugins/alias when a dedicated vitest.config.ts is
// present, so the React plugin and the "@" alias are repeated here.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
