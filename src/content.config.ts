import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const bills = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/data/bills' }),
  schema: z.object({
    title: z.string(),
    billNumber: z.string(), // e.g. "H.R. 404", "S. 042", "R.A. 001"
    billType: z.enum(['sensible', 'absurd', 'real']),
    category: z.string(),
    tags: z.array(z.string()).default([]),
    sponsor: z.string(), // e.g. "Rep. I.M. Kidding (D-Narnia)" or real sponsor
    cosponsors: z.array(z.string()).default([]),
    committee: z.string(),
    status: z.string(),
    dateIntroduced: z.coerce.date(),
    dateUpdated: z.coerce.date().optional(),
    summary: z.string(),
    featured: z.boolean().default(false),
    image: z.string().optional(),
    // Real Absurdity extras (legacy)
    realSource: z.string().optional(),
    realJurisdiction: z.string().optional(),
    // Real bill fields
    absurdityIndex: z.number().min(1).max(10).optional(),
    congressDotGovUrl: z.string().url().optional(),
    congressNumber: z.number().optional(),
    excerpt: z.string().optional(),
    pairedBillId: z.string().optional(),
  }),
});

export const collections = { bills };
