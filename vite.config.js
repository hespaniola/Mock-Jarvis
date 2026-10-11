import { defineConfig } from 'vite';

// three.js alone is ~600 kB minified; that's expected for this page.
export default defineConfig({
  build: { chunkSizeWarningLimit: 900 },
});
