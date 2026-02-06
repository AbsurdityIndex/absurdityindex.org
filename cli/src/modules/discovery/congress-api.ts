import { getLogger } from '../../utils/logger.js';

const BASE_URL = 'https://api.congress.gov/v3';
const DELAY_MS = 350;

const CONGRESS_GOV_PATH_BY_TYPE: Record<string, string> = {
  hr: 'house-bill',
  s: 'senate-bill',
  hres: 'house-resolution',
  sres: 'senate-resolution',
  hjres: 'house-joint-resolution',
  sjres: 'senate-joint-resolution',
  hconres: 'house-concurrent-resolution',
  sconres: 'senate-concurrent-resolution',
};

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

export interface BrowsedBill {
  congress: number;
  billType: string;
  billNumber: number;
  title: string;
  sponsor: string;
  sponsorParty: string;
  sponsorState: string;
  policyArea: string;
  latestActionText: string;
  latestActionDate: string;
  congressGovUrl: string;
}

export interface BillDetail {
  subjects: string[];
  summaryText: string;
  cosponsorCount: number;
}

export interface FullBillData {
  bill: any;
  summaries: any[];
  actions: any[];
  amendments: any[];
  committees: any[];
  cosponsors: any[];
  relatedBills: any[];
  subjects: any[];
  policyArea: any;
  titles: any[];
  textVersions: any[];
}

export class CongressApi {
  private apiKey: string;
  private log = getLogger();

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async fetch(endpoint: string, limit = 250): Promise<any> {
    const sep = endpoint.includes('?') ? '&' : '?';
    const url = `${BASE_URL}${endpoint}${sep}api_key=${this.apiKey}&format=json&limit=${limit}`;

    const res = await fetch(url);
    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`Congress.gov API ${res.status}: ${endpoint}`);
    }
    return res.json();
  }

  /**
   * Browse recent bills by congress and type.
   * Returns basic bill metadata without detail fetches.
   */
  async browse(opts: {
    congress: number;
    type: string;
    fromDate: string;
    limit: number;
  }): Promise<BrowsedBill[]> {
    const { congress, type, fromDate, limit } = opts;
    const results: BrowsedBill[] = [];
    let offset = 0;
    let remaining = limit;

    while (remaining > 0) {
      const batchSize = Math.min(remaining, 250);
      const endpoint = `/bill/${congress}/${type}?sort=updateDate+desc&limit=${batchSize}&offset=${offset}&fromDateTime=${fromDate}T00:00:00Z`;

      this.log.debug({ endpoint }, 'Browsing bills');
      const data = await this.fetch(endpoint, batchSize);
      if (!data?.bills || data.bills.length === 0) break;

      for (const b of data.bills) {
        const sponsorObj = b.sponsors?.[0];
        const congressTypePath = CONGRESS_GOV_PATH_BY_TYPE[type];
        const congressUrl = congressTypePath
          ? `https://www.congress.gov/bill/${congress}th-congress/${congressTypePath}/${b.number}`
          : '';

        results.push({
          congress,
          billType: type,
          billNumber: b.number,
          title: b.title || '',
          sponsor: sponsorObj
            ? (sponsorObj.fullName || `${sponsorObj.firstName} ${sponsorObj.lastName}`)
            : '',
          sponsorParty: sponsorObj?.party || '',
          sponsorState: sponsorObj?.state || '',
          policyArea: b.policyArea?.name || '',
          latestActionText: b.latestAction?.text || '',
          latestActionDate: b.latestAction?.actionDate || '',
          congressGovUrl: congressUrl,
        });
      }

      offset += data.bills.length;
      remaining -= data.bills.length;

      // If we got fewer than requested, we've exhausted results
      if (data.bills.length < batchSize) break;

      await sleep(DELAY_MS);
    }

    return results;
  }

  /**
   * Fetch subjects, summary, and cosponsor count for a single bill.
   * Used after pre-filter passes to enrich data for AI scoring.
   */
  async fetchDetail(congress: number, type: string, number: number): Promise<BillDetail> {
    const subjects: string[] = [];
    let summaryText = '';
    let cosponsorCount = 0;

    // Subjects
    try {
      const res = await this.fetch(`/bill/${congress}/${type}/${number}/subjects`);
      const legSubjects = res?.subjects?.legislativeSubjects || [];
      for (const s of legSubjects) {
        if (s.name) subjects.push(s.name);
      }
      await sleep(DELAY_MS);
    } catch {
      this.log.debug({ congress, type, number }, 'Subjects not available');
    }

    // Summary
    try {
      const res = await this.fetch(`/bill/${congress}/${type}/${number}/summaries`);
      const summaries = res?.summaries || [];
      if (summaries.length > 0) {
        const raw = summaries[summaries.length - 1].text || '';
        summaryText = raw.replace(/<[^>]+>/g, '').trim();
      }
      await sleep(DELAY_MS);
    } catch {
      this.log.debug({ congress, type, number }, 'Summaries not available');
    }

    // Cosponsors (just the count)
    try {
      const res = await this.fetch(`/bill/${congress}/${type}/${number}/cosponsors`, 1);
      cosponsorCount = res?.cosponsors?.length ?? 0;
      // The API may return pagination info with a count
      if (res?.pagination?.count != null) {
        cosponsorCount = res.pagination.count;
      }
      await sleep(DELAY_MS);
    } catch {
      this.log.debug({ congress, type, number }, 'Cosponsors not available');
    }

    return { subjects, summaryText, cosponsorCount };
  }

  /**
   * Fetch full bill data for MDX generation (used during ingest).
   * Mirrors the fetchBillData function from fetch-bills.mjs.
   */
  async fetchFull(congress: number, type: string, number: number): Promise<FullBillData> {
    this.log.info({ congress, type, number }, 'Fetching full bill data');

    const billRes = await this.fetch(`/bill/${congress}/${type}/${number}`);
    if (!billRes) throw new Error('Bill not found');
    const bill = billRes.bill;
    await sleep(DELAY_MS);

    const data: FullBillData = {
      bill,
      summaries: [],
      actions: [],
      amendments: [],
      committees: [],
      cosponsors: [],
      relatedBills: [],
      subjects: [],
      policyArea: null,
      titles: [],
      textVersions: [],
    };

    const endpoints: Array<{ key: keyof FullBillData; path: string; limit?: number }> = [
      { key: 'summaries', path: 'summaries' },
      { key: 'actions', path: 'actions', limit: 500 },
      { key: 'amendments', path: 'amendments', limit: 500 },
      { key: 'committees', path: 'committees' },
      { key: 'cosponsors', path: 'cosponsors', limit: 500 },
      { key: 'relatedBills', path: 'relatedbills' },
      { key: 'titles', path: 'titles' },
      { key: 'textVersions', path: 'text' },
    ];

    for (const ep of endpoints) {
      try {
        const res = await this.fetch(
          `/bill/${congress}/${type}/${number}/${ep.path}`,
          ep.limit ?? 250,
        );
        if (res) {
          // Handle the nested structure: res.summaries, res.actions, etc.
          const responseKey = ep.path === 'relatedbills' ? 'relatedBills' : ep.path === 'text' ? 'textVersions' : ep.path;
          (data as any)[ep.key] = res[responseKey] || [];
        }
        await sleep(DELAY_MS);
      } catch {
        this.log.debug(`${ep.path} not available for ${type}${number}`);
      }
    }

    // Subjects has a unique structure
    try {
      const res = await this.fetch(`/bill/${congress}/${type}/${number}/subjects`);
      if (res?.subjects) {
        data.subjects = res.subjects.legislativeSubjects || [];
        data.policyArea = res.subjects.policyArea || null;
      }
      await sleep(DELAY_MS);
    } catch {
      this.log.debug(`Subjects not available for ${type}${number}`);
    }

    return data;
  }

  /** Build Congress.gov URL for a bill */
  static congressGovUrl(congress: number, type: string, number: number): string {
    const pathSegment = CONGRESS_GOV_PATH_BY_TYPE[type];
    if (!pathSegment) return '';
    return `https://www.congress.gov/bill/${congress}th-congress/${pathSegment}/${number}`;
  }
}
