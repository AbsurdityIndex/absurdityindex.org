/**
 * Absurdity Index tier definitions — single source of truth.
 *
 * Every component, page, and API that references tier names, descriptions,
 * or colors should import from here instead of hardcoding values.
 *
 * NOTE: extension/content.js duplicates getLabel() because it runs as a
 * standalone browser extension script. Keep it in sync manually.
 */

export interface AbsurdityTier {
  range: string;
  min: number;
  max: number;
  name: string;
  description: string;
  examples: string;
  color: {
    /** Hex color for CSS contexts (scale bars, custom elements) */
    hex: string;
    /** Tailwind bg class for filled segments */
    bg: string;
    /** Tailwind classes for score badge (border + bg + text) */
    badge: string;
    /** Tailwind classes for tier range pill (bg + text) */
    pill: { bg: string; text: string };
    /** Tailwind text color for labels */
    label: string;
    /** CSS class suffix for drawer tiers */
    drawerClass: string;
  };
}

export const ABSURDITY_TIERS: AbsurdityTier[] = [
  {
    range: '1-3',
    min: 1,
    max: 3,
    name: 'Suspiciously Reasonable',
    description:
      'Legislation that accidentally makes sense. Post office namings, routine budgets, and other evidence that Congress may occasionally be functional.',
    examples:
      'Naming federal buildings, routine appropriations, technical corrections to existing law — the legislative equivalent of filing your taxes on time',
    color: {
      hex: '#16a34a',
      bg: 'bg-green-600',
      badge: 'bg-green-100 text-green-800 border-green-200',
      pill: { bg: 'bg-green-600', text: 'text-white' },
      label: 'text-green-700',
      drawerClass: 'tier-green',
    },
  },
  {
    range: '4-6',
    min: 4,
    max: 6,
    name: 'Pork-Adjacent',
    description:
      'Bills flirting with absurdity. Creative acronyms, suspiciously specific regulations, and the unmistakable scent of a rider nobody was supposed to read.',
    examples:
      'Tortured backronyms (PATRIOT Act, anyone?), weirdly specific regulations, commemorative coin proliferation',
    color: {
      hex: '#eab308',
      bg: 'bg-yellow-500',
      badge: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      pill: { bg: 'bg-yellow-500', text: 'text-yellow-900' },
      label: 'text-yellow-700',
      drawerClass: 'tier-yellow',
    },
  },
  {
    range: '7-8',
    min: 7,
    max: 8,
    name: 'Hold My Gavel',
    description:
      'Genuinely reckless legislating. Pork barrel projects, studies on things we already know, and spending decisions that suggest the vote was taken at 2am.',
    examples:
      "Earmarks for bridges to nowhere, studies answering questions nobody asked, infrastructure in districts that don't exist yet",
    color: {
      hex: '#f97316',
      bg: 'bg-orange-500',
      badge: 'bg-orange-100 text-orange-800 border-orange-200',
      pill: { bg: 'bg-orange-500', text: 'text-white' },
      label: 'text-orange-700',
      drawerClass: 'tier-orange',
    },
  },
  {
    range: '9-10',
    min: 9,
    max: 10,
    name: 'Fish on Meth',
    description:
      'The pinnacle of absurdity. Pizza-as-vegetable tier. Bills so absurd they transcend partisan criticism and unite us all in confused disbelief.',
    examples:
      'The infamous school lunch pizza classification, actual studies on fish exposed to methamphetamines, legislative riders that defy explanation',
    color: {
      hex: '#dc2626',
      bg: 'bg-red-600',
      badge: 'bg-red-100 text-red-800 border-red-200',
      pill: { bg: 'bg-red-600', text: 'text-white' },
      label: 'text-red-700',
      drawerClass: 'tier-red',
    },
  },
];

/** Get the tier definition for a given score (clamped 1-10). */
export function getTier(score: number): AbsurdityTier {
  const clamped = Math.max(1, Math.min(10, Math.round(score)));
  return ABSURDITY_TIERS.find((t) => clamped >= t.min && clamped <= t.max)!;
}

/** Get just the label string for a score. */
export function getLabel(score: number): string {
  return getTier(score).name;
}

/** Get the Tailwind bg class for a single bar segment (1-10). */
export function getSegmentColor(segment: number): string {
  return getTier(segment).color.bg;
}
