import { defineConfig } from 'astro/config';

// The canonical URL is the only place the domain appears: it feeds the
// canonical tag, og:image, robots.txt and sitemap.xml. Set SITE_URL in the
// build environment once the custom domain is live; until then the site
// lives at https://occuris.pages.dev.
export default defineConfig({
  site: process.env.SITE_URL || 'https://occuris.pages.dev',
  output: 'static',
  devToolbar: { enabled: false },
  // Pages are built as command.html etc., so /command is served directly
  // instead of redirecting to /command/ (keeps canonical URLs and links exact)
  build: { inlineStylesheets: 'always', format: 'file' },
  vite: { build: { assetsInlineLimit: 0 } },
});
