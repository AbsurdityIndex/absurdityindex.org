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
    votes: z.object({
      yeas: z.number(),
      nays: z.number(),
      notVoting: z.number(),
      passed: z.boolean(),
      chamber: z.enum(['house', 'senate']).optional(),
    }).optional(),
    // Omnibus bill fields
    isOmnibus: z.boolean().default(false),
    omnibusData: z.object({
      totalSpending: z.number(), // in billions
      pageCount: z.number(),
      divisions: z.array(z.object({
        title: z.string(),
        shortTitle: z.string().optional(),
        spending: z.number(), // in billions
        description: z.string().optional(),
      })),
      riders: z.array(z.object({
        title: z.string(),
        description: z.string(),
        category: z.enum(['policy', 'spending', 'tax', 'controversial', 'sneaky']).optional(),
      })).optional(),
      timeline: z.array(z.object({
        date: z.coerce.date(),
        event: z.string(),
      })).optional(),
    }).optional(),
  }),
});

// Congressional Rules packages (H.Res. 5, S.Res. 1, etc.)
const rules = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/data/rules' }),
  schema: z.object({
    title: z.string(),
    resolution: z.string(), // e.g. "H.Res. 5", "S.Res. 1"
    chamber: z.enum(['house', 'senate']),
    congressNumber: z.number(), // e.g. 119, 118
    congressYears: z.string(), // e.g. "2025-2027"
    dateAdopted: z.coerce.date(),
    summary: z.string(),
    pageCount: z.number().optional(),
    votes: z.object({
      yeas: z.number(),
      nays: z.number(),
      notVoting: z.number(),
      passed: z.boolean(),
    }).optional(),
    majorChanges: z.array(z.object({
      title: z.string(),
      description: z.string(),
      category: z.enum(['procedure', 'committee', 'floor', 'ethics', 'administrative', 'controversial']).optional(),
    })).optional(),
    notableRules: z.array(z.object({
      rule: z.string(),
      title: z.string(),
      description: z.string(),
    })).optional(),
    congressDotGovUrl: z.string().url().optional(),
    absurdityIndex: z.number().min(1).max(10).optional(),
  }),
});

export const collections = { bills, rules };
