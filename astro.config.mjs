import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

// Deployed to GitHub Pages under /ghc-handbook. Every internal link goes through
// `withBase()` in src/lib/paths.ts so the base path lives in exactly one place.
export default defineConfig({
  site: 'https://devnull-org.github.io',
  base: '/ghc-handbook',
  trailingSlash: 'ignore',
  integrations: [mdx()],
  markdown: {
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
      wrap: false,
    },
  },
  build: {
    // Notes are generated in bulk; inlining small assets keeps request counts sane.
    inlineStylesheets: 'auto',
  },
});
