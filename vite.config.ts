import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath, URL } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: 'src/client',
  base: '/',
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
    sourcemap: true,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
    rollupOptions: {
      input: {
        // Entry points for each page
        workflow: resolve(__dirname, 'src/client/public/js/pages/workflow.ts'),
        queue: resolve(__dirname, 'src/client/public/js/pages/queue.ts'),
        gallery: resolve(__dirname, 'src/client/public/js/pages/gallery.ts'),
        settings: resolve(__dirname, 'src/client/public/js/pages/settings.ts'),
        edit: resolve(__dirname, 'src/client/public/js/pages/edit.ts'),
        import: resolve(__dirname, 'src/client/public/js/pages/import.ts'),
        index: resolve(__dirname, 'src/client/public/js/pages/index.ts'),
        // Common modules
        common: resolve(__dirname, 'src/client/public/js/common/index.ts'),
        // CSS entries
        main: resolve(__dirname, 'src/client/public/css/main.css'),
      },
      output: {
        // Chunk splitting for better caching
        manualChunks: {
          // Vendor chunks for libraries
          vendor: ['axios'],
          // Common utilities
          utils: [
            'src/client/public/js/modules/getWorkflows.ts',
            'src/client/public/js/modules/getLocalWorkflow.ts',
            'src/client/public/js/modules/savedInputValues.ts',
          ],
          // Heavy components
          workflowEditor: ['src/client/public/js/modules/workflowEditor.ts'],
          inputRenderers: [
            'src/client/public/js/modules/inputRenderers.ts',
            'src/client/public/js/modules/workflowInputRenderer.ts',
          ],
        },
        // Hash-based file naming for caching
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
      external: [],
    },
    // Chunk size warnings
    chunkSizeWarningLimit: 1000,
  },
  server: {
    port: 3000,
    open: false,
    cors: true,
  },
  optimizeDeps: {
    include: ['axios'],
  },
  css: {
    devSourcemap: true,
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@client': resolve(__dirname, 'src/client'),
      '@': resolve(__dirname, 'src'),
    },
  },
  define: {
    __DEV__: process.env.NODE_ENV === 'development',
  },
  esbuild: {
    target: 'es2020',
    // Remove console logs in production
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
  },
  plugins: [
    // Plugins will be added here as needed
  ],
});