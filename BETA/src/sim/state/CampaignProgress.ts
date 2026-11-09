/** Persistent cumulative results and every individual replay across LIMBO sectors. */
export type CampaignSectorResult = {
  score: number; grade: string; gradeTier: number; collected: number; used: number;
  clues: number; secrets: number; ending: string | null;
  completedAt?: string; health?: number; sanity?: number; visited?: number;
  items?: string[]; studiedItems?: string[]; clueNames?: string[]; secretNames?: string[]; encounters?: string[]; charms?: string[];
};
export type CampaignRun = CampaignSectorResult & {
  runId: string; sectorId: string; completedAt: string;
  legacy?: boolean;
};
export type CampaignArchive = {
  version: 1; results: Record<string, CampaignSectorResult>; runs: CampaignRun[];
  completedSectors: string[]; totalScore: number; scoreCount: number; averageScore: number;
  totalCollected: number; totalUsed: number; totalClues: number; totalSecrets: number;
  bestCardTier: number; passTier: number; charms: string[];
};
export const CAMPAIGN_ARCHIVE_KEY = 'limbo_campaign_archive_v1';
function emptyArchive(): CampaignArchive {
  return {version:1,results:{},runs:[],completedSectors:[],totalScore:0,scoreCount:0,averageScore:0,
    totalCollected:0,totalUsed:0,totalClues:0,totalSecrets:0,bestCardTier:0,passTier:0,charms:[]};
}
export function loadCampaignArchive(): CampaignArchive {
  try {
    const saved=JSON.parse(localStorage.getItem(CAMPAIGN_ARCHIVE_KEY)||'null') as Partial<CampaignArchive>|null;
    if(!saved||saved.version!==1||!saved.results||typeof saved.results!=='object') return emptyArchive();
    const results=saved.results as Record<string,CampaignSectorResult>;
    const runs=Array.isArray(saved.runs)?saved.runs as CampaignRun[]:
      Object.entries(results).map(([sectorId,r],i)=>({...r,sectorId,runId:'legacy-'+sectorId+'-'+i,
        completedAt:r.completedAt||'',legacy:true}));
    return summarize(results,runs,Array.isArray(saved.charms)?saved.charms:[]);
  } catch { return emptyArchive(); }
}
/** The latest result remains indexed by sector; the full append-only run log never overwrites a replay. */
export function recordCampaignSector(sectorId:string,result:CampaignSectorResult):CampaignArchive {
  const current=loadCampaignArchive();
  const completedAt=result.completedAt||new Date().toISOString();
  const run:CampaignRun={...result,sectorId,completedAt,runId:sectorId+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7)};
  current.results[sectorId]={...result,completedAt};
  current.runs.push(run);
  const charms=Array.from(new Set([...current.charms,...(result.charms||[])]));
  const archive=summarize(current.results,current.runs,charms);
  try{localStorage.setItem(CAMPAIGN_ARCHIVE_KEY,JSON.stringify(archive));}catch{/* report remains visible */}
  return archive;
}
function summarize(results:Record<string,CampaignSectorResult>,runs:CampaignRun[],charms:string[]):CampaignArchive {
  const records=runs.length?runs:Object.values(results);
  const totalScore=records.reduce((sum,x)=>sum+(Number(x.score)||0),0);
  const scoreCount=records.length,averageScore=scoreCount?Math.round(totalScore/scoreCount):0;
  return {version:1,results,runs,completedSectors:Object.keys(results),totalScore,scoreCount,averageScore,
    totalCollected:records.reduce((s,x)=>s+(Number(x.collected)||0),0),
    totalUsed:records.reduce((s,x)=>s+(Number(x.used)||0),0),
    totalClues:records.reduce((s,x)=>s+(Number(x.clues)||0),0),
    totalSecrets:records.reduce((s,x)=>s+(Number(x.secrets)||0),0),
    bestCardTier:Math.max(0,...records.map(x=>Number(x.gradeTier)||0)),
    passTier:averageScore>=84?3:averageScore>=62?2:scoreCount?1:0,charms};
}
