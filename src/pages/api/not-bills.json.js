import { getCollection } from 'astro:content';

export async function GET() {
  const allBills = await getCollection('bills');
  const bills = allBills.filter((bill) => bill.data.billType !== 'real');

  const data = bills.map((bill) => ({
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
    // Not-bills don't have absurdity index or congress.gov URLs
    realSource: bill.data.realSource || null,
    realJurisdiction: bill.data.realJurisdiction || null,
    url: `https://absurdityindex.org/not-bills/${bill.id}/`,
  }));

  // Sort by date introduced, newest first
  data.sort((a, b) => new Date(b.dateIntroduced) - new Date(a.dateIntroduced));

  return new Response(
    JSON.stringify(
      {
        generated: new Date().toISOString(),
        count: data.length,
        bills: data,
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
