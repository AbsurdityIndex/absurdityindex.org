import type Database from 'better-sqlite3';

export type BillArchetype = 'omnibus' | 'appropriations' | 'naming' | 'commemorative' | 'general';

export interface DiscoveredBill {
  id: number;
  congress: number;
  bill_type: string;
  bill_number: number;
  title: string;
  sponsor: string | null;
  sponsor_party: string | null;
  sponsor_state: string | null;
  policy_area: string | null;
  subjects_json: string | null;
  latest_action_text: string | null;
  latest_action_date: string | null;
  cosponsor_count: number;
  summary_text: string | null;

  prefilter_score: number;
  prefilter_signals: string | null;
  prefilter_passed: number;

  ai_score: number | null;
  ai_explanation: string | null;
  ai_category: string | null;
  ai_angle: string | null;
  ai_scored_at: string | null;

  archetype: BillArchetype | null;

  status: string;
  ingested_slug: string | null;
  congress_gov_url: string | null;
  discovered_at: string;
}

export type DiscoveredBillStatus =
  | 'discovered'
  | 'filtered-out'
  | 'scored'
  | 'candidate'
  | 'dismissed'
  | 'ingested';

export interface UpsertBillInput {
  congress: number;
  billType: string;
  billNumber: number;
  title: string;
  sponsor?: string;
  sponsorParty?: string;
  sponsorState?: string;
  policyArea?: string;
  latestActionText?: string;
  latestActionDate?: string;
  cosponsorCount?: number;
  congressGovUrl?: string;
}

export function createDiscoveredBillModel(db: Database.Database) {
  const upsert = db.prepare(`
    INSERT INTO discovered_bills (
      congress, bill_type, bill_number, title, sponsor, sponsor_party, sponsor_state,
      policy_area, latest_action_text, latest_action_date, cosponsor_count, congress_gov_url
    ) VALUES (
      @congress, @bill_type, @bill_number, @title, @sponsor, @sponsor_party, @sponsor_state,
      @policy_area, @latest_action_text, @latest_action_date, @cosponsor_count, @congress_gov_url
    )
    ON CONFLICT(congress, bill_type, bill_number) DO UPDATE SET
      title = excluded.title,
      sponsor = excluded.sponsor,
      sponsor_party = excluded.sponsor_party,
      sponsor_state = excluded.sponsor_state,
      policy_area = excluded.policy_area,
      latest_action_text = excluded.latest_action_text,
      latest_action_date = excluded.latest_action_date,
      cosponsor_count = excluded.cosponsor_count,
      congress_gov_url = excluded.congress_gov_url
  `);

  const updatePrefilter = db.prepare(`
    UPDATE discovered_bills SET
      prefilter_score = @prefilter_score,
      prefilter_signals = @prefilter_signals,
      prefilter_passed = @prefilter_passed,
      status = CASE WHEN @prefilter_passed = 0 THEN 'filtered-out' ELSE status END
    WHERE id = @id
  `);

  const updateAiScore = db.prepare(`
    UPDATE discovered_bills SET
      ai_score = @ai_score,
      ai_explanation = @ai_explanation,
      ai_category = @ai_category,
      ai_angle = @ai_angle,
      ai_scored_at = datetime('now'),
      subjects_json = @subjects_json,
      summary_text = @summary_text,
      cosponsor_count = @cosponsor_count,
      status = CASE WHEN @ai_score >= @threshold THEN 'candidate' ELSE 'scored' END
    WHERE id = @id
  `);

  const updateStatus = db.prepare(`
    UPDATE discovered_bills SET status = @status WHERE id = @id
  `);

  const updateIngested = db.prepare(`
    UPDATE discovered_bills SET status = 'ingested', ingested_slug = @slug WHERE id = @id
  `);

  const updateArchetype = db.prepare(`
    UPDATE discovered_bills SET archetype = @archetype WHERE id = @id
  `);

  const countArchetypeInCongress = db.prepare(`
    SELECT COUNT(*) as n FROM discovered_bills
    WHERE congress = @congress AND archetype = @archetype
  `);

  return {
    upsert(input: UpsertBillInput): DiscoveredBill {
      upsert.run({
        congress: input.congress,
        bill_type: input.billType,
        bill_number: input.billNumber,
        title: input.title,
        sponsor: input.sponsor ?? null,
        sponsor_party: input.sponsorParty ?? null,
        sponsor_state: input.sponsorState ?? null,
        policy_area: input.policyArea ?? null,
        latest_action_text: input.latestActionText ?? null,
        latest_action_date: input.latestActionDate ?? null,
        cosponsor_count: input.cosponsorCount ?? 0,
        congress_gov_url: input.congressGovUrl ?? null,
      });
      return db.prepare(
        'SELECT * FROM discovered_bills WHERE congress = ? AND bill_type = ? AND bill_number = ?'
      ).get(input.congress, input.billType, input.billNumber) as DiscoveredBill;
    },

    setPrefilter(id: number, score: number, signals: string[], passed: boolean): void {
      updatePrefilter.run({
        id,
        prefilter_score: score,
        prefilter_signals: JSON.stringify(signals),
        prefilter_passed: passed ? 1 : 0,
      });
    },

    setAiScore(
      id: number,
      opts: {
        score: number;
        explanation: string;
        category: string;
        angle: string;
        subjectsJson?: string;
        summaryText?: string;
        cosponsorCount?: number;
        threshold: number;
      },
    ): void {
      updateAiScore.run({
        id,
        ai_score: opts.score,
        ai_explanation: opts.explanation,
        ai_category: opts.category,
        ai_angle: opts.angle,
        subjects_json: opts.subjectsJson ?? null,
        summary_text: opts.summaryText ?? null,
        cosponsor_count: opts.cosponsorCount ?? 0,
        threshold: opts.threshold,
      });
    },

    setStatus(id: number, status: DiscoveredBillStatus): void {
      updateStatus.run({ id, status });
    },

    markIngested(id: number, slug: string): void {
      updateIngested.run({ id, slug });
    },

    setArchetype(id: number, archetype: BillArchetype): void {
      updateArchetype.run({ id, archetype });
    },

    countByArchetypeInCongress(congress: number, archetype: BillArchetype): number {
      const row = countArchetypeInCongress.get({ congress, archetype }) as any;
      return row.n;
    },

    getById(id: number): DiscoveredBill | undefined {
      return db.prepare('SELECT * FROM discovered_bills WHERE id = ?').get(id) as DiscoveredBill | undefined;
    },

    exists(congress: number, billType: string, billNumber: number): boolean {
      const row = db.prepare(
        'SELECT 1 FROM discovered_bills WHERE congress = ? AND bill_type = ? AND bill_number = ?'
      ).get(congress, billType, billNumber);
      return !!row;
    },

    getCandidates(minScore: number, limit: number): DiscoveredBill[] {
      return db.prepare(
        `SELECT * FROM discovered_bills
         WHERE status = 'candidate' AND ai_score >= ?
         ORDER BY ai_score DESC
         LIMIT ?`
      ).all(minScore, limit) as DiscoveredBill[];
    },

    getByStatus(status: DiscoveredBillStatus, limit = 100): DiscoveredBill[] {
      return db.prepare(
        'SELECT * FROM discovered_bills WHERE status = ? ORDER BY discovered_at DESC LIMIT ?'
      ).all(status, limit) as DiscoveredBill[];
    },

    getStats(): {
      total: number;
      byStatus: Record<string, number>;
      avgAiScore: number;
      topCategories: Array<{ category: string; count: number }>;
      lastScanAt: string | null;
    } {
      const total = (db.prepare('SELECT COUNT(*) as n FROM discovered_bills').get() as any).n;

      const statusRows = db.prepare(
        'SELECT status, COUNT(*) as n FROM discovered_bills GROUP BY status'
      ).all() as Array<{ status: string; n: number }>;
      const byStatus: Record<string, number> = {};
      for (const r of statusRows) byStatus[r.status] = r.n;

      const avgRow = db.prepare(
        'SELECT AVG(ai_score) as avg FROM discovered_bills WHERE ai_score IS NOT NULL'
      ).get() as any;

      const topCategories = db.prepare(
        `SELECT ai_category as category, COUNT(*) as count
         FROM discovered_bills WHERE ai_category IS NOT NULL
         GROUP BY ai_category ORDER BY count DESC LIMIT 5`
      ).all() as Array<{ category: string; count: number }>;

      const lastRow = db.prepare(
        'SELECT MAX(discovered_at) as last FROM discovered_bills'
      ).get() as any;

      return {
        total,
        byStatus,
        avgAiScore: avgRow?.avg ?? 0,
        topCategories,
        lastScanAt: lastRow?.last ?? null,
      };
    },

    /** Count bills discovered in the last N days */
    countRecent(days: number): number {
      const row = db.prepare(
        `SELECT COUNT(*) as n FROM discovered_bills
         WHERE discovered_at >= datetime('now', '-' || ? || ' days')`
      ).get(days) as any;
      return row.n;
    },
  };
}
