import { getCollection } from 'astro:content';

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
    url: `https://absurdityindex.org/bills/${bill.id}/`,
  };
}

export async function GET({ request }) {
  const allBills = await getCollection('bills');
  const requestUrl = new URL(request.url);
  const requestedOffset = parseOffset(requestUrl.searchParams.get('offset'));
  const filterId = requestUrl.searchParams.get('id');
  const bills = allBills.filter((bill) => bill.data.billType === 'real');

  let data = bills.map(toApiBill);

  // Sort by date introduced, newest first
  data.sort((a, b) => new Date(b.dateIntroduced) - new Date(a.dateIntroduced));

  if (filterId) {
    data = data.filter((bill) => bill.id === filterId);
  }

  const total = data.length;
  const requestedLimit = parseLimit(requestUrl.searchParams.get('limit'), total);
  const safeOffset = Math.min(requestedOffset, total);
  const paginatedData = data.slice(safeOffset, safeOffset + requestedLimit);
  const hasMore = safeOffset + paginatedData.length < total;

  return new Response(
    JSON.stringify(
      {
        generated: new Date().toISOString(),
        count: paginatedData.length,
        total,
        offset: safeOffset,
        limit: requestedLimit,
        hasMore,
        nextOffset: hasMore ? safeOffset + paginatedData.length : null,
        pagination: {
          staticPageSize: 100,
          firstPageUrl: 'https://absurdityindex.org/api/real-bills/page/1.json',
          _note: 'For large syncs, use /api/real-bills/page/{n}.json to avoid full payload downloads.',
        },
        bills: paginatedData,
      },
      null,
      2
    ),
    {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
}
