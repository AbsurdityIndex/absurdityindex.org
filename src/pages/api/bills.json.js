import { getCollection } from 'astro:content';

export async function GET() {
  const bills = await getCollection('bills');

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
    absurdityIndex: bill.data.absurdityIndex || null,
    congressDotGovUrl: bill.data.congressDotGovUrl || null,
    congressNumber: bill.data.congressNumber || null,
    url:
      bill.data.billType === 'real'
        ? `https://absurdityindex.org/bills/${bill.id}/`
        : `https://absurdityindex.org/not-bills/${bill.id}/`,
  }));

  // Sort by date introduced, newest first
  data.sort((a, b) => new Date(b.dateIntroduced) - new Date(a.dateIntroduced));

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
        count: data.length,
        breakdown: {
          real: realCount,
          satirical: data.length - realCount,
          averageAbsurdity: Math.round(avgAbsurdity * 10) / 10,
          _verdict: avgAbsurdity >= 6 ? "Congress is Congressing hard today." : "Surprisingly mild. Give it time.",
        },
        bills: data,
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
