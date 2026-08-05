import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            // Split heavy 3D/vendor libs into separate chunks so they are
            // cached independently across deploys (smaller main bundle).
            { name: 'three', test: /node_modules\/(three|three-stdlib|@react-three)\//, priority: 30 },
            { name: 'react', test: /node_modules\/(react|react-dom|scheduler)\//, priority: 20 },
            { name: 'vendor', test: /node_modules\//, priority: 10 },
          ],
        },
      },
    },
    // three.js itself is ~900 kB minified; it lives in its own cached chunk.
    chunkSizeWarningLimit: 1000,
  },
})
