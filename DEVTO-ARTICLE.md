# Building a Congressional Satire Site with Astro 5, Tailwind CSS v4, and Cloudflare Pages

> **Status:** Draft for dev.to publication. Cross-post to Hashnode.

---

## dev.to front matter

```yaml
---
title: "Building a Congressional Satire Site with Astro 5, Tailwind CSS v4, and Cloudflare Pages"
published: false
description: "How I built absurdityindex.org — a site that scores real federal legislation on a 1-10 absurdity scale — using Astro 5 content collections, Zod schema validation, and Cloudflare Pages + Workers."
tags: astro, tailwindcss, cloudflare, webdev
cover_image: https://absurdityindex.org/og/index.png
canonical_url: https://absurdityindex.org
---
```

---

## Article Body

Did you know Congress once spent federal research money studying the effects of methamphetamine on zebrafish? Or that pizza was officially classified as a vegetable for school lunch purposes? These aren't jokes — they're real legislation.

I built [Absurdity Index](https://absurdityindex.org) to score real federal bills on a 1-10 absurdity scale and pair them with satirical "Not Bills" — fictional legislation so reasonable that no actual Congress would ever pass it. Here's how the tech stack came together.

## The Stack

- **Astro 5** — Static site generation with content collections
- **Tailwind CSS v4** — Styling with a custom government-parody theme
- **MDX** — Content authoring (60+ bills with rich frontmatter)
- **Zod** — Schema validation for bill data at build time
- **Cloudflare Pages** — Hosting with near-instant global delivery
- **Cloudflare Workers** — Dynamic JSON API endpoints
- **Pagefind** — Client-side full-text search (zero server cost)

## Content Collections: The Heart of the Site

Every bill — real or satirical — lives as an MDX file in `src/data/bills/`. Astro 5's content collections with the `glob` loader made this incredibly clean:

```typescript
// src/content.config.ts
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const bills = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/data/bills' }),
  schema: baseBillSchema.extend({
    // Real bill fields
    sponsorParty: z.string().optional(),
    sponsorState: z.string().optional(),
    absurdityIndex: z.number().min(1).max(10).optional(),
    congressDotGovUrl: z.string().url().optional(),
    // ... more fields
  })
  .refine((data) => {
    if (data.billType === 'real') {
      return (
        data.sponsorParty !== undefined &&
        data.sponsorState !== undefined &&
        data.congressNumber !== undefined
      );
    }
    return true;
  }, {
    message: 'Real bills require sponsorParty, sponsorState, and congressNumber'
  }),
});
```

The `.refine()` at the end is key — it enforces that real bills have congressional metadata while satirical bills don't need it. If someone adds a real bill without a sponsor party, the build fails with a clear error. This catches mistakes before they reach production.

### What a Bill Looks Like

Here's a simplified version of a real bill's frontmatter:

```yaml
---
title: "FairTax Act of 2025"
subtitle: "14 Congresses, Zero Floor Votes, One Dream"
billNumber: "H.R. 25"
billType: "real"
category: "Budget"
tags: ["taxes", "irs", "fair tax"]

sponsor: "Rep. Buddy Carter"
sponsorParty: "R"
sponsorState: "GA"

committee: "House Committee on Ways and Means"
status: "Referred to Committee"
dateIntroduced: 2025-01-03

summary: "Abolishes the IRS entirely and replaces the entire
federal tax system with a single 23% national sales tax."

absurdityIndex: 8
congressNumber: 119
congressDotGovUrl: "https://www.congress.gov/bill/119th-congress/house-bill/25"
---

## The Gist

The FairTax has been introduced in **every single Congress** since the
106th (1999). That's 14 consecutive sessions...
```

The MDX body below the frontmatter contains the editorial commentary — rendered as rich HTML with links, emphasis, and embedded components. Astro 5's `render()` function handles this beautifully:

```typescript
import { render } from 'astro:content';

const { Content } = await render(entry);
```

One gotcha I hit early: in Astro 5, you use `render(entry)` imported from `astro:content`, not `entry.render()`. The old method from Astro 4 doesn't work anymore.

## Bill Evolution Tracking

One of the more complex schemas tracks how bills change as they move through Congress. Each bill can have evolution stages:

```typescript
const billEvolutionStageSchema = z.object({
  stage: z.enum([
    'introduced',
    'origin-committee',
    'origin-passed',
    'receiving-committee',
    'receiving-amended',
    'conference-requested',
    'signed',
    'became-law',
    // ... 25+ stages total
  ]),
  date: z.coerce.date(),
  paraphrasedText: z.string(),
  cumulativePork: z.number(),
  porkAddedThisStage: z.number(),
  keyChanges: z.array(z.string()),
  vote: stageVoteSchema.optional(),
});
```

The stage names are chamber-agnostic — "origin" means whichever chamber introduced the bill, "receiving" means the other one. This avoids duplicating stages for House-originated vs. Senate-originated bills.

## Tailwind CSS v4: The Theme System

Tailwind v4 changed how you define custom themes. Instead of a `tailwind.config.js`, everything lives in your CSS file with the `@theme` directive:

```css
@import 'tailwindcss';

@theme {
  /* Government Parody Colors */
  --color-navy-900: #0a1628;
  --color-navy-800: #121f36;
  --color-gold-500: #c5a572;
  --color-gold-300: #e8d5b0;
  --color-cream-100: #faf7f0;
  --color-parchment: #f5f0e1;

  /* Typography */
  --font-serif: 'Libre Caslon Text', 'Georgia', serif;
  --font-sans: 'Inter', 'system-ui', sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
}
```

Then you use the custom colors throughout your templates with the standard Tailwind utility classes — `bg-parchment`, `text-navy-900`, `border-gold-300`, etc. The government-parody aesthetic (navy, gold, cream, parchment) gives the site a feel of official gravitas that contrasts with the satirical content.

With Astro 5, you wire Tailwind v4 through the Vite plugin:

```javascript
// astro.config.mjs
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  vite: {
    plugins: [tailwindcss()],
  },
});
```

No `@astrojs/tailwind` integration needed — the Vite plugin is the v4 way.

## Cloudflare Pages + Workers: Free Hosting with an API

The site is statically generated and deployed to Cloudflare Pages. But I also needed a JSON API for the embed widget and programmatic access. Cloudflare Pages Functions (backed by Workers) handle this perfectly.

API endpoints live in `functions/api/`:

```
functions/
  _middleware.js      # CORS headers, security
  api/
    today.json.js     # Dynamic "today" endpoint
    today-generate-satire.json.js
```

The static JSON APIs (`/api/bills.json`, `/api/stats.json`, etc.) are generated at build time by Astro and served as static files. The Workers-based endpoints handle anything that needs server-side logic.

The deployment pipeline runs on self-hosted Kubernetes using Argo Workflows, polling the Git repository every 60 seconds. On every push to `main`, the pipeline runs validation, builds the site, indexes search, and deploys to Cloudflare Pages.

## Pagefind: Zero-Cost Client-Side Search

One of my favorite parts of the stack is [Pagefind](https://pagefind.app/). After Astro builds the static site, Pagefind indexes it:

```bash
astro build && npx pagefind --site dist
```

Pagefind generates a tiny WASM search engine and a compressed index. Search happens entirely in the browser — no server, no API calls, no Algolia bill. For a 60+ bill site, the index is small enough that it loads near-instantly.

## The Public API

Every bill is available as JSON. The endpoints:

| Endpoint | Description |
|----------|-------------|
| `/api/bills.json` | All bills with full metadata |
| `/api/real-bills.json` | Real legislation with absurdity scores |
| `/api/not-bills.json` | Satirical bills only |
| `/api/stats.json` | Aggregate statistics |
| `/api/bills/{id}.json` | Individual bill by ID |

There's also an embed widget — a single `<script>` tag that renders an interactive bill card on any website:

```html
<script
  src="https://absurdityindex.org/embed.js"
  data-bill="real-hr-25"
></script>
```

## Build-Time Validation

One thing I'm proud of is the validation pipeline. Before anything deploys, multiple checks run:

1. **Zod schema validation** — Every bill's frontmatter is validated against the schema
2. **Bill-type refinements** — Real bills must have congressional metadata
3. **Icon checks** — No Unicode emoji allowed (we use Lucide icons)
4. **innerHTML checks** — Security scan for XSS vectors
5. **Secret scanning** — No API keys or credentials in the codebase
6. **ESLint + Prettier** — Code quality and formatting
7. **TypeScript checking** — Full type safety

If any check fails, the build stops. This is especially important when you have 60+ content files with complex frontmatter — one typo in a date format or a missing required field would otherwise silently produce a broken page.

## What I'd Do Differently

1. **Start with Zod refinements earlier.** I added the bill-type validation refinement after discovering that several bills had been committed with missing fields. Build-time schema validation is worth setting up on day one.

2. **Use `z.coerce.date()` from the start.** YAML dates can be tricky — `2025-01-01` in YAML is a date, but `2025-01-01T12:00:00` is a string. Using `z.coerce.date()` in the Zod schema handles both formats gracefully.

3. **Plan the content collection schema for extensibility.** The bill schema grew organically to support bill evolution tracking, pork barrel itemization, amendment tracking, and committee details. A more deliberate upfront design would have saved some refactoring.

## Try It Out

- **Site:** [absurdityindex.org](https://absurdityindex.org)
- **API:** [absurdityindex.org/api/bills.json](https://absurdityindex.org/api/bills.json)
- **Scoring methodology:** [absurdityindex.org/how-we-score](https://absurdityindex.org/how-we-score/)
- **Quiz — Real or Satire?:** [absurdityindex.org/quiz](https://absurdityindex.org/quiz/)
- **Embed widget docs:** [absurdityindex.org/embed](https://absurdityindex.org/embed/)

The project is open source under the MIT License. If you're building civic tech with Astro, I'd love to hear about it.

---

*Tags: #astro #tailwindcss #cloudflare #webdev #civictech #javascript*
