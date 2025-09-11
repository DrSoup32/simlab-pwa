import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Add this line to allow network access
    proxy: {
      '/socket.io': { target: 'http://localhost:4000', ws: true },
      '/api': 'http://localhost:4000',
      '/assets': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
    }
  }
})
