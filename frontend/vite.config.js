// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Behind nginx (or any reverse proxy), deep links like /project-by-status-dashboard can hit
 * Vite before SPA fallback and return HTTP 404. Rewrite HTML navigations to "/" so index.html
 * is served; the browser URL is unchanged so React Router still sees the real path.
 */
/** When the browser uses nginx (e.g. :8084) but Vite listens on :5173, HMR must use the public port or the client throws and the app never mounts. */
function deriveHmrClientPort() {
  if (process.env.VITE_HMR_CLIENT_PORT) {
    const n = parseInt(String(process.env.VITE_HMR_CLIENT_PORT), 10);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }
  const origin = process.env.VITE_DEV_PUBLIC_URL;
  if (!origin) return undefined;
  try {
    const u = new URL(origin);
    if (u.port) return parseInt(u.port, 10);
    return undefined;
  } catch {
    return undefined;
  }
}

function spaDeepLinkFallback() {
  return {
    name: 'spa-deep-link-fallback',
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();
        const raw = req.url || '/';
        const pathname = raw.split('?')[0] || '/';
        const search = raw.includes('?') ? raw.slice(raw.indexOf('?')) : '';

        if (
          pathname === '/' ||
          pathname === '/index.html' ||
          pathname.startsWith('/api') ||
          pathname.startsWith('/@') ||
          pathname.startsWith('/src') ||
          pathname.startsWith('/node_modules') ||
          pathname.startsWith('/assets') ||
          pathname.startsWith('/socket.io') ||
          pathname === '/vite.svg' ||
          pathname.startsWith('/.well-known')
        ) {
          return next();
        }
        if (/\.[a-zA-Z0-9][a-zA-Z0-9.~+-]*$/.test(pathname)) {
          return next();
        }

        req.url = `/${search}`;
        next();
      });
    },
  };
}

const hmrClientPort = deriveHmrClientPort();

export default defineConfig({
  plugins: [spaDeepLinkFallback(), react()],
  base: '/',  // Serve app from domain root
  server: {
    host: '0.0.0.0',
    port: 5173,
    // When using nginx (or similar) on another port, set VITE_DEV_PUBLIC_URL so index.html
    // references /@vite/client and modules via the browser-visible origin (fixes deep-link 404).
    ...(process.env.VITE_DEV_PUBLIC_URL
      ? { origin: process.env.VITE_DEV_PUBLIC_URL.replace(/\/$/, '') }
      : {}),
    watch: {
      usePolling: true,
      // Reduce file system events for better performance
      ignored: ['**/node_modules/**', '**/.git/**']
    },
    // Disable HMR completely if VITE_HMR_DISABLED is set; otherwise match browser-visible port when VITE_DEV_PUBLIC_URL is set (Docker + nginx).
    ...(process.env.VITE_HMR_DISABLED === 'true'
      ? { hmr: false }
      : {
          hmr: {
            overlay: false,
            ...(hmrClientPort != null ? { clientPort: hmrClientPort } : {}),
            port: 5173,
            protocol: 'ws',
            host: process.env.VITE_HMR_HOST || 'localhost',
            timeout: 3000,
          },
        }),
    proxy: {
      '/api': {
        // Must match API PORT (docker-compose sets 3002; nginx /api/ proxies to 3002).
        // In Docker frontend container, compose sets VITE_PROXY_TARGET=http://host.docker.internal:3002.
        target: process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:3002',
        changeOrigin: true,
        secure: false,
      },
      // Express serves certificate files under /uploads (same host as API). Dev SPA must proxy this too.
      '/uploads': {
        target: process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:3002',
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
