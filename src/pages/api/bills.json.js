import { getCollection } from 'astro:content';
import { DIRECTORY_PAGE_SIZE } from '../../utils/directory.js';

function parseOffset(rawValue) {
  if (rawValue === null) return 0;
  const parsed = Number.parseInt(rawValue, 10);
  return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed;
}

function parseLimit(rawValue, fallback, max = 500) {
  if (rawValue === null) return fallback;
  const parsed = Number.parseInt(rawValue, 10);
  if (Number.isNaN(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function toApiBill(bill) {
  return {
    id: bill.id,
    title: bill.data.title,
    billNumber: bill.data.billNumber,
    billType: bill.data.billType,
    category: bill.data.category,
    tags: bill.data.tags,
    sponsor: bill.data.sponsor,
    cosponsors: bill.data.cosponsors,
    committee: bill.data.committee,
    status: bill.data.status,
    dateIntroduced: bill.data.dateIntroduced.toISOString(),
    dateUpdated: bill.data.dateUpdated?.toISOString() || null,
    summary: bill.data.summary,
    featured: bill.data.featured,
    absurdityIndex: bill.data.absurdityIndex || null,
    congressDotGovUrl: bill.data.congressDotGovUrl || null,
    congressNumber: bill.data.congressNumber || null,
    url:
      bill.data.billType === 'real'
        ? `https://absurdityindex.org/bills/${bill.id}/`
        : `https://absurdityindex.org/not-bills/${bill.id}/`,
  };
}

export async function GET({ request }) {
  const bills = await getCollection('bills');
  const requestUrl = new URL(request.url);
  const filterId = requestUrl.searchParams.get('id');
  const requestedOffset = parseOffset(requestUrl.searchParams.get('offset'));

  let data = bills.map(toApiBill);

  // Sort by date introduced, newest first
  data.sort((a, b) => new Date(b.dateIntroduced) - new Date(a.dateIntroduced));

  if (filterId) {
    data = data.filter((bill) => bill.id === filterId);
  }

  const total = data.length;
  const requestedLimit = parseLimit(requestUrl.searchParams.get('limit'), total);
  const safeOffset = Math.min(requestedOffset, total);
  const safeLimit = Math.min(requestedLimit, Math.max(total - safeOffset, 0));
  const paginatedData = data.slice(safeOffset, safeOffset + safeLimit);
  const hasMore = safeOffset + paginatedData.length < total;

  // Calculate some fun stats
  const realCount = data.filter(b => b.billType === 'real').length;
  const avgAbsurdity = data.filter(b => b.absurdityIndex).reduce((sum, b) => sum + b.absurdityIndex, 0) / realCount || 0;

  const quips = [
    "Fresh from the congressional sausage factory.",
    "Warning: May contain traces of democracy.",
    "Legislation so fresh, even Congress hasn't read it.",
    "Now with 50% more acronyms!",
    "Handcrafted artisanal bills, aged in committee.",
  ];

  return new Response(
    JSON.stringify(
      {
        _message: quips[Math.floor(Math.random() * quips.length)],
        _disclaimer: "Absurdity scores reflect editorial opinion, not legal analysis. We're comedians, not lawyers.",
        generated: new Date().toISOString(),
        generatedBy: "The Absurdity Index Research Service",
        count: paginatedData.length,
        total,
        offset: safeOffset,
        limit: requestedLimit,
        hasMore,
        nextOffset: hasMore ? safeOffset + paginatedData.length : null,
        pagination: {
          staticPageSize: DIRECTORY_PAGE_SIZE,
          firstPageUrl: 'https://absurdityindex.org/api/bills/page/1.json',
          _note: 'For large syncs, use /api/bills/page/{n}.json to avoid full payload downloads.',
        },
        breakdown: {
          real: realCount,
          satirical: total - realCount,
          averageAbsurdity: Math.round(avgAbsurdity * 10) / 10,
          _verdict: avgAbsurdity >= 6 ? "Congress is Congressing hard today." : "Surprisingly mild. Give it time.",
        },
        bills: paginatedData,
        _footer: {
          rateLimit: "Please don't DDOS us. We're a satire site, not the actual government.",
          contact: "Questions? File a Freedom of Information Request (just kidding, email us).",
          sponsoredBy: "Big Satire™️",
        },
      },
      null,
      2
    ),
    {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'X-Powered-By': 'Disillusionment',
        'X-Congress-Status': 'Probably on recess',
      },
    }
  );
}
