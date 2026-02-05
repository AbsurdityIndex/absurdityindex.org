import fs from 'node:fs';
import path from 'node:path';
import { getLogger } from '../../utils/logger.js';

interface BlocklistData {
  keywords: string[];
  patterns: string[];
  topics: string[];
}

let blocklistData: BlocklistData | null = null;
let compiledPatterns: RegExp[] = [];

function loadBlocklist(dataDir: string): BlocklistData {
  if (blocklistData) return blocklistData;

  const log = getLogger();
  const filePath = path.join(dataDir, 'blocklist.json');

  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    blocklistData = {
      keywords: raw.keywords ?? [],
      patterns: raw.patterns ?? [],
      topics: raw.topics ?? [],
    };
    compiledPatterns = blocklistData.patterns.map(p => new RegExp(p, 'i'));
    log.debug({ keywords: blocklistData.keywords.length, patterns: compiledPatterns.length }, 'Blocklist loaded');
  } catch (err) {
    log.warn({ err }, 'Failed to load blocklist, using empty');
    blocklistData = { keywords: [], patterns: [], topics: [] };
  }

  return blocklistData;
}

export interface BlocklistResult {
  blocked: boolean;
  reason?: string;
  matchedTerm?: string;
}

export function checkBlocklist(content: string, dataDir: string): BlocklistResult {
  const data = loadBlocklist(dataDir);
  const lower = content.toLowerCase();

  // Check keywords
  for (const keyword of data.keywords) {
    if (lower.includes(keyword.toLowerCase())) {
      return { blocked: true, reason: 'blocklist_keyword', matchedTerm: keyword };
    }
  }

  // Check regex patterns
  for (let i = 0; i < compiledPatterns.length; i++) {
    const match = compiledPatterns[i]!.exec(content);
    if (match) {
      return { blocked: true, reason: 'blocklist_pattern', matchedTerm: data.patterns[i] };
    }
  }

  return { blocked: false };
}
