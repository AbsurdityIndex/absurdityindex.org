#!/usr/bin/env node
/**
 * Bill Content Validation Script
 *
 * Validates that all bill MDX files have the required fields for their
 * respective UI components to render correctly.
 *
 * Run: node scripts/validate-bills.mjs
 * Or add to package.json: "validate": "node scripts/validate-bills.mjs"
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BILLS_DIR = path.join(__dirname, '../src/data/bills');

const STRICT_WARNINGS = process.argv.includes('--strict-warnings');

function parseMaxWarningsArg() {
  const raw = process.argv.find((arg) => arg.startsWith('--max-warnings='));
  if (!raw) return null;

  const value = Number.parseInt(raw.slice('--max-warnings='.length), 10);
  if (Number.isNaN(value) || value < 0) {
    console.error('Error: --max-warnings must be a non-negative integer.');
    process.exit(1);
  }

  return value;
}

const MAX_WARNINGS = parseMaxWarningsArg();

// ANSI color codes for terminal output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

/**
 * Required fields for ALL bill types (for core UI components)
 */
const REQUIRED_ALL = {
  // Header components
  title: 'BillHeader title',
  billNumber: 'BillHeader bill number badge',
  billType: 'BillTypeBadge / page routing',
  status: 'Status badge / CommitteeStamp',

  // Metadata grid
  sponsor: 'Sponsor metadata card',
  committee: 'Committee metadata card',
  dateIntroduced: 'Date metadata card',
  category: 'Category metadata card',

  // Content
  summary: 'Summary / TheGist fallback',
};

/**
 * Required fields for REAL bills only
 */
const REQUIRED_REAL = {
  // Header
  congressNumber: 'Congress number badge (e.g., "119th Congress")',

  // Sponsor details for PartyBalance
  sponsorParty: 'PartyBalance component',
  sponsorState: 'Sponsor state display',

  // AbsurdityMeter
  absurdityIndex: 'AbsurdityMeter score (1-10)',

  // Official source
  congressDotGovUrl: 'View on Congress.gov link',

  // PorkMeter (at least defined, can be 0)
  totalPork: 'PorkMeter component',
};

/**
 * Required fields for SENSIBLE/ABSURD bills
 */
const REQUIRED_SATIRICAL = {
  // Vote display (now uses "votes" not "vote")
  votes: 'Vote tally display (yeas/nays)',
};

/**
 * Recommended fields (warnings, not errors)
 */
const RECOMMENDED_REAL = {
  billEvolution: 'Bill Evolution modal (how the bill changed)',
  crsSummary: 'CRS Summary section',
  subtitle: 'Editorial subtitle',
};

const RECOMMENDED_SATIRICAL = {
  subtitle: 'Editorial subtitle',
  billEvolution: 'Bill Evolution (pork tracking)',
};

/**
 * Valid bill evolution stage names
 */
const VALID_STAGES = new Set([
  // Core lifecycle
  'introduced',
  'origin-committee',
  'origin-reported',
  'origin-floor',
  'origin-passed',
  'receiving-received',
  'receiving-committee',
  'receiving-reported',
  'receiving-floor',
  'cross-chamber-committee',
  'cross-chamber-passed',
  'receiving-amended',
  'receiving-passed',

  // Ping-pong / reconsideration
  'origin-considers-amendments',
  'origin-concurs',
  'origin-disagrees',

  // Conference
  'conference',
  'conference-requested',
  'conference-appointed',
  'conference-report-filed',
  'conference-house-adopts',
  'conference-senate-adopts',
  'enrolled',

  // Presidential action
  'presented-to-president',
  'final-passage',
  'signed',
  'pocket-vetoed',
  'became-law',
  'vetoed',
  'veto-override',
  'override-house-vote',
  'override-senate-vote',
  'override-successful',
  'veto-sustained',

  // Terminal states
  'died-in-committee',
  'died-on-floor',
  'died-in-conference',
  'expired',
  'stalled',
]);

/**
 * Validation for billEvolution stages
 */
function validateBillEvolution(evolution, _filename) {
  const warnings = [];
  const errors = [];

  if (!evolution || !Array.isArray(evolution)) {
    return { warnings, errors };
  }

  // Check for duplicate stages
  const stageCounts = {};
  evolution.forEach((stage, idx) => {
    if (!stage.stage) {
      errors.push(`billEvolution[${idx}] missing 'stage' field`);
      return;
    }
    stageCounts[stage.stage] = (stageCounts[stage.stage] || 0) + 1;
  });

  Object.entries(stageCounts).forEach(([stage, count]) => {
    if (count > 1) {
      errors.push(`Duplicate billEvolution stage: '${stage}' appears ${count} times`);
    }
  });

  // Check each stage has required fields and validate structure
  let prevDate = null;
  let prevPork = 0;

  evolution.forEach((stage, idx) => {
    // Validate stage name
    if (stage.stage && !VALID_STAGES.has(stage.stage)) {
      warnings.push(`billEvolution[${idx}] stage '${stage.stage}' is not a recognized stage name`);
    }

    if (!stage.date) {
      errors.push(`billEvolution[${idx}] (${stage.stage}) missing 'date'`);
    } else {
      // Check chronological order
      const currentDate = new Date(stage.date);
      if (prevDate && currentDate < prevDate) {
        warnings.push(
          `billEvolution[${idx}] (${stage.stage}) date ${stage.date} is before previous stage`,
        );
      }
      prevDate = currentDate;
    }

    if (!stage.paraphrasedText) {
      warnings.push(`billEvolution[${idx}] (${stage.stage}) missing 'paraphrasedText'`);
    }

    if (stage.cumulativePork === undefined) {
      warnings.push(`billEvolution[${idx}] (${stage.stage}) missing 'cumulativePork'`);
    } else {
      // Note: Negative pork is valid for bills that save money
      // Only warn if pork unexpectedly decreased mid-evolution (not from first stage)
      if (idx > 0 && stage.cumulativePork < prevPork && prevPork > 0) {
        warnings.push(
          `billEvolution[${idx}] (${stage.stage}) cumulativePork decreased from ${prevPork} to ${stage.cumulativePork}`,
        );
      }
      prevPork = stage.cumulativePork;
    }

    if (!stage.keyChanges || stage.keyChanges.length === 0) {
      warnings.push(`billEvolution[${idx}] (${stage.stage}) has no 'keyChanges'`);
    }

    // Validate porkItems if present
    if (stage.porkItems && Array.isArray(stage.porkItems)) {
      const porkResult = validatePorkItems(stage.porkItems, `billEvolution[${idx}]`);
      errors.push(...porkResult.errors);
      warnings.push(...porkResult.warnings);
    }
  });

  return { warnings, errors };
}

/**
 * Validate porkItems structure
 */
function validatePorkItems(porkItems, context) {
  const errors = [];
  const warnings = [];

  if (!porkItems || !Array.isArray(porkItems)) {
    return { errors, warnings };
  }

  const validCategories = new Set([
    'earmark',
    'tax-break',
    'tax-expenditure', // Broader category for tax-related costs
    'hidden-cost',
    'bureaucratic-expansion',
    'corporate-welfare',
    'unnecessary-study',
    'pet-project',
    'program-expansion', // Expanding existing programs
    'new-program', // Creating new programs
    'regulatory-burden', // New regulatory requirements
    'subsidy', // Direct subsidies
  ]);

  porkItems.forEach((item, idx) => {
    const itemContext = `${context}.porkItems[${idx}]`;

    // Required fields for PorkMeter display
    if (!item.description) {
      errors.push(`${itemContext} missing 'description'`);
    }
    if (item.amount === undefined) {
      errors.push(`${itemContext} missing 'amount'`);
    }
    if (!item.addedBy) {
      warnings.push(`${itemContext} missing 'addedBy'`);
    }
    if (!item.category) {
      warnings.push(`${itemContext} missing 'category'`);
    } else if (!validCategories.has(item.category)) {
      warnings.push(`${itemContext} category '${item.category}' is not a recognized category`);
    }

    // Validate sponsor structure if present
    if (item.sponsor) {
      if (!item.sponsor.name) {
        warnings.push(`${itemContext}.sponsor missing 'name'`);
      }
      if (item.sponsor.party && !['D', 'R', 'I'].includes(item.sponsor.party)) {
        errors.push(`${itemContext}.sponsor.party must be 'D', 'R', or 'I'`);
      }
    }
  });

  return { errors, warnings };
}

/**
 * Validate votes structure
 */
function validateVotes(votes, _filename) {
  const errors = [];
  const warnings = [];

  if (!votes) return { errors, warnings };

  if (votes.yeas === undefined) errors.push('votes.yeas is missing');
  if (votes.nays === undefined) errors.push('votes.nays is missing');
  if (votes.passed === undefined) errors.push('votes.passed is missing');

  // Check vote totals make sense
  if (votes.yeas !== undefined && votes.nays !== undefined) {
    const total = votes.yeas + votes.nays + (votes.notVoting || 0);
    // House has 435 members, Senate has 100
    if (total > 0 && total < 50) {
      warnings.push(`Vote total (${total}) seems low - verify this is correct`);
    }
    if (total > 535) {
      errors.push(`Vote total (${total}) exceeds maximum possible (535)`);
    }

    // Check passed status matches vote counts
    // Note: Senate cloture requires 60 votes, not simple majority
    if (total > 0 && votes.passed === true && votes.yeas <= votes.nays) {
      warnings.push(`Bill marked as passed but yeas (${votes.yeas}) <= nays (${votes.nays})`);
    }
    if (total > 0 && votes.passed === false && votes.yeas > votes.nays) {
      // This might be valid for Senate cloture votes (60 needed)
      if (votes.chamber !== 'senate' || votes.yeas >= 60) {
        warnings.push(
          `Bill marked as failed but yeas (${votes.yeas}) > nays (${votes.nays}) - if Senate cloture vote, 60 needed`,
        );
      }
    }
  }

  // Validate chamber
  if (votes.chamber && !['house', 'senate'].includes(votes.chamber)) {
    errors.push(`votes.chamber must be 'house' or 'senate', got '${votes.chamber}'`);
  }

  // Validate rollCallUrl format if present
  if (votes.rollCallUrl) {
    if (
      !votes.rollCallUrl.includes('clerk.house.gov') &&
      !votes.rollCallUrl.includes('senate.gov')
    ) {
      warnings.push(`rollCallUrl doesn't match expected Congress URL patterns`);
    }
  }

  return { errors, warnings };
}

/**
 * Valid US state codes
 */
const VALID_STATES = new Set([
  'AL',
  'AK',
  'AZ',
  'AR',
  'CA',
  'CO',
  'CT',
  'DE',
  'FL',
  'GA',
  'HI',
  'ID',
  'IL',
  'IN',
  'IA',
  'KS',
  'KY',
  'LA',
  'ME',
  'MD',
  'MA',
  'MI',
  'MN',
  'MS',
  'MO',
  'MT',
  'NE',
  'NV',
  'NH',
  'NJ',
  'NM',
  'NY',
  'NC',
  'ND',
  'OH',
  'OK',
  'OR',
  'PA',
  'RI',
  'SC',
  'SD',
  'TN',
  'TX',
  'UT',
  'VT',
  'VA',
  'WA',
  'WV',
  'WI',
  'WY',
  'DC',
  'PR',
  'GU',
  'VI',
  'AS',
  'MP', // Include territories
]);

/**
 * Validate sponsor/cosponsor data
 */
function validateSponsorData(data, _filename) {
  const errors = [];
  const warnings = [];

  // Check sponsorParty for real bills
  if (data.billType === 'real') {
    if (data.sponsorParty && !['D', 'R', 'I'].includes(data.sponsorParty)) {
      errors.push(`sponsorParty must be 'D', 'R', or 'I', got '${data.sponsorParty}'`);
    }

    if (data.sponsorState && !VALID_STATES.has(data.sponsorState)) {
      errors.push(`sponsorState '${data.sponsorState}' is not a valid US state code`);
    }
  }

  // Validate cosponsors array
  if (data.cosponsors && Array.isArray(data.cosponsors)) {
    data.cosponsors.forEach((cosponsor, idx) => {
      // Cosponsors can be either strings (for satirical bills) or objects (for real bills)
      if (typeof cosponsor === 'string') {
        // String format is valid for satirical bills
        if (data.billType === 'real') {
          warnings.push(
            `cosponsors[${idx}] is a string - real bills should use object format with name/party/state`,
          );
        }
      } else if (typeof cosponsor === 'object') {
        // Object format - validate structure
        if (!cosponsor.name) {
          errors.push(`cosponsors[${idx}] missing 'name'`);
        }
        if (cosponsor.party && !['D', 'R', 'I'].includes(cosponsor.party)) {
          errors.push(
            `cosponsors[${idx}] party must be 'D', 'R', or 'I', got '${cosponsor.party}'`,
          );
        }
        if (cosponsor.state && !VALID_STATES.has(cosponsor.state)) {
          warnings.push(`cosponsors[${idx}] state '${cosponsor.state}' may not be valid`);
        }
        if (cosponsor.bioguideId && !/^[A-Z]\d{6}$/.test(cosponsor.bioguideId)) {
          warnings.push(
            `cosponsors[${idx}] bioguideId '${cosponsor.bioguideId}' doesn't match expected format (X000000)`,
          );
        }
      }
    });

    // Real bills often store a truncated cosponsors list plus full cosponsorCount.
    // Only warn when the array exceeds cosponsorCount, which is inconsistent.
    if (
      data.billType === 'real' &&
      data.cosponsorCount !== undefined &&
      data.cosponsors.length > data.cosponsorCount
    ) {
      warnings.push(
        `cosponsorCount (${data.cosponsorCount}) is less than cosponsors array length (${data.cosponsors.length})`,
      );
    }
  }

  return { errors, warnings };
}

/**
 * Validate Congress.gov URL format
 */
function validateCongressUrl(data, _filename) {
  const errors = [];
  const warnings = [];

  if (!data.congressDotGovUrl) return { errors, warnings };

  const url = data.congressDotGovUrl;

  // Check URL format
  if (!url.startsWith('https://www.congress.gov/')) {
    errors.push(`congressDotGovUrl should start with 'https://www.congress.gov/'`);
  }

  // Check URL contains bill type and number
  if (data.billNumber) {
    // Normalize bill number for URL check (H.R. 25 -> house-bill/25 or house-resolution/25)
    const billNum = data.billNumber.toLowerCase();
    const isHouseBill = billNum.includes('h.r.') || billNum.includes('hr');
    const isSenateBill = billNum.includes('s.') && !billNum.includes('res');
    const isHouseRes = billNum.includes('h.res') || billNum.includes('hres');
    const isSenateRes = billNum.includes('s.res') || billNum.includes('sres');

    const urlLower = url.toLowerCase();
    const hasCorrectType =
      (isHouseBill && urlLower.includes('house-bill')) ||
      (isSenateBill && urlLower.includes('senate-bill')) ||
      (isHouseRes && urlLower.includes('house-resolution')) ||
      (isSenateRes && urlLower.includes('senate-resolution'));

    if (!hasCorrectType && data.billType === 'real') {
      warnings.push(`congressDotGovUrl may not match billNumber type`);
    }
  }

  return { errors, warnings };
}

/**
 * Check for common mistakes
 */
function checkCommonMistakes(data, _filename) {
  const errors = [];
  const warnings = [];

  // Check for wrong field name (vote vs votes)
  if (data.vote && !data.votes) {
    errors.push("Uses 'vote:' instead of 'votes:' (plural) - field name mismatch");
  }

  // Check absurdityIndex range for real bills
  if (data.billType === 'real') {
    if (data.absurdityIndex !== undefined) {
      if (data.absurdityIndex < 1 || data.absurdityIndex > 10) {
        errors.push(`absurdityIndex (${data.absurdityIndex}) must be between 1-10`);
      }
    }
  }

  // Check for empty required arrays that should have content
  if (data.billType === 'real') {
    if (data.actions?.length === 0) {
      warnings.push('actions array is empty - consider adding legislative actions');
    }
  }

  return { errors, warnings };
}

/**
 * Validate MDX content body
 */
function validateMdxContent(content, data, _filename) {
  const errors = [];
  const warnings = [];

  // Extract MDX body (after frontmatter)
  const bodyMatch = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  if (!bodyMatch) {
    errors.push('Could not extract MDX body content');
    return { errors, warnings };
  }

  const body = bodyMatch[1].trim();

  // Check for minimum content
  if (body.length < 100) {
    warnings.push(`MDX body is very short (${body.length} chars) - consider adding more content`);
  }

  // Check for required sections in real bills
  if (data.billType === 'real') {
    // Should have at least one markdown heading
    if (!body.includes('##')) {
      warnings.push('MDX body has no section headings (##) - consider adding structure');
    }

    // Should have source/disclaimer section
    if (!body.toLowerCase().includes('source') && !body.toLowerCase().includes('congress.gov')) {
      warnings.push('MDX body may be missing source attribution');
    }
  }

  // Check for broken markdown links
  const linkRegex = /\[([^\]]*)\]\(([^)]*)\)/g;
  let match;
  while ((match = linkRegex.exec(body)) !== null) {
    const linkText = match[1];
    const linkUrl = match[2];

    if (!linkUrl) {
      errors.push(`Broken markdown link: [${linkText}](empty url)`);
    }
    if (linkUrl && linkUrl.startsWith('http') && !linkUrl.startsWith('https://')) {
      warnings.push(`Non-HTTPS link found: ${linkUrl}`);
    }
  }

  // Check for placeholder text that shouldn't be in production
  const placeholders = ['TODO', 'FIXME', 'XXX', 'PLACEHOLDER', 'TBD'];
  placeholders.forEach((placeholder) => {
    if (body.includes(placeholder)) {
      warnings.push(`Found '${placeholder}' placeholder text in MDX body`);
    }
  });

  return { errors, warnings };
}

/**
 * Parse frontmatter from MDX file
 */
function parseFrontmatter(content) {
  const match = /^---\n([\s\S]*?)\n---/.exec(content);
  if (!match) return null;

  try {
    return yaml.load(match[1]);
  } catch (error) {
    console.warn(`Warning: failed to parse YAML frontmatter: ${error.message}`);
    return null;
  }
}

/**
 * Validate a single bill file
 */
function validateBill(filepath) {
  const filename = path.basename(filepath);
  const content = fs.readFileSync(filepath, 'utf-8');
  const frontmatterMatch = /^---\n([\s\S]*?)\n---/.exec(content);
  const frontmatterRaw = frontmatterMatch?.[1] || '';
  const data = parseFrontmatter(content);

  if (!data) {
    return {
      filename,
      errors: ['Could not parse frontmatter YAML'],
      warnings: [],
    };
  }

  const errors = [];
  const warnings = [];

  // Enforce editorial date-only convention (YYYY-MM-DD) for frontmatter dates.
  // We scan raw frontmatter because YAML loaders may coerce timestamps into Date objects.
  const timestampMatches = frontmatterRaw.match(/\b\d{4}-\d{2}-\d{2}T[0-9:.+-]+Z?\b/g);
  if (timestampMatches && timestampMatches.length > 0) {
    const unique = Array.from(new Set(timestampMatches));
    errors.push(
      `Frontmatter contains timestamp date(s): ${unique.join(', ')}. Use date-only YYYY-MM-DD.`,
    );
  }

  // Check required fields for all bill types
  Object.entries(REQUIRED_ALL).forEach(([field, component]) => {
    if (data[field] === undefined || data[field] === null || data[field] === '') {
      errors.push(`Missing '${field}' (required for: ${component})`);
    }
  });

  // Check bill-type-specific requirements
  if (data.billType === 'real') {
    Object.entries(REQUIRED_REAL).forEach(([field, component]) => {
      if (data[field] === undefined || data[field] === null) {
        errors.push(`Missing '${field}' (required for real bills: ${component})`);
      }
    });

    // Check recommended fields
    Object.entries(RECOMMENDED_REAL).forEach(([field, component]) => {
      if (
        data[field] === undefined ||
        data[field] === null ||
        (Array.isArray(data[field]) && data[field].length === 0)
      ) {
        warnings.push(`Missing '${field}' (recommended: ${component})`);
      }
    });
  } else if (data.billType === 'sensible' || data.billType === 'absurd') {
    Object.entries(REQUIRED_SATIRICAL).forEach(([field, component]) => {
      if (data[field] === undefined || data[field] === null) {
        errors.push(`Missing '${field}' (required for satirical bills: ${component})`);
      }
    });

    // Validate votes structure
    if (data.votes) {
      const votesResult = validateVotes(data.votes, filename);
      errors.push(...votesResult.errors);
    }

    // Check recommended fields
    Object.entries(RECOMMENDED_SATIRICAL).forEach(([field, component]) => {
      if (
        data[field] === undefined ||
        data[field] === null ||
        (Array.isArray(data[field]) && data[field].length === 0)
      ) {
        warnings.push(`Missing '${field}' (recommended: ${component})`);
      }
    });
  }

  // Validate bill evolution if present
  if (data.billEvolution) {
    const evolutionResult = validateBillEvolution(data.billEvolution, filename);
    errors.push(...evolutionResult.errors);
    warnings.push(...evolutionResult.warnings);
  }

  // Validate sponsor data
  const sponsorResult = validateSponsorData(data, filename);
  errors.push(...sponsorResult.errors);
  warnings.push(...sponsorResult.warnings);

  // Validate Congress.gov URL for real bills
  if (data.billType === 'real') {
    const urlResult = validateCongressUrl(data, filename);
    errors.push(...urlResult.errors);
    warnings.push(...urlResult.warnings);
  }

  // Validate votes structure (for all bill types that have votes)
  if (data.votes) {
    const votesResult = validateVotes(data.votes, filename);
    errors.push(...votesResult.errors);
    warnings.push(...votesResult.warnings);
  }

  // Validate MDX content structure
  const contentResult = validateMdxContent(content, data, filename);
  errors.push(...contentResult.errors);
  warnings.push(...contentResult.warnings);

  // Check common mistakes
  const mistakesResult = checkCommonMistakes(data, filename);
  errors.push(...mistakesResult.errors);
  warnings.push(...mistakesResult.warnings);

  return { filename, errors, warnings, billType: data.billType };
}

/**
 * Main validation runner
 */
function main() {
  console.log(`\n${colors.bold}${colors.cyan}Bill Content Validator${colors.reset}\n`);
  console.log(`${colors.dim}Scanning: ${BILLS_DIR}${colors.reset}\n`);
  if (STRICT_WARNINGS) {
    console.log(`${colors.dim}Warning mode: strict (any warning fails validation)${colors.reset}`);
  } else if (MAX_WARNINGS !== null) {
    console.log(`${colors.dim}Warning mode: max ${MAX_WARNINGS}${colors.reset}`);
  }
  if (STRICT_WARNINGS || MAX_WARNINGS !== null) {
    console.log();
  }

  // Get all MDX files (excluding templates)
  const files = fs.readdirSync(BILLS_DIR).filter((f) => f.endsWith('.mdx') && !f.startsWith('_'));

  console.log(`Found ${files.length} bill files to validate\n`);

  let totalErrors = 0;
  let totalWarnings = 0;
  const results = { real: [], sensible: [], absurd: [], unknown: [] };

  files.forEach((file) => {
    const filepath = path.join(BILLS_DIR, file);
    const result = validateBill(filepath);

    // Categorize by bill type
    const category = result.billType || 'unknown';
    results[category] = results[category] || [];
    results[category].push(result);

    totalErrors += result.errors.length;
    totalWarnings += result.warnings.length;
  });

  // Print results by category
  ['real', 'sensible', 'absurd'].forEach((category) => {
    const categoryResults = results[category] || [];
    if (categoryResults.length === 0) return;

    console.log(
      `${colors.bold}${category.toUpperCase()} BILLS (${categoryResults.length})${colors.reset}`,
    );
    console.log(`${colors.dim}${'─'.repeat(50)}${colors.reset}`);

    categoryResults.forEach((result) => {
      if (result.errors.length === 0 && result.warnings.length === 0) {
        console.log(`  ${colors.green}OK${colors.reset} ${result.filename}`);
      } else {
        console.log(
          `  ${result.errors.length > 0 ? colors.red + 'ERR' : colors.yellow + 'WARN'}${colors.reset} ${result.filename}`,
        );

        result.errors.forEach((err) => {
          console.log(`    ${colors.red}ERROR:${colors.reset} ${err}`);
        });
        result.warnings.forEach((warn) => {
          console.log(`    ${colors.yellow}WARN:${colors.reset} ${warn}`);
        });
      }
    });

    console.log();
  });

  // Print summary
  console.log(`${colors.bold}SUMMARY${colors.reset}`);
  console.log(`${colors.dim}${'─'.repeat(50)}${colors.reset}`);
  console.log(`  Total files:    ${files.length}`);
  console.log(`  ${colors.red}Errors:${colors.reset}         ${totalErrors}`);
  console.log(`  ${colors.yellow}Warnings:${colors.reset}       ${totalWarnings}`);
  console.log();

  if (totalErrors > 0) {
    console.log(
      `${colors.red}${colors.bold}Validation FAILED${colors.reset} - fix errors before deploying\n`,
    );
    process.exit(1);
  } else if (STRICT_WARNINGS && totalWarnings > 0) {
    console.log(
      `${colors.red}${colors.bold}Validation FAILED${colors.reset} - warnings are treated as errors in strict mode\n`,
    );
    process.exit(1);
  } else if (MAX_WARNINGS !== null && totalWarnings > MAX_WARNINGS) {
    console.log(
      `${colors.red}${colors.bold}Validation FAILED${colors.reset} - warnings (${totalWarnings}) exceed allowed max (${MAX_WARNINGS})\n`,
    );
    process.exit(1);
  } else if (totalWarnings > 0) {
    console.log(`${colors.yellow}${colors.bold}Validation PASSED with warnings${colors.reset}\n`);
    process.exit(0);
  } else {
    console.log(`${colors.green}${colors.bold}Validation PASSED${colors.reset}\n`);
    process.exit(0);
  }
}

main();
