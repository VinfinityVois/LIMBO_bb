/** Persistent cumulative results and rewards shared by all LIMBO sectors. */
export type CampaignSectorResult = {
  score: number;
  grade: string;
  gradeTier: number;
  collected: number;
  used: number;
  clues: number;
  secrets: number;
  ending: string | null;
};

export type CampaignArchive = {
  version: 1;
  results: Record<string, CampaignSectorResult>;
  completedSectors: string[];
  totalScore: number;
  scoreCount: number;
  averageScore: number;
  totalCollected: number;
  totalUsed: number;
  totalClues: number;
  totalSecrets: number;
  bestCardTier: number;
  passTier: number;
};

export const CAMPAIGN_ARCHIVE_KEY = 'limbo_campaign_archive_v1';

function emptyArchive(): CampaignArchive {
  return {
    version: 1, results: {}, completedSectors: [], totalScore: 0, scoreCount: 0,
    averageScore: 0, totalCollected: 0, totalUsed: 0, totalClues: 0,
    totalSecrets: 0, bestCardTier: 1, passTier: 1
  };
}

export function loadCampaignArchive(): CampaignArchive {
  try {
    const saved = JSON.parse(localStorage.getItem(CAMPAIGN_ARCHIVE_KEY) || 'null') as Partial<CampaignArchive> | null;
    if (!saved || saved.version !== 1 || !saved.results || typeof saved.results !== 'object') return emptyArchive();
    const results = saved.results as Record<string, CampaignSectorResult>;
    return summarize(results);
  } catch {
    return emptyArchive();
  }
}

/** Re-recording the same sector replaces its result instead of inflating campaign totals. */
export function recordCampaignSector(sectorId: string, result: CampaignSectorResult): CampaignArchive {
  const current = loadCampaignArchive();
  current.results[sectorId] = result;
  const archive = summarize(current.results);
  try { localStorage.setItem(CAMPAIGN_ARCHIVE_KEY, JSON.stringify(archive)); } catch { /* report can still be shown */ }
  return archive;
}

function summarize(results: Record<string, CampaignSectorResult>): CampaignArchive {
  const records = Object.values(results);
  const totalScore = records.reduce((sum, item) => sum + (Number(item.score) || 0), 0);
  const scoreCount = records.length;
  const averageScore = scoreCount ? Math.round(totalScore / scoreCount) : 0;
  return {
    version: 1,
    results,
    completedSectors: Object.keys(results),
    totalScore,
    scoreCount,
    averageScore,
    totalCollected: records.reduce((sum, item) => sum + (Number(item.collected) || 0), 0),
    totalUsed: records.reduce((sum, item) => sum + (Number(item.used) || 0), 0),
    totalClues: records.reduce((sum, item) => sum + (Number(item.clues) || 0), 0),
    totalSecrets: records.reduce((sum, item) => sum + (Number(item.secrets) || 0), 0),
    bestCardTier: Math.max(1, ...records.map(item => Number(item.gradeTier) || 1)),
    // Pass level grows with the average performance across every completed sector.
    passTier: averageScore >= 84 ? 3 : averageScore >= 62 ? 2 : 1
  };
}
