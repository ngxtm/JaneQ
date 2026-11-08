import { Agent } from 'node:http'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  // PDF components render inside a worker without the browser's React Refresh runtime.
  plugins: [react({ refreshExclude: [/\/node_modules\//, /\/result-pdf\.worker\.tsx$/] })],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '^/api(?:/|$)': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        // Reuse upstream connections to avoid resets when proxying rapid local requests.
        agent: new Agent({ keepAlive: true }),
      },
    },
  },
})
