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

## Deploy on Cloudflare (Workers)

The site is plain static files served by Workers static assets. `wrangler.jsonc` points Cloudflare at `./dist`.

1. In Cloudflare: Workers & Pages → Create → Import a repository → pick `occuris-website`.
2. Build command: `pnpm run build`. Deploy command: `npx wrangler deploy`.
3. Advanced settings → Build variables:
   - `NODE_VERSION` = `22`
   - `PNPM_VERSION` = `11.9.0`
   - `SITE_URL` = the address people will visit, for example `https://occuris-website.YOUR-SUBDOMAIN.workers.dev` until the domain is live, then `https://occuris.ai`. It sets the canonical URL, the link-preview image, robots.txt and the sitemap.
4. Deploy. Every push to `main` redeploys.

For the custom domain: the Worker → Settings → Domains & Routes → add `occuris.ai`, then change `SITE_URL` to match and redeploy.

## Checks

With `pnpm preview` running (Playwright drives the installed Microsoft Edge):

```
node scripts/check.mjs       # behaviour checks, pass/fail
node scripts/shoot.mjs       # screenshots of each screen at 1440x900 and 390x844
node scripts/story.mjs       # screenshot of every story beat
node scripts/assets.mjs      # regenerate public/fallbacks/*.png and public/og.png
```
