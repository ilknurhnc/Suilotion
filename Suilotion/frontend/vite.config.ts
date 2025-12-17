import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Listen on all addresses
    port: 5173,
    strictPort: false,
    proxy: {
      '/api/intra': {
        target: 'https://api.intra.42.fr',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/intra/, ''),
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            // Forward authorization header if present
            const authHeader = req.headers.authorization
            if (authHeader) {
              proxyReq.setHeader('Authorization', authHeader)
            }
            // Add any custom headers if needed
            if (req.method === 'POST' && req.url?.includes('/oauth/token')) {
              // This will be handled by the proxy
            }
          })
        },
      },
    },
  },
})
