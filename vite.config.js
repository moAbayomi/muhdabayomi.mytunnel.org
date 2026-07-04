import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    tailwindcss(),
  ],
  server: {
    watch: {
      // Force Vite to watch your backend EJS files for changes
      ignored: ['!**/views/**/*.ejs'],
    },
  },
  build: {
    outDir: 'public',      // Write built files into public/
    emptyOutDir: false,    // Don't delete other files in public
    assetsDir: 'assets',   // Store compiled assets inside public/assets
    manifest: true,        // Generate manifest.json for server to read asset names
    rollupOptions: {
      input: [
        'src/main.js',
        'src/styles/tailwind.css'
      ]
    }
  }
});
