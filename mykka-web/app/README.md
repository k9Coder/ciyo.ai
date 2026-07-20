---
status: active
owner: mykka.ai marketing engineering
verified_at: 2026-06-13
sources:
  - layout.tsx
  - page.tsx
  - sitemap.ts
  - robots.ts
  - "blog/[slug]/page.tsx"
  - "solutions/[industry]/page.tsx"
  - ../lib/posts.ts
  - ../components/layout/Header.tsx
  - ../components/layout/Footer.tsx
---

# Marketing Route and Content Reference

The `app/` directory owns public pages, route metadata, sitemap generation, robots configuration, and shared root layout composition.

## Route map

| Route | Source | Notes |
|---|---|---|
| `/` | `page.tsx` | Homepage sections and primary onboarding CTA. |
| `/product` | `product/page.tsx` | Product narrative; screenshot panels are placeholders. |
| `/pricing` | `pricing/page.tsx`, `pricing/PricingClient.tsx` | Client-side monthly/annual price toggle and plan claims. |
| `/solutions` | `solutions/page.tsx` | Links to four supported industry slugs. |
| `/solutions/[industry]` | `solutions/[industry]/page.tsx` | Static params: `healthcare`, `legal`, `fintech`, `engineering`; unknown slugs return 404. |
| `/security` | `security/page.tsx` | Security, compliance, data handling, and response-time claims. |
| `/about` | `about/page.tsx` | Company narrative and contact. |
| `/blog` | `blog/page.tsx` | Lists posts from `lib/posts.ts`, newest first. |
| `/blog/[slug]` | `blog/[slug]/page.tsx` | Static params from `lib/posts.ts`; unknown slugs return 404. |
| `/privacy` | `privacy/page.tsx` | Privacy-policy content. |
| `/terms` | `terms/page.tsx` | Terms-of-service content. |
| `/accessibility` | `accessibility/page.tsx` | Hebrew and English accessibility statement. |
| `/robots.txt` | `robots.ts` | Allows all user agents and points to the sitemap. |
| `/sitemap.xml` | `sitemap.ts` | Static route list plus every blog post. |

There is no `/changelog` route even though the footer links to it.

## Shared layout and navigation

`layout.tsx` applies the Inter font, global metadata defaults, `Header`, and `Footer`. The header exposes Product, Pricing, Solutions, Security, Blog, sign-in, and onboarding links. The footer adds company, legal, documentation, and solution links.

`lib/config.ts` is the canonical source for the app/console origin. It reads `NEXT_PUBLIC_APP_URL` and defaults to `https://app.mykka.ai`.

## Dynamic content

Industry solution content is defined inline in `solutions/[industry]/page.tsx`. Adding an industry requires updating:

1. the `INDUSTRIES` object;
2. the `/solutions` listing;
3. `sitemap.ts`; and
4. claim evidence in [../CONTENT_CLAIMS.md](../CONTENT_CLAIMS.md).

Blog content is defined in `lib/posts.ts`. Adding a post automatically adds its dynamic page and sitemap entry. The renderer recognizes only `## ` headings and `---` dividers; other Markdown syntax is rendered as paragraph text after bold markers are stripped.

## Metadata and discovery

The root metadata base is `https://mykka.ai`. Pages define their own title and description where needed. `sitemap.ts` contains manually maintained last-modified dates for static pages and uses each post date for blog pages.

When changing page content materially, update the corresponding sitemap date. When changing a claim, update [../CONTENT_CLAIMS.md](../CONTENT_CLAIMS.md) before publication.
