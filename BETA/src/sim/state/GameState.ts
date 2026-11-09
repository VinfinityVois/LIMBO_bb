/** Unified sim state — Рёкан Phase A */

export type LocationId =
  | 'gate'
  | 'garden'
  | 'engawa'
  | 'genkan'
  | 'hall'
  | 'storage';

export type ItemId =
  | 'paper_lantern_shard'
  | 'mirror_shard'
  | 'mirror_lens'
  | 'wet_key_half'
  | 'wet_key_other'
  | 'ryokan_key'
  | 'kokeshi_note'
  | 'silk_thread'
  | 'matchbox'
  | 'medicinal_herbs'
  | 'copper_bell'
  | 'herbal_poultice'
  | 'warding_charm'
  | 'ember_lantern'
  | 'black_seed'
  | 'stitched_mask';

export interface DroppedItem { id: ItemId; location: LocationId; x: number; y: number; }

export interface GameState {
  location: LocationId;
  inventory: ItemId[];
  droppedItems: DroppedItem[];
  flags: Record<string, boolean>;
  visited: LocationId[];
  selected: ItemId | null;
  completed: boolean;
  ending: 'clear' | 'bind' | 'break' | null;
  defeated: boolean;
  muted: boolean;
  health: number;
  sanity: number;
  maskWorn: boolean;
  maskExposure: number;
  injuries: string[];
  /** Persistent notes and inner thoughts collected during this run. */
  memories: string[];
  /** Per-run random sound sequence; stable across reloads, regenerated on reset. */
  gutterPattern: Array<'short' | 'long'>;
  /** Exact archive run that produced this sector report. */
  campaignRunId: string | null;
}

const SAVE_KEY = 'limbo_sim_ryokan_v1';

function createGutterPattern(): Array<'short' | 'long'> {
  const length = 4 + Math.floor(Math.random() * 2);
  const pattern = Array.from({ length }, () => Math.random() < .5 ? 'short' as const : 'long' as const);
  if (pattern.every(beat => beat === pattern[0])) pattern[Math.floor(Math.random() * length)] = pattern[0] === 'short' ? 'long' : 'short';
  return pattern;
}

export function defaultState(): GameState {
  return {
    location: 'gate',
    inventory: [],
    droppedItems: [],
    flags: {},
    visited: ['gate'],
    selected: null,
    completed: false,
    ending: null,
    defeated: false,
    muted: localStorage.getItem('limbo_sim_mute') === '1',
    health: 100,
    sanity: 100,
    maskWorn: false,
    maskExposure: 0,
    injuries: [],
    memories: [],
    gutterPattern: createGutterPattern(),
    campaignRunId: null,
  };
}

export function loadState(): GameState {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultState();
    const p = JSON.parse(raw) as Partial<GameState>;
    return {
      ...defaultState(),
      ...p,
      inventory: Array.isArray(p.inventory) ? p.inventory : [],
      droppedItems: Array.isArray(p.droppedItems) ? p.droppedItems.filter((x): x is DroppedItem => !!x && typeof x.id === 'string' && typeof x.location === 'string' && typeof x.x === 'number' && typeof x.y === 'number') : [],
      flags: p.flags || {},
      visited: p.visited?.length ? p.visited : ['gate'],
      selected: p.selected ?? null,
      ending: p.ending === 'clear' || p.ending === 'bind' || p.ending === 'break' ? p.ending : null,
      defeated: p.defeated === true,
      health: typeof p.health === 'number' ? Math.max(0, Math.min(100, p.health)) : 100,
      sanity: typeof p.sanity === 'number' ? Math.max(0, Math.min(100, p.sanity)) : 100,
      maskWorn: p.maskWorn === true,
      maskExposure: typeof p.maskExposure === 'number' ? Math.max(0, p.maskExposure) : 0,
      injuries: Array.isArray(p.injuries) ? p.injuries.filter((x): x is string => typeof x === 'string') : [],
      memories: Array.isArray(p.memories) ? p.memories.filter((x): x is string => typeof x === 'string').slice(-80) : [],
      muted: localStorage.getItem('limbo_sim_mute') === '1',
      gutterPattern: Array.isArray(p.gutterPattern) && p.gutterPattern.length >= 4 && p.gutterPattern.length <= 5 && p.gutterPattern.every(x => x === 'short' || x === 'long') ? p.gutterPattern : defaultState().gutterPattern,
      campaignRunId: typeof p.campaignRunId === 'string' && p.campaignRunId ? p.campaignRunId : null,
    };
  } catch {
    return defaultState();
  }
}

export function saveState(s: GameState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      location: s.location,
      inventory: s.inventory,
      droppedItems: s.droppedItems,
      flags: s.flags,
      visited: s.visited,
      selected: s.selected,
      completed: s.completed,
      ending: s.ending,
      defeated: s.defeated,
      health: s.health,
      sanity: s.sanity,
      maskWorn: s.maskWorn,
      maskExposure: s.maskExposure,
      injuries: s.injuries,
      memories: s.memories,
      gutterPattern: s.gutterPattern,
      campaignRunId: s.campaignRunId,
    }));
  } catch { /* */ }
}

export function setMuted(s: GameState, v: boolean): void {
  s.muted = v;
  localStorage.setItem('limbo_sim_mute', v ? '1' : '0');
}

export function markSceneDone(): void {
  try {
    const KEY = 'limbo_scene_progress';
    const cur = parseInt(localStorage.getItem(KEY) || '0', 10);
    if (cur < 1) localStorage.setItem(KEY, '1');
    localStorage.setItem(`${KEY}_done_1`, '1');
  } catch { /* */ }
}

export function resetSim(): GameState {
  localStorage.removeItem(SAVE_KEY);
  return defaultState();
}
