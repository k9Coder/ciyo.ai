import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist-electron',
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'electron/main.ts'),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist-electron',
      rollupOptions: {
        input: {
          preload: resolve(__dirname, 'electron/preload.ts'),
        },
      },
    },
  },
  renderer: {
    root: 'renderer',
    build: {
      outDir: 'dist/renderer',
      rollupOptions: {
        input: {
          'tray-ui': resolve(__dirname, 'renderer/tray-ui/index.html'),
          'decision-ui': resolve(__dirname, 'renderer/decision-ui/index.html'),
        },
      },
    },
    plugins: [react()],
  },
})
