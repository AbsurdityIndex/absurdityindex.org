import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Shared schemas for bill-related data
const actionSchema = z.object({
  date: z.coerce.date(),
  text: z.string(),
  chamber: z.enum(['house', 'senate', 'both']).optional(),
  type: z.string().optional(), // e.g., "IntroReferral", "Committee", "Floor"
});

const titleSchema = z.object({
  title: z.string(),
  type: z.enum(['official', 'short', 'popular', 'display']),
  chamber: z.enum(['house', 'senate']).optional(),
});

// Sponsor schema for detailed attribution
const porkSponsorSchema = z.object({
  name: z.string(),
  party: z.enum(['R', 'D', 'I']),
  state: z.string(),
  chamber: z.enum(['house', 'senate']),
  bioguideId: z.string().optional(),
  congressUrl: z.string().url().optional(),
});

// Pork item schema for tracking spending additions
const porkItemSchema = z.object({
  description: z.string(),           // "Bridge to nowhere in Alaska"
  amount: z.number(),                // Dollar amount (can be estimate)

  // Enhanced attribution
  addedBy: z.string(),               // Legacy simple field: "Rep. Don Young (R-AK)"
  sponsor: porkSponsorSchema.optional(), // Primary sponsor with full details
  cosponsors: z.array(porkSponsorSchema).optional(), // Co-sponsors

  // Committee attribution
  committee: z.string().optional(),  // "House Appropriations Committee"
  committeeMembers: z.array(z.object({
    name: z.string(),
    role: z.enum(['chair', 'ranking', 'member']),
    party: z.enum(['R', 'D', 'I']),
    state: z.string(),
  })).optional(),

  // Amendment details
  amendmentNumber: z.string().optional(),  // e.g., "H.Amdt.423"
  amendmentType: z.enum(['floor', 'committee', 'conference', 'manager']).optional(),

  // Vote record (if there was a recorded vote)
  vote: z.object({
    yeas: z.number(),
    nays: z.number(),
    notVoting: z.number().optional(),
    passed: z.boolean(),
    rollCallNumber: z.number().optional(),
    rollCallUrl: z.string().url().optional(),
  }).optional(),

  category: z.enum([
    'earmark',                       // Specific local project
    'program-expansion',             // Expanding existing program
    'new-program',                   // Creating new program
    'tax-expenditure',               // Tax breaks/credits
    'hidden-cost'                    // Unfunded mandates, etc.
  ]),
  satiricalNote: z.string().optional(), // "Because fish need meth too"
  sourceUrl: z.string().url().optional(), // Link to Congress.gov amendment/section
});

const amendmentSchema = z.object({
  number: z.string(), // e.g., "H.Amdt.123"
  sponsor: z.string().optional(),
  description: z.string().optional(),
  status: z.string().optional(),
  chamber: z.enum(['house', 'senate']).optional(),
  url: z.string().url().optional(),
  // Enhanced fields for bill evolution
  paraphrasedChange: z.string().optional(),  // Plain-English explanation
  porkItems: z.array(porkItemSchema).optional(),
  totalPorkAdded: z.number().optional(),     // Sum of pork items
  passedDate: z.coerce.date().optional()
});

// Bill evolution stage schema
const billEvolutionStageSchema = z.object({
  stage: z.enum([
    'introduced',
    'committee-markup',
    'house-passed',
    'senate-amended',
    'conference',
    'final'
  ]),
  date: z.coerce.date(),
  paraphrasedText: z.string(),        // AI summary at this stage
  cumulativePork: z.number(),         // Running total
  porkAddedThisStage: z.number(),
  keyChanges: z.array(z.string()),    // Bullet points of what changed
  amendmentsIncluded: z.array(z.string()).optional(), // Amendment numbers
  porkItems: z.array(porkItemSchema).optional() // Pork added this stage
});

const cosponsorSchema = z.object({
  name: z.string(),
  party: z.string().optional(),
  state: z.string().optional(),
  district: z.number().optional(),
  dateAdded: z.coerce.date().optional(),
  url: z.string().url().optional(),
});

const committeeSchema = z.object({
  name: z.string(),
  chamber: z.enum(['house', 'senate', 'joint']).optional(),
  type: z.enum(['primary', 'additional']).optional(),
  referralDate: z.coerce.date().optional(),
  activities: z.array(z.object({
    date: z.coerce.date(),
    action: z.string(),
  })).optional(),
  url: z.string().url().optional(),
});

const relatedBillSchema = z.object({
  billNumber: z.string(), // e.g., "H.R. 1234"
  title: z.string().optional(),
  relationship: z.string(), // e.g., "Identical", "Related", "Companion"
  congress: z.number().optional(),
  url: z.string().url().optional(),
});

const textVersionSchema = z.object({
  type: z.string(), // e.g., "Introduced", "Engrossed", "Enrolled"
  date: z.coerce.date().optional(),
  formats: z.object({
    pdf: z.string().url().optional(),
    html: z.string().url().optional(),
    xml: z.string().url().optional(),
    txt: z.string().url().optional(),
  }).optional(),
});

const bills = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/data/bills' }),
  schema: z.object({
    // Core identification
    title: z.string(),
    billNumber: z.string(),
    billType: z.enum(['sensible', 'absurd', 'real']),
    category: z.string(),
    tags: z.array(z.string()).default([]),

    // Sponsor & Cosponsors
    sponsor: z.string(),
    sponsorParty: z.string().optional(),
    sponsorState: z.string().optional(),
    sponsorUrl: z.string().url().optional(),
    cosponsors: z.array(z.union([z.string(), cosponsorSchema])).default([]),
    cosponsorCount: z.number().optional(),

    // Committee info
    committee: z.string(),
    committees: z.array(committeeSchema).optional(),

    // Status & Timeline
    status: z.string(),
    dateIntroduced: z.coerce.date(),
    dateUpdated: z.coerce.date().optional(),
    actions: z.array(actionSchema).optional(),

    // Key milestones (AI-extracted from actions)
    keyMilestones: z.array(z.object({
      type: z.string(),  // 'introduced', 'committee', 'passed-house', 'passed-senate', 'signed', 'vetoed', etc.
      date: z.coerce.date(),
      text: z.string(),
      icon: z.string(),  // Icon name for display
    })).optional(),

    // Titles
    officialTitle: z.string().optional(),
    shortTitles: z.array(titleSchema).optional(),
    popularTitle: z.string().optional(),

    // Summaries
    summary: z.string(),
    plainLanguageSummary: z.string().optional(),
    crsSummary: z.string().optional(),

    // Editorial content (AI-generated)
    theGist: z.string().optional(),
    whyItMatters: z.string().optional(),

    // Amendments
    amendments: z.array(amendmentSchema).optional(),
    amendmentCount: z.number().optional(),

    // Related legislation
    relatedBills: z.array(relatedBillSchema).optional(),

    // Text versions
    textVersions: z.array(textVersionSchema).optional(),
    latestTextUrl: z.string().url().optional(),

    // Display & Features
    featured: z.boolean().default(false),
    image: z.string().optional(),

    // Legacy fields
    realSource: z.string().optional(),
    realJurisdiction: z.string().optional(),

    // Real bill metadata
    absurdityIndex: z.number().min(1).max(10).optional(),
    congressDotGovUrl: z.string().url().optional(),
    congressNumber: z.number().optional(),
    excerpt: z.string().optional(),
    pairedBillId: z.string().optional(),

    // Votes
    votes: z.object({
      yeas: z.number(),
      nays: z.number(),
      notVoting: z.number(),
      passed: z.boolean(),
      chamber: z.enum(['house', 'senate']).optional(),
    }).optional(),

    // Bill evolution & pork tracking
    billEvolution: z.array(billEvolutionStageSchema).optional(),
    totalPork: z.number().optional(),     // Final pork tally
    porkPerCapita: z.number().optional(), // totalPork / US population (~333M)

    // Omnibus bill fields
    isOmnibus: z.boolean().default(false),
    omnibusData: z.object({
      totalSpending: z.number(),
      pageCount: z.number(),
      divisions: z.array(z.object({
        title: z.string(),
        shortTitle: z.string().optional(),
        spending: z.number(),
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

// Congressional Rules packages
const rules = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/data/rules' }),
  schema: z.object({
    title: z.string(),
    resolution: z.string(),
    chamber: z.enum(['house', 'senate']),
    congressNumber: z.number(),
    congressYears: z.string(),
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

// Representatives with pork tracking
const termSchema = z.object({
  chamber: z.enum(['house', 'senate']),
  state: z.string(),
  district: z.number().optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  party: z.string(),
});

const porkContributionSchema = z.object({
  billId: z.string(),               // Reference to bill in bills collection
  billNumber: z.string(),           // e.g., "H.R. 2112"
  amount: z.number(),
  description: z.string(),
  date: z.coerce.date(),
  category: z.enum(['earmark', 'program-expansion', 'new-program', 'tax-expenditure', 'hidden-cost']),
});

const financialDisclosureSchema = z.object({
  year: z.number(),
  minNetWorth: z.number(),
  maxNetWorth: z.number(),
  sourceUrl: z.string().url().optional(),
});

const representatives = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/data/representatives' }),
  schema: z.object({
    name: z.string(),
    bioguideId: z.string(),         // Official Congress bioguide ID
    party: z.string(),
    state: z.string(),
    imageUrl: z.string().url().optional(),
    terms: z.array(termSchema),
    totalPorkAmount: z.number().default(0),
    porkContributions: z.array(porkContributionSchema).default([]),
    financialDisclosures: z.array(financialDisclosureSchema).optional(),
    congressDotGovUrl: z.string().url().optional(),
  }),
});

export const collections = { bills, rules, representatives };
