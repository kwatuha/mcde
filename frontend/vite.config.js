// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/',  // Serve app from domain root
  server: {
    host: '0.0.0.0',
    port: 5173,
    watch: {
      usePolling: true,
      // Reduce file system events for better performance
      ignored: ['**/node_modules/**', '**/.git/**']
    },
    hmr: {
      // Disable HMR overlay for production-like deployments to prevent errors
      overlay: false,
      // Use the external port when accessed from outside
      clientPort: process.env.VITE_HMR_CLIENT_PORT || 5176,
      port: 5173,
      protocol: 'ws',
      host: process.env.VITE_HMR_HOST || 'localhost',
      // Timeout faster so it doesn't block the app
      timeout: 3000
    },
    // Disable HMR completely if VITE_HMR_DISABLED is set
    ...(process.env.VITE_HMR_DISABLED === 'true' ? { hmr: false } : {}),
    proxy: {
      '/api': {
        // In Docker: use service name 'api'
        // Outside Docker: use 'localhost'
        // Override with VITE_PROXY_TARGET env var if needed
        target: process.env.VITE_PROXY_TARGET || 'http://api:3000',
        changeOrigin: true,
        secure: false,
      },
    },
    // Performance optimizations
    fs: {
      // Allow serving files from one level up to the project root
      strict: false
    }
  },
  resolve: {
    alias: {
      // Keep other aliases if you have them, e.g.:
      // 'src': '/src',
    },
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      '@mui/material',
      '@mui/icons-material',
      '@emotion/react',
      '@emotion/styled',
      'react-router-dom',
      'socket.io-client',
      'axios',
      'chart.js',
      'react-chartjs-2',
      'recharts'
    ],
    // Remove force: true to use cached deps (faster)
    // Keep dependencies pre-bundled for faster dev server startup
    force: false,
    esbuildOptions: {
      // Optimize bundle size
      target: 'es2020'
    }
  },
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          // Core dependencies
          vendor: ['react', 'react-dom'],
          mui: ['@mui/material', '@mui/icons-material', '@emotion/react', '@emotion/styled'],
          router: ['react-router-dom'],
          
          // Heavy libraries split separately (excluding problematic ArcGIS)
          charts: ['chart.js', 'react-chartjs-2', 'recharts', '@nivo/bar', '@nivo/line', '@nivo/pie', '@nivo/geo', '@nivo/core'],
          maps: ['leaflet', 'react-leaflet'],
          socket: ['socket.io-client'],
          
          // Data grid and utilities
          datagrid: ['@mui/x-data-grid'],
          utils: ['axios', 'jwt-decode', 'sweetalert2', 'xlsx']
        }
      }
    },
    chunkSizeWarningLimit: 1500,
    // Reduce bundle size
    reportCompressedSize: false,
    // Optimize chunk splitting
    assetsInlineLimit: 4096
  }
});
