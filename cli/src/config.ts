import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// CLI root is always cli/ regardless of whether running from src/ or dist/
// From dist/: __dirname = cli/dist → CLI_ROOT = cli/ (up 1)
// From src/:  __dirname = cli/src → CLI_ROOT = cli/ (up 1)
const CLI_ROOT = path.resolve(__dirname, '..');
const PROJECT_ROOT = path.resolve(CLI_ROOT, '..');

export interface Config {
  // X API (read-only, bearer token)
  xBearerToken: string;

  // Browser automation
  browserStatePath: string;
  headless: boolean;

  // Anthropic
  anthropicApiKey: string;

  // Congress.gov
  congressApiKey: string;

  // Site
  siteUrl: string;

  // Paths
  billsDir: string;
  sessionStatusPath: string;
  dataDir: string;
  dbPath: string;

  // Safety thresholds
  safetyAutoPostThreshold: number;
  safetyReviewThreshold: number;

  // Auto mode
  maxPostsPerDay: number;
  minPostIntervalMinutes: number;
  peakHoursStart: number;
  peakHoursEnd: number;

  // Logging
  logLevel: string;

  // Dry run
  dryRun: boolean;
}

function loadEnvFile(): void {
  const envPaths = [
    path.resolve(CLI_ROOT, '.env'),         // cli/.env
    path.resolve(PROJECT_ROOT, '.env'),     // project root .env
  ];

  for (const envPath of envPaths) {
    try {
      const envText = fs.readFileSync(envPath, 'utf-8');
      for (const line of envText.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq > 0) {
          const key = trimmed.slice(0, eq).trim();
          const val = trimmed.slice(eq + 1).trim();
          if (!process.env[key]) process.env[key] = val;
        }
      }
    } catch {
      // .env files are optional
    }
  }
}

function loadRcFile(): Record<string, unknown> {
  const rcPath = path.resolve(CLI_ROOT, '.notcongressrc.json');
  try {
    return JSON.parse(fs.readFileSync(rcPath, 'utf-8'));
  } catch {
    return {};
  }
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  loadEnvFile();
  const rc = loadRcFile();

  const env = (key: string, fallback = ''): string =>
    (overrides[key as keyof Config] as string) ?? (process.env[key] ?? ((rc[key] as string) ?? fallback));

  const num = (key: string, envKey: string, fallback: number): number =>
    (overrides[key as keyof Config] as number) ?? (Number(process.env[envKey]) || fallback);

  return {
    xBearerToken: env('X_BEARER_TOKEN'),
    browserStatePath: env('BROWSER_STATE_PATH', path.resolve(CLI_ROOT, 'data/.browser-state')),
    headless: (process.env.BROWSER_HEADLESS ?? 'true') !== 'false',
    anthropicApiKey: env('ANTHROPIC_API_KEY'),
    congressApiKey: env('CONGRESS_API_KEY'),
    siteUrl: env('SITE_URL', 'https://not-congress.io'),

    billsDir: path.resolve(PROJECT_ROOT, 'src/data/bills'),
    sessionStatusPath: path.resolve(PROJECT_ROOT, 'src/data/session-status.json'),
    dataDir: path.resolve(CLI_ROOT, 'data'),
    dbPath: path.resolve(CLI_ROOT, 'data/not-congress.db'),

    safetyAutoPostThreshold: num('safetyAutoPostThreshold', 'SAFETY_AUTO_POST_THRESHOLD', 20),
    safetyReviewThreshold: num('safetyReviewThreshold', 'SAFETY_REVIEW_THRESHOLD', 40),

    maxPostsPerDay: num('maxPostsPerDay', 'MAX_POSTS_PER_DAY', 8),
    minPostIntervalMinutes: num('minPostIntervalMinutes', 'MIN_POST_INTERVAL_MINUTES', 45),
    peakHoursStart: num('peakHoursStart', 'PEAK_HOURS_START', 9),
    peakHoursEnd: num('peakHoursEnd', 'PEAK_HOURS_END', 21),

    logLevel: env('LOG_LEVEL', 'info'),
    dryRun: overrides.dryRun ?? false,
  };
}
