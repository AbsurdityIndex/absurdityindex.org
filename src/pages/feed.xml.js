import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

export async function GET(context) {
  const bills = await getCollection('bills');

  // Sort all bills by date, newest first
  const sorted = bills.sort(
    (a, b) => b.data.dateIntroduced.getTime() - a.data.dateIntroduced.getTime(),
  );

  return rss({
    title: 'Absurdity Index',
    description:
      'Real federal bills scored on an Absurdity Index, paired with satirical legislation that actually makes sense.',
    site: context.site,
    items: sorted.map((bill) => ({
      title: `${bill.data.billNumber} — ${bill.data.title}`,
      description: bill.data.summary,
      pubDate: bill.data.dateIntroduced,
      link: bill.data.billType === 'real' ? `/bills/${bill.id}/` : `/not-bills/${bill.id}/`,
      categories: [bill.data.category, ...(bill.data.tags || [])],
    })),
    customData: '<language>en-us</language>',
  });
}
