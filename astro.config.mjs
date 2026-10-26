import { defineConfig } from 'astro/config';

// The canonical URL is the only place the domain appears: it feeds the
// canonical tag, og:image, robots.txt and sitemap.xml. Set SITE_URL in the
// Cloudflare Pages build settings (for example https://occuris-website.pages.dev)
// until the custom domain is live, then point it at the domain.
export default defineConfig({
  site: process.env.SITE_URL || 'https://occuris.ai',
  output: 'static',
  devToolbar: { enabled: false },
  build: { inlineStylesheets: 'always' },
  vite: { build: { assetsInlineLimit: 0 } },
});
