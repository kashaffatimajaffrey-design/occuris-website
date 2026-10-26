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
- `public/_headers`: Cloudflare Pages caching and security headers.

## Deploy on Cloudflare Pages

1. Push this repo to GitHub.
2. In Cloudflare: Workers & Pages → Create → Pages → Connect to Git → pick the repo.
3. Build settings:
   - Framework preset: Astro
   - Build command: `pnpm build`
   - Build output directory: `dist`
4. Environment variables (Production and Preview):
   - `NODE_VERSION` = `22`
   - `PNPM_VERSION` = `11.9.0`
   - `SITE_URL` = the address people will visit, e.g. `https://occuris-website.pages.dev` until the domain is live, then `https://occuris.ai`. It sets the canonical URL, the link-preview image, robots.txt and the sitemap.
5. Save and deploy. Every push to `main` redeploys; every pull request gets its own preview URL.

For the custom domain: Pages project → Custom domains → add `occuris.ai`, then change `SITE_URL` to match and redeploy.

## Checks

With `pnpm preview` running (Playwright drives the installed Microsoft Edge):

```
node scripts/check.mjs       # behaviour checks, pass/fail
node scripts/shoot.mjs       # screenshots of each screen at 1440x900 and 390x844
node scripts/story.mjs       # screenshot of every story beat
node scripts/assets.mjs      # regenerate public/fallbacks/*.png and public/og.png
```

## Inputs still owed

- `public/logo.svg`, `public/logo-ink.svg` are stand-ins drawn during the build. Replace with the ring from the LinkedIn logo source file.
- In `copy.ts`: the GitHub organisation URL, the company LinkedIn page URL, and LinkedIn URLs for Muntaha and Rizwan.
