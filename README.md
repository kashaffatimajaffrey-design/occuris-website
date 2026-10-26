# Occuris AI company site

One page, built with Astro 5. The brief (the PRD) is kept out of the repo because it holds internal details.

```
pnpm install
pnpm dev        # http://localhost:4321
pnpm build && pnpm preview   # http://localhost:4322
```

## Where things live

- `src/content/copy.ts`: every word on the page, plus the email, office and links. Lines marked `DRAFT` were written during the build and need a human to confirm. Empty links (GitHub, company LinkedIn) are hidden until filled in.
- `src/content/sample-rows.ts`: the eight Occuralog rows.
- `src/world/`: the illustrated pieces, all 2D canvas or SVG, no dependencies
  - `iso.ts`: isometric drawing kit
  - `map.ts`: the living map (hero and the "one day in Karachi" story)
  - `flow.ts`: the Command flow diagram
  - `building.ts`: the Private-by-design building
- `src/physics/flowfield.ts`: the Occuralog particles that become the table
- `src/styles/tokens.css`: colours, type, spacing. No hex values anywhere else in the CSS.
- `public/_headers`: caching and security headers, honoured by Cloudflare.

## Deploy

The live site is the Cloudflare Pages project `occuris`: **https://occuris.pages.dev**. It is deployed from a computer, not built by Cloudflare from GitHub:

```
npx wrangler login     # once per computer
pnpm run deploy        # builds, then uploads dist/ to occuris.pages.dev
```

`SITE_URL` sets the canonical URL, the link-preview image, robots.txt and the sitemap. It defaults to `https://occuris.pages.dev`; once a custom domain is attached (Pages project → Custom domains), build with `SITE_URL=https://your-domain` or change the default in `astro.config.mjs`.

`wrangler.jsonc` is for the separate Worker copy (`occuris-website.kash-fatima7.workers.dev`), which serves the same files with Workers static assets.

## Checks

With `pnpm preview` running (Playwright drives the installed Microsoft Edge):

```
node scripts/check.mjs       # behaviour checks, pass/fail
node scripts/shoot.mjs       # screenshots of each screen at 1440x900 and 390x844
node scripts/story.mjs       # screenshot of every story beat
node scripts/assets.mjs      # regenerate public/fallbacks/*.png and public/og.png
```
