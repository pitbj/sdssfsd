import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: undefined
      }
    }
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      // In dev mode, proxy /api/tokens to DEX Screener directly
      '/api/tokens': {
        target: 'https://api.dexscreener.com',
        changeOrigin: true,
        rewrite: () => '/latest/dex/search?q=TON+meme',
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.warn('[proxy] /api/tokens error, frontend will fallback:', err.message);
          });
        }
      }
    }
  }
});
