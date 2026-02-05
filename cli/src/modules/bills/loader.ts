import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { getLogger } from '../../utils/logger.js';
import type { BillContext } from '../claude/prompts/index.js';

const log = getLogger();

export interface LoadedBill extends BillContext {
  tags: string[];
  category: string;
  featured: boolean;
  dateIntroduced: Date;
}

/**
 * Load and parse all MDX bill frontmatter from the Astro project's data directory.
 * Uses gray-matter (same format Astro uses internally).
 */
export function loadBills(billsDir: string): LoadedBill[] {
  const bills: LoadedBill[] = [];

  let files: string[];
  try {
    files = fs.readdirSync(billsDir).filter(f => f.endsWith('.mdx'));
  } catch (err) {
    log.error({ err, billsDir }, 'Failed to read bills directory');
    return [];
  }

  for (const file of files) {
    try {
      const filePath = path.join(billsDir, file);
      const raw = fs.readFileSync(filePath, 'utf-8');
      const { data } = matter(raw);

      const slug = path.basename(file, '.mdx');

      bills.push({
        slug,
        billNumber: data.billNumber ?? '',
        title: data.title ?? '',
        sponsor: data.sponsor ?? '',
        status: data.status ?? '',
        summary: data.summary ?? '',
        totalPork: data.totalPork ?? 0,
        porkPerCapita: data.porkPerCapita ?? 0,
        absurdityIndex: data.absurdityIndex,
        theGist: data.theGist,
        billType: data.billType ?? 'sensible',
        tags: data.tags ?? [],
        category: data.category ?? '',
        featured: data.featured ?? false,
        dateIntroduced: new Date(data.dateIntroduced),
      });
    } catch (err) {
      log.debug({ file, err }, 'Failed to parse bill');
    }
  }

  log.info({ count: bills.length }, 'Bills loaded');
  return bills;
}

/**
 * Load a single bill by slug.
 */
export function loadBill(billsDir: string, slug: string): LoadedBill | null {
  const filePath = path.join(billsDir, `${slug}.mdx`);
  if (!fs.existsSync(filePath)) return null;

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const { data } = matter(raw);

    return {
      slug,
      billNumber: data.billNumber ?? '',
      title: data.title ?? '',
      sponsor: data.sponsor ?? '',
      status: data.status ?? '',
      summary: data.summary ?? '',
      totalPork: data.totalPork ?? 0,
      porkPerCapita: data.porkPerCapita ?? 0,
      absurdityIndex: data.absurdityIndex,
      theGist: data.theGist,
      billType: data.billType ?? 'sensible',
      tags: data.tags ?? [],
      category: data.category ?? '',
      featured: data.featured ?? false,
      dateIntroduced: new Date(data.dateIntroduced),
    };
  } catch (err) {
    log.warn({ slug, err }, 'Failed to load bill');
    return null;
  }
}
