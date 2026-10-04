import type { ItemId } from './Inventory';
import type { LocationId } from '../data/ryokan/locations';

const SAVE_KEY = 'limbo_sim_ryokan_v1';

export interface SimState {
  location: LocationId;
  inventory: ItemId[];
  flags: Record<string, boolean>;
  visited: LocationId[];
  selectedItem: ItemId | null;
  combineSlot: ItemId | null;
  completed: boolean;
}

export function defaultState(): SimState {
  return {
    location: 'gate',
    inventory: [],
    flags: {},
    visited: ['gate'],
    selectedItem: null,
    combineSlot: null,
    completed: false,
  };
}

export function loadState(): SimState {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultState();
    const p = JSON.parse(raw) as Partial<SimState>;
    return {
      ...defaultState(),
      ...p,
      inventory: Array.isArray(p.inventory) ? p.inventory : [],
      flags: p.flags || {},
      visited: p.visited?.length ? p.visited : ['gate'],
    };
  } catch {
    return defaultState();
  }
}

export function saveState(s: SimState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch { /* */ }
}

export function resetState(): SimState {
  localStorage.removeItem(SAVE_KEY);
  return defaultState();
}

export function hasItem(s: SimState, id: ItemId): boolean {
  return s.inventory.includes(id);
}

export function addItem(s: SimState, id: ItemId): SimState {
  if (s.inventory.includes(id)) return s;
  return { ...s, inventory: [...s.inventory, id] };
}

export function removeItems(s: SimState, ids: ItemId[]): SimState {
  const set = new Set(ids);
  return {
    ...s,
    inventory: s.inventory.filter((i) => !set.has(i)),
    selectedItem: s.selectedItem && set.has(s.selectedItem) ? null : s.selectedItem,
    combineSlot: s.combineSlot && set.has(s.combineSlot) ? null : s.combineSlot,
  };
}

export function setFlag(s: SimState, key: string, val = true): SimState {
  return { ...s, flags: { ...s.flags, [key]: val } };
}

export function visit(s: SimState, loc: LocationId): SimState {
  if (s.visited.includes(loc)) return { ...s, location: loc };
  return { ...s, location: loc, visited: [...s.visited, loc] };
}
