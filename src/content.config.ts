import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { dedupeActionEntries } from './utils/billTransforms.js';

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
  description: z.string(), // "Bridge to nowhere in Alaska"
  amount: z.number(), // Dollar amount (can be estimate)

  // Enhanced attribution
  addedBy: z.string(), // Legacy simple field: "Rep. Don Young (R-AK)"
  sponsor: porkSponsorSchema.optional(), // Primary sponsor with full details
  cosponsors: z.array(porkSponsorSchema).optional(), // Co-sponsors

  // Committee attribution
  committee: z.string().optional(), // "House Appropriations Committee"
  committeeMembers: z
    .array(
      z.object({
        name: z.string(),
        role: z.enum(['chair', 'ranking', 'member']),
        party: z.enum(['R', 'D', 'I']),
        state: z.string(),
      }),
    )
    .optional(),

  // Amendment details
  amendmentNumber: z.string().optional(), // e.g., "H.Amdt.423"
  amendmentType: z.enum(['floor', 'committee', 'conference', 'manager']).optional(),

  // Vote record (if there was a recorded vote)
  vote: z
    .object({
      yeas: z.number(),
      nays: z.number(),
      notVoting: z.number().optional(),
      passed: z.boolean(),
      rollCallNumber: z.number().optional(),
      rollCallUrl: z.string().url().optional(),
    })
    .optional(),

  category: z.enum([
    'earmark', // Specific local project
    'program-expansion', // Expanding existing program
    'new-program', // Creating new program
    'tax-expenditure', // Tax breaks/credits
    'hidden-cost', // Unfunded mandates, etc.
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
  paraphrasedChange: z.string().optional(), // Plain-English explanation
  porkItems: z.array(porkItemSchema).optional(),
  totalPorkAdded: z.number().optional(), // Sum of pork items
  passedDate: z.coerce.date().optional(),
});

// Stage-specific vote schema (for bill evolution stages)
const stageVoteSchema = z.object({
  yeas: z.number(),
  nays: z.number(),
  notVoting: z.number().optional(),
  passed: z.boolean(),
  chamber: z.enum(['house', 'senate']),
  rollCallNumber: z.number().optional(),
  rollCallUrl: z.string().url().optional(),
});

// Bill evolution stage schema - chamber-agnostic design
// "origin" = the chamber where the bill was introduced (House for H.R., Senate for S.)
// "receiving" = the other chamber that receives the bill after origin passes it
const billEvolutionStageSchema = z.object({
  stage: z.enum([
    // Introduction
    'introduced',

    // Origin chamber (House for H.R., Senate for S.)
    'origin-committee', // Referred to committee(s)
    'origin-reported', // Reported out of committee
    'origin-floor', // Floor consideration/debate
    'origin-passed', // Passed origin chamber

    // Receiving chamber
    'receiving-received', // Received in other chamber
    'receiving-committee', // In receiving chamber's committee
    'receiving-reported', // Reported out of receiving committee
    'receiving-floor', // Floor consideration in receiving chamber
    'receiving-passed', // Passed without changes → enrolled
    'receiving-amended', // Passed WITH changes → ping-pong

    // Ping-pong (origin reconsiders receiving's amendments)
    'origin-considers-amendments',
    'origin-concurs', // Accepts receiving's changes → enrolled
    'origin-disagrees', // Rejects → conference or more amendments

    // Conference committee
    'conference-requested',
    'conference-appointed',
    'conference-report-filed',
    'conference-house-adopts',
    'conference-senate-adopts',

    // Enrollment
    'enrolled',

    // Presidential action
    'presented-to-president',
    'signed',
    'vetoed',
    'pocket-vetoed',

    // Veto override
    'override-house-vote',
    'override-senate-vote',
    'override-successful',
    'veto-sustained',

    // Terminal states
    'became-law',
    'died-in-committee',
    'died-on-floor',
    'died-in-conference',
    'expired', // Congress ended without action
  ]),

  // Track which chamber this occurred in (for explicit display)
  chamber: z.enum(['house', 'senate', 'both', 'president']).optional(),

  // For ping-pong scenarios, track the round number (1 = first pass, 2 = after amendments, etc.)
  round: z.number().optional(),

  date: z.coerce.date(),
  paraphrasedText: z.string(), // AI summary at this stage
  cumulativePork: z.number(), // Running total
  porkAddedThisStage: z.number(),
  keyChanges: z.array(z.string()), // Bullet points of what changed
  amendmentsIncluded: z.array(z.string()).optional(), // Amendment numbers
  porkItems: z.array(porkItemSchema).optional(), // Pork added this stage

  // Vote data for this specific stage (if applicable)
  vote: stageVoteSchema.optional(),
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
  activities: z
    .array(
      z.object({
        date: z.coerce.date(),
        action: z.string(),
      }),
    )
    .optional(),
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
  formats: z
    .object({
      pdf: z.string().url().optional(),
      html: z.string().url().optional(),
      xml: z.string().url().optional(),
      txt: z.string().url().optional(),
    })
    .optional(),
});

// Votes schema - shared between bill types
const votesSchema = z.object({
  yeas: z.number(),
  nays: z.number(),
  notVoting: z.number().default(0),
  present: z.number().default(0),
  passed: z.boolean(),
  chamber: z.enum(['house', 'senate']).optional(),
  method: z.string().optional(), // e.g., "unanimous consent"
  rollCallNumber: z.number().optional(),
  rollCallUrl: z.string().url().optional(),
});

// Base schema shared by all bill types
const baseBillSchema = z.object({
  // Core identification (required for all)
  title: z.string(),
  subtitle: z.string().optional(),
  billNumber: z.string(),
  billType: z.enum(['sensible', 'absurd', 'real']),
  category: z.string(),
  tags: z.array(z.string()).default([]),

  // Sponsor (required for all - format varies by type)
  sponsor: z.string(),
  cosponsors: z.array(z.union([z.string(), cosponsorSchema])).default([]),

  // Committee info (required for all)
  committee: z.string(),

  // Status & Timeline (required for all)
  status: z.string(),
  dateIntroduced: z.coerce.date(),

  // Summary (required for all)
  summary: z.string(),

  // Display & Features
  featured: z.boolean().default(false),

  // Votes (optional - not all bills have recorded votes)
  votes: votesSchema.optional(),

  // Bill evolution & pork tracking
  billEvolution: z.array(billEvolutionStageSchema).optional(),
  totalPork: z.number().default(0),
  porkPerCapita: z.number().default(0),
});

// Sensible bills use only the base schema (no extensions required)

const bills = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/data/bills' }),
  schema: baseBillSchema
    // Merge optional fields that real bills use
    .extend({
      // Real bill optional fields (not required for sensible/absurd)
      sponsorParty: z.string().optional(),
      sponsorState: z.string().optional(),
      sponsorUrl: z.string().url().optional(),
      cosponsorCount: z.number().optional(),
      committees: z.array(committeeSchema).optional(),
      dateUpdated: z.coerce.date().optional(),
      actionCount: z.number().optional(),
      actions: z
        .array(actionSchema)
        .optional()
        .transform((actions) => (actions ? dedupeActionEntries(actions) : actions)),
      keyMilestones: z
        .array(
          z.object({
            type: z.string(),
            date: z.coerce.date(),
            text: z.string(),
            icon: z.enum([
              'file-text',
              'users',
              'check-square',
              'vote',
              'git-merge',
              'pen-tool',
              'award',
              'x-circle',
            ]),
          }),
        )
        .optional(),
      officialTitle: z.string().optional(),
      shortTitles: z.array(titleSchema).optional(),
      popularTitle: z.string().optional(),
      plainLanguageSummary: z.string().optional(),
      crsSummary: z.string().optional(),
      theGist: z.string().optional(),
      whyItMatters: z.string().optional(),
      amendments: z.array(amendmentSchema).optional(),
      amendmentCount: z.number().optional(),
      relatedBills: z.array(relatedBillSchema).optional(),
      textVersions: z.array(textVersionSchema).optional(),
      latestTextUrl: z.string().url().optional(),
      image: z.string().optional(),
      absurdityIndex: z.number().min(1).max(10).optional(),
      congressDotGovUrl: z.string().url().optional(),
      congressNumber: z.number().optional(),
      excerpt: z.string().optional(),
      pairedBillId: z.string().optional(),
      isOmnibus: z.boolean().default(false),
      omnibusData: z
        .object({
          totalSpending: z.number(),
          pageCount: z.number(),
          divisions: z.array(
            z.object({
              title: z.string(),
              shortTitle: z.string().optional(),
              spending: z.number(),
              description: z.string().optional(),
            }),
          ),
          riders: z
            .array(
              z.object({
                title: z.string(),
                description: z.string(),
                category: z
                  .enum(['policy', 'spending', 'tax', 'controversial', 'sneaky'])
                  .optional(),
              }),
            )
            .optional(),
          timeline: z
            .array(
              z.object({
                date: z.coerce.date(),
                event: z.string(),
              }),
            )
            .optional(),
        })
        .optional(),
      // Absurd bill fields
      realSource: z.string().optional(),
      realJurisdiction: z.string().optional(),
    })
    // Add refinement to validate bill-type-specific requirements
    .refine(
      (data) => {
        // Real bills must have certain fields
        if (data.billType === 'real') {
          return (
            data.sponsorParty !== undefined &&
            data.sponsorState !== undefined &&
            data.congressNumber !== undefined
          );
        }
        return true;
      },
      { message: 'Real bills require sponsorParty, sponsorState, and congressNumber' },
    ),
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
    votes: z
      .object({
        yeas: z.number(),
        nays: z.number(),
        notVoting: z.number(),
        passed: z.boolean(),
      })
      .optional(),
    majorChanges: z
      .array(
        z.object({
          title: z.string(),
          description: z.string(),
          category: z
            .enum(['procedure', 'committee', 'floor', 'ethics', 'administrative', 'controversial'])
            .optional(),
        }),
      )
      .optional(),
    notableRules: z
      .array(
        z.object({
          rule: z.string(),
          title: z.string(),
          description: z.string(),
        }),
      )
      .optional(),
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
  billId: z.string(), // Reference to bill in bills collection
  billNumber: z.string(), // e.g., "H.R. 2112"
  amount: z.number(),
  description: z.string(),
  date: z.coerce.date(),
  category: z.enum([
    'earmark',
    'program-expansion',
    'new-program',
    'tax-expenditure',
    'hidden-cost',
  ]),
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
    bioguideId: z.string(), // Official Congress bioguide ID
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
