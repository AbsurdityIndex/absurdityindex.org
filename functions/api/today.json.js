const ET_TIME_ZONE = 'America/New_York';
const CONGRESS_API_BASE = 'https://api.congress.gov/v3';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

function getEtDateParts(now = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: ET_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
  });

  const parts = formatter.formatToParts(now);
  const get = (name) => parts.find((part) => part.type === name)?.value ?? '';

  const year = Number.parseInt(get('year'), 10);
  const month = Number.parseInt(get('month'), 10);
  const day = Number.parseInt(get('day'), 10);
  const weekday = get('weekday');

  return {
    year,
    month,
    day,
    weekday,
    isoDate: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    label: `${weekday}, ${MONTH_NAMES[month - 1]} ${day}, ${year}`,
  };
}

function getCongressAndSession(etYear, etMonth, etDay) {
  const congress = Math.floor((etYear - 1789) / 2) + 1;

  // Congress starts Jan 3 in odd years. Keep edge-case handling explicit.
  if (etYear % 2 === 1 && (etMonth < 1 || (etMonth === 1 && etDay < 3))) {
    return { congress: congress - 1, session: 2 };
  }

  return {
    congress,
    session: etYear % 2 === 1 ? 1 : 2,
  };
}

function toEtIsoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ET_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const get = (name) => parts.find((part) => part.type === name)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function formatEtTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat('en-US', {
    timeZone: ET_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

function formatEtDateLabel(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const year = new Intl.DateTimeFormat('en-US', { timeZone: ET_TIME_ZONE, year: 'numeric' }).format(date);
  const month = new Intl.DateTimeFormat('en-US', { timeZone: ET_TIME_ZONE, month: 'numeric' }).format(date);
  const day = new Intl.DateTimeFormat('en-US', { timeZone: ET_TIME_ZONE, day: 'numeric' }).format(date);

  const weekdayIndex = Number.parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone: ET_TIME_ZONE, weekday: 'short' }).format(date)
      .replace(/\.$/, '')
      .replace('Sun', '0')
      .replace('Mon', '1')
      .replace('Tue', '2')
      .replace('Wed', '3')
      .replace('Thu', '4')
      .replace('Fri', '5')
      .replace('Sat', '6'),
    10
  );

  if (Number.isNaN(weekdayIndex)) return null;
  return `${WEEKDAY_NAMES[weekdayIndex]}, ${MONTH_NAMES[Number.parseInt(month, 10) - 1]} ${day}, ${year}`;
}

function formatEtDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const dateLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: ET_TIME_ZONE,
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);

  const timeLabel = formatEtTime(value);
  return timeLabel ? `${dateLabel} at ${timeLabel} ET` : `${dateLabel} ET`;
}

function formatLocation(location) {
  if (!location) return null;
  const parts = [location.building, location.room].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : null;
}

function cleanCommitteeName(name) {
  if (!name) return 'Committee Meeting';
  return name
    .replace(/^House\s+/i, '')
    .replace(/^Senate\s+/i, '')
    .trim();
}

function normalizeWhitespace(value) {
  if (!value) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function toRelatedBillLabel(bill) {
  if (!bill?.type || !bill?.number) return null;
  return `${bill.type} ${bill.number}`;
}

function toNominationLabel(item) {
  if (!item?.number) return null;
  const partRaw = item.part !== null && item.part !== undefined ? String(item.part) : '';
  if (!partRaw || partRaw === '0' || partRaw === '00') return `PN${item.number}`;
  const parsed = Number.parseInt(partRaw, 10);
  return Number.isNaN(parsed) ? `PN${item.number}-${partRaw}` : `PN${item.number}-${parsed}`;
}

function deriveMeetingFocus(meeting) {
  const combined = normalizeWhitespace(`${meeting?.title || ''} ${meeting?.committees?.[0]?.name || ''}`).toLowerCase();

  if (combined.includes('financial stability') || combined.includes('oversight council')) {
    return 'financial-stability oversight';
  }
  if (combined.includes('retirement')) {
    return 'retirement oversight';
  }
  if (combined.includes('pig butchering') || combined.includes('elder financial fraud')) {
    return 'anti-fraud enforcement';
  }
  if (combined.includes('child sexual abuse material')) {
    return 'child-safety criminal law package';
  }
  if (combined.includes('nomination')) {
    return 'nominations pipeline';
  }
  if (combined.includes('closed business meeting') || combined.includes('intelligence')) {
    return 'closed intelligence matters';
  }
  if (combined.includes('markup')) {
    return 'bill markup';
  }
  if (combined.includes('hearing')) {
    return 'oversight hearing';
  }

  return 'committee business';
}

function getApiKey(context, options) {
  if (options?.apiKey) return options.apiKey;
  if (context?.env?.CONGRESS_GOV_API_KEY) return context.env.CONGRESS_GOV_API_KEY;
  if (process.env.CONGRESS_GOV_API_KEY) return process.env.CONGRESS_GOV_API_KEY;
  return null;
}

async function congressFetch(path, { apiKey, params = {} }) {
  const target = new URL(`${CONGRESS_API_BASE}/${path.replace(/^\/+/, '')}`);
  target.searchParams.set('api_key', apiKey);
  target.searchParams.set('format', 'json');

  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') {
      target.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(target.toString(), {
    cf: {
      cacheEverything: true,
      cacheTtl: 180,
    },
  });

  if (!response.ok) {
    throw new Error(`Congress API ${response.status} for ${path}`);
  }

  return response.json();
}

async function mapLimit(items, limit, asyncMapper) {
  const result = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      result[current] = await asyncMapper(items[current], current);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return result;
}

function summarizeMeeting(meeting, chamber) {
  const primaryCommittee = cleanCommitteeName(meeting.committees?.[0]?.name);
  const secondaryCommittee = meeting.committees?.[1]?.name ? cleanCommitteeName(meeting.committees[1].name) : null;
  const relatedBills = Array.isArray(meeting.relatedItems?.bills)
    ? meeting.relatedItems.bills.map((item) => toRelatedBillLabel(item)).filter(Boolean)
    : [];
  const relatedNominations = Array.isArray(meeting.relatedItems?.nominations)
    ? meeting.relatedItems.nominations.map((item) => toNominationLabel(item)).filter(Boolean)
    : [];
  const witnessCount = Array.isArray(meeting.witnesses) ? meeting.witnesses.length : 0;
  const videoCount = Array.isArray(meeting.videos) ? meeting.videos.length : 0;
  const meetingDocumentCount = Array.isArray(meeting.meetingDocuments) ? meeting.meetingDocuments.length : 0;
  const focus = deriveMeetingFocus(meeting);
  const title = normalizeWhitespace(meeting.title || 'Committee meeting');
  const isClosed = /closed/i.test(title) || /closed/i.test(meeting.type || '');

  return {
    chamber: chamber === 'house' ? 'House' : 'Senate',
    committee: primaryCommittee,
    subcommittee: secondaryCommittee,
    title,
    type: meeting.type || null,
    status: meeting.meetingStatus || null,
    focus,
    time: formatEtTime(meeting.date),
    location: formatLocation(meeting.location),
    dateTime: meeting.date || null,
    eventId: meeting.eventId || null,
    isClosed,
    relatedBillCount: relatedBills.length,
    relatedNominationCount: relatedNominations.length,
    relatedBills: relatedBills.slice(0, 6),
    relatedNominations: relatedNominations.slice(0, 6),
    witnessCount,
    videoCount,
    meetingDocumentCount,
  };
}

function byDateTimeAsc(a, b) {
  const aTime = a.dateTime ? new Date(a.dateTime).getTime() : Number.MAX_SAFE_INTEGER;
  const bTime = b.dateTime ? new Date(b.dateTime).getTime() : Number.MAX_SAFE_INTEGER;
  return aTime - bTime;
}

async function fetchMeetingsForChamber({
  apiKey,
  congress,
  chamber,
  todayIsoDate,
  sourceHealth,
}) {
  const keyPrefix = `committeeMeeting:${chamber}`;

  try {
    const now = Date.now();
    const fourteenDaysAgo = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19) + 'Z';
    const inTwoDays = new Date(now + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19) + 'Z';

    const listResponse = await congressFetch(`committee-meeting/${congress}/${chamber}`, {
      apiKey,
      params: {
        limit: 250,
        fromDateTime: fourteenDaysAgo,
        toDateTime: inTwoDays,
      },
    });

    const listItems = Array.isArray(listResponse?.committeeMeetings) ? listResponse.committeeMeetings : [];

    // Meeting list responses are update-based; fetch detail for date filtering.
    const candidates = listItems.slice(0, 120);

    const detailResults = await mapLimit(candidates, 12, async (item) => {
      try {
        const detail = await congressFetch(`committee-meeting/${congress}/${chamber}/${item.eventId}`, { apiKey });
        const meeting = detail?.committeeMeeting;
        if (!meeting) return null;

        if (toEtIsoDate(meeting.date) !== todayIsoDate) {
          return null;
        }

        return summarizeMeeting(meeting, chamber);
      } catch {
        return null;
      }
    });

    const meetings = detailResults.filter(Boolean).sort(byDateTimeAsc);

    sourceHealth.push({
      key: keyPrefix,
      status: 'ok',
      count: meetings.length,
      fetchedCandidates: candidates.length,
    });

    return {
      chamber: chamber === 'house' ? 'House' : 'Senate',
      count: meetings.length,
      meetings,
      source: `https://api.congress.gov/v3/committee-meeting/${congress}/${chamber}`,
    };
  } catch (error) {
    sourceHealth.push({
      key: keyPrefix,
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      chamber: chamber === 'house' ? 'House' : 'Senate',
      count: 0,
      meetings: [],
      source: `https://api.congress.gov/v3/committee-meeting/${congress}/${chamber}`,
    };
  }
}

async function fetchHouseVotesToday({ apiKey, congress, session, todayIsoDate, sourceHealth }) {
  const sourceKey = 'houseVotes';

  try {
    const list = await congressFetch(`house-vote/${congress}/${session}`, {
      apiKey,
      params: { limit: 250 },
    });

    const votes = (Array.isArray(list?.houseRollCallVotes) ? list.houseRollCallVotes : [])
      .filter((vote) => toEtIsoDate(vote.startDate) === todayIsoDate)
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
      .map((vote) => ({
        rollCallNumber: vote.rollCallNumber,
        result: vote.result,
        voteType: vote.voteType,
        legislationType: vote.legislationType || null,
        legislationNumber: vote.legislationNumber || null,
        legislationUrl: vote.legislationUrl || null,
        time: formatEtTime(vote.startDate),
        startDate: vote.startDate,
        url: vote.url || null,
      }));

    sourceHealth.push({ key: sourceKey, status: 'ok', count: votes.length });

    return {
      countToday: votes.length,
      votes,
      source: `https://api.congress.gov/v3/house-vote/${congress}/${session}`,
    };
  } catch (error) {
    sourceHealth.push({
      key: sourceKey,
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      countToday: 0,
      votes: [],
      source: `https://api.congress.gov/v3/house-vote/${congress}/${session}`,
    };
  }
}

async function fetchDailyRecord({ apiKey, todayIsoDate, sourceHealth }) {
  const sourceKey = 'dailyCongressionalRecord';

  try {
    const list = await congressFetch('daily-congressional-record', {
      apiKey,
      params: { limit: 20 },
    });

    const issues = Array.isArray(list?.dailyCongressionalRecord) ? list.dailyCongressionalRecord : [];
    const todayIssue = issues.find((issue) => toEtIsoDate(issue.issueDate) === todayIsoDate) || null;
    const latestIssue = issues[0] || null;
    const targetIssue = todayIssue || latestIssue;

    let detailedIssue = null;
    let sectionNames = [];

    if (targetIssue?.volumeNumber && targetIssue?.issueNumber) {
      const detail = await congressFetch(
        `daily-congressional-record/${targetIssue.volumeNumber}/${targetIssue.issueNumber}`,
        { apiKey }
      );

      detailedIssue = detail?.issue || null;
      sectionNames = (Array.isArray(detailedIssue?.fullIssue?.sections)
        ? detailedIssue.fullIssue.sections.map((section) => section.name).filter(Boolean)
        : []);
    }

    sourceHealth.push({
      key: sourceKey,
      status: 'ok',
      issueDate: targetIssue?.issueDate || null,
      sectionCount: sectionNames.length,
    });

    return {
      todayIssueDate: todayIssue?.issueDate || null,
      latestIssueDate: latestIssue?.issueDate || null,
      issueDateUsed: targetIssue?.issueDate || null,
      issueUpdateDate: targetIssue?.updateDate || null,
      issueNumber: targetIssue?.issueNumber || null,
      volumeNumber: targetIssue?.volumeNumber || null,
      sections: sectionNames,
      source: 'https://api.congress.gov/v3/daily-congressional-record',
    };
  } catch (error) {
    sourceHealth.push({
      key: sourceKey,
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      todayIssueDate: null,
      latestIssueDate: null,
      issueDateUsed: null,
      issueUpdateDate: null,
      issueNumber: null,
      volumeNumber: null,
      sections: [],
      source: 'https://api.congress.gov/v3/daily-congressional-record',
    };
  }
}

function buildHouseStatus({ houseMeetings, houseVotes, dailyRecord }) {
  if (houseVotes.countToday > 0) {
    return {
      status: 'Voting Activity',
      summary: `House recorded ${houseVotes.countToday} vote${houseVotes.countToday === 1 ? '' : 's'} today.`,
      latestAction: {
        time: houseVotes.votes[houseVotes.votes.length - 1]?.time || null,
        text: `Latest roll call: #${houseVotes.votes[houseVotes.votes.length - 1]?.rollCallNumber ?? '-'} (${houseVotes.votes[houseVotes.votes.length - 1]?.result ?? 'Unknown'})`,
      },
      actions: houseVotes.votes.map((vote) => ({
        time: vote.time,
        text: `Roll call #${vote.rollCallNumber}: ${vote.result}${vote.legislationType && vote.legislationNumber ? ` on ${vote.legislationType} ${vote.legislationNumber}` : ''}`,
      })),
    };
  }

  if (houseMeetings.count > 0) {
    const first = houseMeetings.meetings[0];
    return {
      status: 'Committee Activity',
      summary: `${houseMeetings.count} House committee meeting${houseMeetings.count === 1 ? '' : 's'} listed today.`,
      latestAction: {
        time: first.time,
        text: `${first.committee}: ${first.title}`,
      },
      actions: houseMeetings.meetings.map((meeting) => ({
        time: meeting.time,
        text: `${meeting.committee}: ${meeting.title}`,
      })),
    };
  }

  if (dailyRecord.issueDateUsed) {
    return {
      status: 'No Same-Day Vote Data',
      summary: 'No same-day House roll calls were posted in the live feed.',
      latestAction: null,
      actions: [],
    };
  }

  return {
    status: 'No Public Update',
    summary: 'No House activity was returned by current Congress.gov API feeds for today.',
    latestAction: null,
    actions: [],
  };
}

function buildSenateStatus({ senateMeetings, dailyRecord }) {
  if (senateMeetings.count > 0) {
    const first = senateMeetings.meetings[0];
    return {
      status: 'Committee Activity',
      summary: `${senateMeetings.count} Senate committee meeting${senateMeetings.count === 1 ? '' : 's'} listed today.`,
      latestAction: {
        time: first.time,
        text: `${first.committee}: ${first.title}`,
      },
      actions: senateMeetings.meetings.map((meeting) => ({
        time: meeting.time,
        text: `${meeting.committee}: ${meeting.title}`,
      })),
    };
  }

  if (dailyRecord.issueDateUsed) {
    return {
      status: 'No Same-Day Floor Issue',
      summary: 'No same-day Senate floor issue was published in this feed window.',
      latestAction: null,
      actions: [],
    };
  }

  return {
    status: 'No Public Update',
    summary: 'No Senate activity was returned by current Congress.gov API feeds for today.',
    latestAction: null,
    actions: [],
  };
}

function buildSummary({ houseStatus, senateStatus, houseMeetings, senateMeetings, houseVotes, dailyRecord }) {
  const totalMeetings = houseMeetings.count + senateMeetings.count;
  const allMeetings = [...houseMeetings.meetings, ...senateMeetings.meetings].sort(byDateTimeAsc);
  const spotlight = allMeetings.slice(0, 3).map((meeting) => {
    const time = meeting.time || 'Time TBA';
    return `${time} ${meeting.committee}: ${meeting.focus}.`;
  });
  const closedCount = allMeetings.filter((meeting) => meeting.isClosed).length;
  const totalBillRefs = allMeetings.reduce((sum, meeting) => sum + (meeting.relatedBillCount || 0), 0);
  const totalNominationRefs = allMeetings.reduce((sum, meeting) => sum + (meeting.relatedNominationCount || 0), 0);

  const bullets = [];
  bullets.push(
    houseVotes.countToday > 0
      ? `Power center: floor votes plus committees. House has ${houseVotes.countToday} published roll call vote${houseVotes.countToday === 1 ? '' : 's'}.`
      : 'Power center: committees, not floor votes. House roll-call feed is quiet for today.'
  );

  if (spotlight.length > 0) {
    bullets.push(`Top agenda items: ${spotlight.join(' ')}`);
  }

  bullets.push(
    `Policy load: ${totalMeetings} committee meeting${totalMeetings === 1 ? '' : 's'} posted (${houseMeetings.count} House, ${senateMeetings.count} Senate), referencing ${totalBillRefs} bill${totalBillRefs === 1 ? '' : 's'} and ${totalNominationRefs} nomination item${totalNominationRefs === 1 ? '' : 's'}.`
  );

  if (closedCount > 0) {
    bullets.push(
      `Transparency meter: ${closedCount} meeting${closedCount === 1 ? '' : 's'} listed as closed session${closedCount === 1 ? '' : 's'} (official details are intentionally limited).`
    );
  }

  if (dailyRecord.issueDateUsed) {
    bullets.push(
      `Paper trail note: latest Congressional Record issue currently available is ${formatEtDateLabel(dailyRecord.issueDateUsed) || dailyRecord.issueDateUsed}.`
    );
  }

  const headline =
    houseVotes.countToday > 0
      ? `House votes are active and committees are stacked, with ${totalMeetings} posted meeting${totalMeetings === 1 ? '' : 's'} across both chambers.`
      : totalMeetings > 0
      ? `No same-day House roll-call fireworks; committees are carrying the workload with ${totalMeetings} posted meeting${totalMeetings === 1 ? '' : 's'}.`
      : 'Floor and committee feeds are quiet so far, pending later updates.';

  const deck =
    totalMeetings > 0
      ? `Satire desk: Congress managed ${totalMeetings} committee meeting${totalMeetings === 1 ? '' : 's'} while the House vote board stayed on standby mode.`
      : 'Satire desk: the legislative engines are idling, but paperwork never sleeps.';

  return {
    headline,
    deck,
    bullets,
  };
}

export async function buildTodayData({ apiKey, now = new Date() }) {
  if (!apiKey) {
    const today = getEtDateParts(now);
    return {
      generatedAt: new Date().toISOString(),
      timezone: ET_TIME_ZONE,
      dataSource: 'Static fallback',
      congress: null,
      session: null,
      today: {
        isoDate: today.isoDate,
        label: today.label,
      },
      chambers: {
        house: {
          chamber: 'House',
          status: 'No update',
          convenedAt: null,
          adjournedAt: null,
          nextConvene: null,
          latestAction: null,
          actions: [],
          source: 'Live House feed is not configured in this deployment.',
        },
        senate: {
          chamber: 'Senate',
          status: 'No update',
          previousMeetingDate: null,
          previousSummary: 'No Senate floor summary posted yet.',
          convenedAt: null,
          adjournedAt: null,
          nextMeetingDate: null,
          nextConveneTime: null,
          nextConvene: null,
          livestream: null,
          scheduleLastUpdated: null,
          source: 'Live Senate feed is not configured in this deployment.',
        },
      },
      committees: {
        totalToday: 0,
        house: {
          count: 0,
          meetings: [],
          source: 'Live House committee feed is not configured in this deployment.',
        },
        senate: {
          count: 0,
          meetings: [],
          source: 'Live Senate committee feed is not configured in this deployment.',
        },
        meetings: [],
      },
      votes: {
        house: {
          countToday: 0,
          votes: [],
          source: 'Live House vote feed is not configured in this deployment.',
        },
        senate: {
          countToday: null,
          votes: [],
          source: 'No Senate roll call endpoint is currently provided in the Congress.gov API v3 schema.',
        },
      },
      dailyCongressionalRecord: {
        issueDateUsed: null,
        latestIssueDate: null,
        sections: [],
        source: 'Live Congressional Record feed is not configured in this deployment.',
      },
      houseWeekAgenda: {
        weekOf: null,
        sections: [],
        source: 'House weekly agenda feed unavailable in this deployment.',
      },
      summary: {
        headline: 'Live congressional feeds are temporarily unavailable on this deployment.',
        deck: 'Satire desk fallback mode: monitoring resumes automatically when live data is configured.',
        bullets: [
          'House and Senate live feeds are not configured in this environment yet.',
          'This page will show baseline status until live source credentials are deployed.',
          'Editorial content and bill pages continue to work normally.',
        ],
      },
      sources: [
        {
          key: 'officialLiveFeeds',
          status: 'unavailable',
          error: 'Not configured in this deployment.',
        },
      ],
    };
  }

  const today = getEtDateParts(now);
  const { congress, session } = getCongressAndSession(today.year, today.month, today.day);
  const sourceHealth = [];

  const [houseMeetings, senateMeetings, houseVotes, dailyRecord] = await Promise.all([
    fetchMeetingsForChamber({
      apiKey,
      congress,
      chamber: 'house',
      todayIsoDate: today.isoDate,
      sourceHealth,
    }),
    fetchMeetingsForChamber({
      apiKey,
      congress,
      chamber: 'senate',
      todayIsoDate: today.isoDate,
      sourceHealth,
    }),
    fetchHouseVotesToday({ apiKey, congress, session, todayIsoDate: today.isoDate, sourceHealth }),
    fetchDailyRecord({ apiKey, todayIsoDate: today.isoDate, sourceHealth }),
  ]);

  const houseStatus = buildHouseStatus({ houseMeetings, houseVotes, dailyRecord });
  const senateStatus = buildSenateStatus({ senateMeetings, dailyRecord });

  const allMeetings = [...houseMeetings.meetings, ...senateMeetings.meetings].sort(byDateTimeAsc);

  const summary = buildSummary({
    houseStatus,
    senateStatus,
    houseMeetings,
    senateMeetings,
    houseVotes,
    dailyRecord,
  });

  return {
    generatedAt: new Date().toISOString(),
    timezone: ET_TIME_ZONE,
    dataSource: 'Congress.gov API v3',
    congress,
    session,
    today: {
      isoDate: today.isoDate,
      label: today.label,
    },
    chambers: {
      house: {
        chamber: 'House',
        status: houseStatus.status,
        convenedAt: null,
        adjournedAt: null,
        nextConvene: null,
        latestAction: houseStatus.latestAction,
        actions: houseStatus.actions.slice(0, 8),
        source: houseVotes.source,
      },
      senate: {
        chamber: 'Senate',
        status: senateStatus.status,
        previousMeetingDate: dailyRecord.issueDateUsed ? formatEtDateLabel(dailyRecord.issueDateUsed) : null,
        previousSummary: senateStatus.summary,
        convenedAt: null,
        adjournedAt: null,
        nextMeetingDate: null,
        nextConveneTime: null,
        nextConvene: null,
        livestream: null,
        scheduleLastUpdated: dailyRecord.issueUpdateDate,
        source: senateMeetings.source,
      },
    },
    committees: {
      totalToday: allMeetings.length,
      house: houseMeetings,
      senate: senateMeetings,
      meetings: allMeetings.map((meeting) => ({
        chamber: meeting.chamber,
        committee: meeting.committee,
        subcommittee: meeting.subcommittee,
        title: meeting.title,
        type: meeting.type,
        status: meeting.status,
        focus: meeting.focus,
        time: meeting.time,
        location: meeting.location,
        isClosed: meeting.isClosed,
        relatedBillCount: meeting.relatedBillCount,
        relatedNominationCount: meeting.relatedNominationCount,
        relatedBills: meeting.relatedBills,
        relatedNominations: meeting.relatedNominations,
        witnessCount: meeting.witnessCount,
        videoCount: meeting.videoCount,
        meetingDocumentCount: meeting.meetingDocumentCount,
      })),
    },
    votes: {
      house: houseVotes,
      senate: {
        countToday: null,
        votes: [],
        source: 'No Senate roll call endpoint is currently provided in the Congress.gov API v3 schema.',
      },
    },
    dailyCongressionalRecord: {
      issueDateUsed: dailyRecord.issueDateUsed,
      latestIssueDate: dailyRecord.latestIssueDate,
      sections: dailyRecord.sections,
      source: dailyRecord.source,
    },
    houseWeekAgenda: {
      weekOf: null,
      sections: [],
      source: 'Congress.gov API v3 does not expose the weekly House floor agenda in this endpoint set.',
    },
    summary,
    sources: sourceHealth,
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=120, s-maxage=300',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export async function onRequestGet(context = {}, options = {}) {
  const apiKey = getApiKey(context, options);
  const data = await buildTodayData({ apiKey });

  if (data.error) {
    return jsonResponse(data, 500);
  }

  return jsonResponse(data, 200);
}
