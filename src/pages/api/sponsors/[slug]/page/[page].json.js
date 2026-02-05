import { getCollection } from 'astro:content';
import {
  DIRECTORY_PAGE_SIZE,
  buildPaginatedApiPayload,
  toApiBill,
  toSponsorSlug,
} from '../../../../../utils/directory.js';

function sortByIntroducedDateDesc(a, b) {
  return b.dateIntroducedTs - a.dateIntroducedTs;
}

export async function getStaticPaths() {
  const allBills = await getCollection('bills');
  const sponsorNames = [...new Set(allBills.map((bill) => bill.data.sponsor))];

  return sponsorNames.flatMap((sponsorName) => {
    const slug = toSponsorSlug(sponsorName);
    const data = allBills
      .filter((bill) => toSponsorSlug(bill.data.sponsor) === slug)
      .map(toApiBill)
      .sort(sortByIntroducedDateDesc);

    const total = data.length;
    const totalPages = Math.max(1, Math.ceil(total / DIRECTORY_PAGE_SIZE));

    return Array.from({ length: totalPages }, (_, index) => {
      const page = index + 1;
      const start = index * DIRECTORY_PAGE_SIZE;
      const pageBills = data.slice(start, start + DIRECTORY_PAGE_SIZE);

      return {
        params: { slug, page: String(page) },
        props: {
          page,
          total,
          totalPages,
          bills: pageBills,
          slug,
        },
      };
    });
  });
}

export async function GET({ props }) {
  const payload = buildPaginatedApiPayload({
    page: props.page,
    total: props.total,
    totalPages: props.totalPages,
    bills: props.bills,
    endpointPath: `/api/sponsors/${props.slug}/page`,
  });

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
