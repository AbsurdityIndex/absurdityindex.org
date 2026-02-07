// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'static',
  outDir: '../dist/dashboard-ui',
  vite: {
    plugins: [tailwindcss()],
    server: {
      proxy: {
        '/api': process.env.DASHBOARD_API_ORIGIN ?? 'http://127.0.0.1:3847',
      },
    },
  },
});
