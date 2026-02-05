import { getCollection } from 'astro:content';

const PAGE_SIZE = 100;

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

function sortByIntroducedDateDesc(a, b) {
  return new Date(b.dateIntroduced) - new Date(a.dateIntroduced);
}

function getPageUrl(page) {
  return `https://absurdityindex.org/api/real-bills/page/${page}.json`;
}

export async function getStaticPaths() {
  const allBills = await getCollection('bills');
  const data = allBills
    .filter((bill) => bill.data.billType === 'real')
    .map(toApiBill)
    .sort(sortByIntroducedDateDesc);

  const total = data.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return Array.from({ length: totalPages }, (_, index) => {
    const page = index + 1;
    const start = index * PAGE_SIZE;
    const pageBills = data.slice(start, start + PAGE_SIZE);

    return {
      params: { page: String(page) },
      props: {
        page,
        total,
        totalPages,
        bills: pageBills,
      },
    };
  });
}

export async function GET({ props }) {
  const { page, total, totalPages, bills } = props;
  const hasMore = page < totalPages;

  return new Response(
    JSON.stringify(
      {
        generated: new Date().toISOString(),
        page,
        pageSize: PAGE_SIZE,
        count: bills.length,
        total,
        totalPages,
        hasMore,
        nextPage: hasMore ? page + 1 : null,
        nextPageUrl: hasMore ? getPageUrl(page + 1) : null,
        prevPage: page > 1 ? page - 1 : null,
        prevPageUrl: page > 1 ? getPageUrl(page - 1) : null,
        bills,
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
