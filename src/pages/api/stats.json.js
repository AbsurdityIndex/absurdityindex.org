import { getCollection } from 'astro:content';
import { getLabel } from '../../utils/absurdity-tiers';

export async function GET() {
  const bills = await getCollection('bills');

  // Separate by type
  const realBills = bills.filter((b) => b.data.billType === 'real');
  const notBills = bills.filter((b) => b.data.billType !== 'real');
  const sensibleBills = bills.filter((b) => b.data.billType === 'sensible');
  const absurdBills = bills.filter((b) => b.data.billType === 'absurd');

  // Calculate average absurdity index for real bills
  const billsWithAbsurdity = realBills.filter((b) => b.data.absurdityIndex);
  const averageAbsurdity =
    billsWithAbsurdity.length > 0
      ? billsWithAbsurdity.reduce((sum, b) => sum + b.data.absurdityIndex, 0) /
        billsWithAbsurdity.length
      : null;

  // Absurdity distribution
  const absurdityDistribution = {};
  for (let i = 1; i <= 10; i++) {
    absurdityDistribution[i] = billsWithAbsurdity.filter((b) => b.data.absurdityIndex === i).length;
  }

  // Bills by category
  const categories = {};
  bills.forEach((bill) => {
    const cat = bill.data.category;
    if (!categories[cat]) {
      categories[cat] = { total: 0, real: 0, satirical: 0 };
    }
    categories[cat].total++;
    if (bill.data.billType === 'real') {
      categories[cat].real++;
    } else {
      categories[cat].satirical++;
    }
  });

  // Bills by status
  const statuses = {};
  bills.forEach((bill) => {
    const status = bill.data.status;
    if (!statuses[status]) {
      statuses[status] = 0;
    }
    statuses[status]++;
  });

  // Most common tags
  const tagCounts = {};
  bills.forEach((bill) => {
    (bill.data.tags || []).forEach((tag) => {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    });
  });
  const topTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([tag, count]) => ({ tag, count }));

  // Featured bills count
  const featuredCount = bills.filter((b) => b.data.featured).length;

  // Date range
  const dates = bills.map((b) => b.data.dateIntroduced.getTime());
  const oldestDate = new Date(Math.min(...dates)).toISOString();
  const newestDate = new Date(Math.max(...dates)).toISOString();

  // Congress numbers (for real bills)
  const congressNumbers = [
    ...new Set(realBills.map((b) => b.data.congressNumber).filter(Boolean)),
  ].sort((a, b) => b - a);

  // Snarky commentary based on stats
  const avgScore = averageAbsurdity ? Math.round(averageAbsurdity * 10) / 10 : 0;
  const commentary =
    avgScore >= 7
      ? 'Congress is in peak form. Your tax dollars are doing... something.'
      : avgScore >= 5
        ? "Moderately absurd. About what you'd expect from 535 people who can't agree on lunch."
        : 'Surprisingly reasonable. Check back tomorrow.';

  const funFacts = [
    `At current rates, Congress will pass ${Math.round(realBills.length * 0.1)} of these bills. The rest will die in committee, like your hopes.`,
    `The average bill title is ${Math.round(bills.reduce((sum, b) => sum + b.data.title.length, 0) / bills.length)} characters. Brevity is not Congress's strong suit.`,
    `${sensibleBills.length} satirical bills actually make more sense than ${realBills.length} real ones. Democracy!`,
  ];

  const stats = {
    _disclaimer: "This API is satirical. The absurdity scores are real. That's the joke.",
    _snark: commentary,
    _funFact: funFacts[Math.floor(Math.random() * funFacts.length)],
    generated: new Date().toISOString(),
    generatedBy: 'Definitely not an intern',
    totals: {
      all: bills.length,
      real: realBills.length,
      satirical: notBills.length,
      sensible: sensibleBills.length,
      absurd: absurdBills.length,
      featured: featuredCount,
      _note: `${featuredCount} bills are featured. The criteria? Vibes.`,
    },
    absurdity: {
      average: avgScore,
      billsWithScore: billsWithAbsurdity.length,
      distribution: absurdityDistribution,
      _analysis: `${getLabel(Math.round(avgScore))} territory`,
    },
    byCategory: categories,
    byStatus: statuses,
    topTags,
    dateRange: {
      oldest: oldestDate,
      newest: newestDate,
      _observation: 'Some of these bills are older than TikTok. Congress moves fast.',
    },
    congressNumbers,
    _credits: {
      poweredBy: 'Caffeine and disillusionment',
      dataSource: 'Congress.gov (the real absurdity)',
      builtWith: 'Astro, TypeScript, and a healthy distrust of institutions',
    },
  };

  return new Response(JSON.stringify(stats, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
