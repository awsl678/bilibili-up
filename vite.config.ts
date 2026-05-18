import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import path from 'path'
import fs from 'fs'

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron', 'sql.js'],
              output: { format: 'cjs' },
            },
          },
          plugins: [
            {
              name: 'copy-wasm',
              writeBundle() {
                const src = path.resolve(__dirname, 'node_modules/sql.js/dist/sql-wasm.wasm')
                const dest = path.resolve(__dirname, 'dist-electron/sql-wasm.wasm')
                if (fs.existsSync(src)) {
                  fs.copyFileSync(src, dest)
                  console.log('sql-wasm.wasm 已复制到 dist-electron')
                }
              },
            },
          ],
        },
      },
      {
        entry: 'electron/preload.ts',
        onstart(options) { options.reload() },
      },
    ]),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
})