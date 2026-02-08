export const DIRECTORY_PAGE_SIZE = 30;
export const SITE_URL = 'https://absurdityindex.org';

const monthYearFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

export function toCategorySlug(value) {
  return value.toLowerCase().replace(/\s+&\s+/g, '-').replace(/\s+/g, '-');
}

export function toSponsorSlug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function parseSponsor(sponsor) {
  const sponsorName = sponsor.replace(/\s*\([^)]+\)\s*$/, '').trim();
  const sponsorParty = sponsor.match(/\(([^)]+)\)/)?.[1] || '';
  return { sponsorName, sponsorParty };
}

export function sortByDateDesc(a, b) {
  return b.data.dateIntroduced.getTime() - a.data.dateIntroduced.getTime();
}

export function sortByDateAsc(a, b) {
  return a.data.dateIntroduced.getTime() - b.data.dateIntroduced.getTime();
}

export function sortRealBillsByAbsurdityThenDate(a, b) {
  const aScore = a.data.absurdityIndex ?? 0;
  const bScore = b.data.absurdityIndex ?? 0;
  if (bScore !== aScore) return bScore - aScore;
  return sortByDateDesc(a, b);
}

export function paginateItems(items, page = 1, pageSize = DIRECTORY_PAGE_SIZE) {
  const totalCount = items.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * pageSize;
  const pagedItems = items.slice(start, start + pageSize);

  return {
    totalCount,
    totalPages,
    currentPage,
    pageSize,
    items: pagedItems,
    hasMore: currentPage < totalPages,
  };
}

export function toApiBill(bill) {
  const { sponsorName, sponsorParty } = parseSponsor(bill.data.sponsor);
  const introducedDate = bill.data.dateIntroduced;
  const dateIntroducedIso = introducedDate.toISOString();

  return {
    id: bill.id,
    title: bill.data.title,
    billNumber: bill.data.billNumber,
    billType: bill.data.billType,
    category: bill.data.category,
    categorySlug: toCategorySlug(bill.data.category),
    tags: bill.data.tags ?? [],
    sponsor: bill.data.sponsor,
    sponsorSlug: toSponsorSlug(bill.data.sponsor),
    sponsorName,
    sponsorParty,
    committee: bill.data.committee ?? '',
    status: bill.data.status,
    summary: bill.data.summary,
    featured: Boolean(bill.data.featured),
    absurdityIndex: bill.data.absurdityIndex ?? null,
    congressDotGovUrl: bill.data.congressDotGovUrl ?? null,
    congressNumber: bill.data.congressNumber ?? null,
    realSource: bill.data.realSource ?? null,
    realJurisdiction: bill.data.realJurisdiction ?? null,
    dateIntroduced: dateIntroducedIso,
    dateIntroducedTs: introducedDate.getTime(),
    dateIntroducedLabel: monthYearFormatter.format(introducedDate),
    dateUpdated: bill.data.dateUpdated?.toISOString() ?? null,
    url: bill.data.billType === 'real' ? `/bills/${bill.id}` : `/not-bills/${bill.id}`,
  };
}

export function buildPaginatedApiPayload({
  page,
  total,
  totalPages,
  bills,
  endpointPath,
}) {
  const hasMore = page < totalPages;
  const nextPage = hasMore ? page + 1 : null;
  const prevPage = page > 1 ? page - 1 : null;

  return {
    generated: new Date().toISOString(),
    page,
    pageSize: DIRECTORY_PAGE_SIZE,
    count: bills.length,
    total,
    totalPages,
    hasMore,
    nextPage,
    nextPageUrl: nextPage ? `${SITE_URL}${endpointPath}/${nextPage}.json` : null,
    prevPage,
    prevPageUrl: prevPage ? `${SITE_URL}${endpointPath}/${prevPage}.json` : null,
    bills,
  };
}
