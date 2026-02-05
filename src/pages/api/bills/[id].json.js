import { getCollection } from 'astro:content';

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
    realSource: bill.data.realSource || null,
    realJurisdiction: bill.data.realJurisdiction || null,
    url:
      bill.data.billType === 'real'
        ? `https://absurdityindex.org/bills/${bill.id}/`
        : `https://absurdityindex.org/not-bills/${bill.id}/`,
  };
}

export async function getStaticPaths() {
  const bills = await getCollection('bills');

  return bills.map((bill) => ({
    params: { id: bill.id },
    props: { bill: toApiBill(bill) },
  }));
}

export async function GET({ props }) {
  if (!props?.bill) {
    return new Response(
      JSON.stringify({ error: 'Bill not found' }, null, 2),
      {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }

  return new Response(
    JSON.stringify(
      {
        generated: new Date().toISOString(),
        bill: props.bill,
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
