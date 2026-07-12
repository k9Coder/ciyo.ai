import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin, loadEnv } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // Bake API URL + Clerk key into the main-process bundle: a packaged app has
  // no real env vars, so plain runtime process.env reads would silently fall
  // back to defaults (this was a latent bug — CI build env had no effect).
  // Precedence: real process env (CI secrets) > .env / .env.[mode] files.
  const fileEnv = loadEnv(mode, __dirname, '')
  const baked = (key: string) => {
    const v = process.env[key] ?? fileEnv[key]
    return v ? JSON.stringify(v) : 'undefined'
  }

  return {
    main: {
      plugins: [externalizeDepsPlugin()],
      define: {
        'process.env.CIYO_API_URL': baked('CIYO_API_URL'),
        'process.env.CLERK_PUBLISHABLE_KEY': baked('CLERK_PUBLISHABLE_KEY'),
      },
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
        // main and preload share this outDir — don't let the preload build
        // (which runs second) delete the freshly written main.js.
        emptyOutDir: false,
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
  }
})
