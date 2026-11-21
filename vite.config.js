import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative assets let the same build run on GitHub Pages (repo subpath) or a normal host.
export default defineConfig({
  plugins: [react()],
  base: './',
});
