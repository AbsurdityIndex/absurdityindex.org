// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import rehypeExternalLinks from 'rehype-external-links';

export default defineConfig({
  site: 'https://absurdityindex.org',
  integrations: [
    mdx(),
    sitemap({
      // Internal search pages aren't useful for indexing and are typically noindexed.
      filter: (page) => new URL(page).pathname !== '/search/',
    }),
  ],
  markdown: {
    rehypePlugins: [[rehypeExternalLinks, { target: '_blank', rel: ['noopener', 'noreferrer'] }]],
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
