/** Ryokan locations — House-of-Horrors atmosphere */

export type LocationId =
  | 'gate'
  | 'garden'
  | 'engawa'
  | 'genkan'
  | 'hall'
  | 'storage';

export interface ParallaxLayer {
  id: string;
  depth: number;
  gradient: string;
  label?: string;
}

export interface ExitDef {
  to: LocationId;
  label: string;
  x: number;
  y: number;
  needsFlag?: string;
  needsItem?: string;
  blockedText?: string;
}

export interface LocationDef {
  id: LocationId;
  title: string;
  subtitle: string;
  ambient: string;
  layers: ParallaxLayer[];
  exits: ExitDef[];
  vignette: string;
}

export const LOCATIONS: Record<LocationId, LocationDef> = {
  gate: {
    id: 'gate',
    title: 'ВОРОТА РЁКАНА',
    subtitle: 'Дождь · ночь · чужая территория',
    ambient: 'rain',
    vignette: 'rgba(2,4,10,0.55)',
    layers: [
      { id: 'sky', depth: 0.015, gradient: 'linear-gradient(180deg, #0a0e18 0%, #12182a 40%, #1a1520 100%)' },
      { id: 'trees', depth: 0.04, gradient: 'radial-gradient(ellipse at 50% 100%, #0d1520 0%, transparent 70%)', label: 'лес' },
      { id: 'gate', depth: 0.08, gradient: 'linear-gradient(180deg, transparent 30%, rgba(8,6,12,0.9) 100%)', label: 'ворота' },
      { id: 'rain', depth: 0.12, gradient: 'repeating-linear-gradient(185deg, transparent, transparent 6px, rgba(0,212,232,0.03) 7px)' },
    ],
    exits: [
      { to: 'garden', label: 'В сад камней →', x: 72, y: 68 },
    ],
  },
  garden: {
    id: 'garden',
    title: 'САД КАМНЕЙ',
    subtitle: 'Пруд · мох · чужое дыхание',
    ambient: 'rain_soft',
    vignette: 'rgba(4,8,6,0.5)',
    layers: [
      { id: 'fog', depth: 0.02, gradient: 'radial-gradient(ellipse at 40% 60%, #152018 0%, #080c10 80%)' },
      { id: 'stones', depth: 0.05, gradient: 'linear-gradient(180deg, transparent 50%, rgba(10,14,12,0.95) 100%)' },
      { id: 'water', depth: 0.07, gradient: 'radial-gradient(ellipse at 60% 75%, rgba(0,40,50,0.5) 0%, transparent 45%)' },
      { id: 'near', depth: 0.11, gradient: 'linear-gradient(180deg, transparent 70%, rgba(3,5,8,0.85) 100%)' },
    ],
    exits: [
      { to: 'gate', label: '← К воротам', x: 12, y: 70 },
      { to: 'engawa', label: 'На веранду →', x: 78, y: 55 },
    ],
  },
  engawa: {
    id: 'engawa',
    title: 'ВЕРАНДА',
    subtitle: 'Мокрые доски · щели · эхо',
    ambient: 'wood',
    vignette: 'rgba(6,4,8,0.5)',
    layers: [
      { id: 'night', depth: 0.02, gradient: 'linear-gradient(180deg, #0c1018 0%, #151018 100%)' },
      { id: 'house', depth: 0.05, gradient: 'linear-gradient(90deg, rgba(20,10,15,0.6) 0%, transparent 40%, rgba(12,8,18,0.7) 100%)' },
      { id: 'floor', depth: 0.09, gradient: 'linear-gradient(180deg, transparent 55%, rgba(8,6,10,0.95) 100%)' },
      { id: 'rails', depth: 0.13, gradient: 'linear-gradient(180deg, transparent 75%, rgba(0,0,0,0.5) 100%)' },
    ],
    exits: [
      { to: 'garden', label: '← В сад', x: 14, y: 62 },
      { to: 'genkan', label: 'В прихожую →', x: 80, y: 50, needsItem: 'ryokan_key', blockedText: 'Дверь генкана заперта. Нужен целый ключ.' },
    ],
  },
  genkan: {
    id: 'genkan',
    title: 'ГЕНКАН',
    subtitle: 'Камень · обувь призраков · запах лака',
    ambient: 'interior',
    vignette: 'rgba(8,6,10,0.45)',
    layers: [
      { id: 'wall', depth: 0.02, gradient: 'linear-gradient(180deg, #14101a 0%, #0a080e 100%)' },
      { id: 'tatami', depth: 0.06, gradient: 'linear-gradient(180deg, transparent 40%, rgba(18,14,10,0.8) 100%)' },
      { id: 'door', depth: 0.1, gradient: 'radial-gradient(ellipse at 50% 40%, rgba(30,20,15,0.4) 0%, transparent 50%)' },
    ],
    exits: [
      { to: 'engawa', label: '← На веранду', x: 15, y: 60 },
      { to: 'hall', label: 'В коридор →', x: 75, y: 48 },
    ],
  },
  hall: {
    id: 'hall',
    title: 'КОРИДОР',
    subtitle: 'Узкий · длинный · кто-то дышит за стеной',
    ambient: 'interior_low',
    vignette: 'rgba(5,4,8,0.6)',
    layers: [
      { id: 'dark', depth: 0.02, gradient: 'linear-gradient(90deg, #08060c 0%, #12101a 50%, #08060c 100%)' },
      { id: 'lamps', depth: 0.05, gradient: 'radial-gradient(ellipse at 30% 30%, rgba(232,160,32,0.08) 0%, transparent 40%)' },
      { id: 'floor', depth: 0.09, gradient: 'linear-gradient(180deg, transparent 60%, rgba(6,4,10,0.95) 100%)' },
    ],
    exits: [
      { to: 'genkan', label: '← Генкан', x: 12, y: 55 },
      { to: 'storage', label: 'Чулан →', x: 82, y: 52 },
    ],
  },
  storage: {
    id: 'storage',
    title: 'ЧУЛАН',
    subtitle: 'Пыль · ящики · якорь сцены',
    ambient: 'interior_low',
    vignette: 'rgba(4,2,6,0.65)',
    layers: [
      { id: 'black', depth: 0.02, gradient: 'linear-gradient(180deg, #0a0608 0%, #050308 100%)' },
      { id: 'crates', depth: 0.07, gradient: 'linear-gradient(180deg, transparent 45%, rgba(12,8,6,0.9) 100%)' },
      { id: 'dust', depth: 0.12, gradient: 'radial-gradient(circle at 50% 40%, rgba(0,212,232,0.06) 0%, transparent 50%)' },
    ],
    exits: [
      { to: 'hall', label: '← Коридор', x: 18, y: 58 },
    ],
  },
};

export const LOCATION_ORDER: LocationId[] = [
  'gate', 'garden', 'engawa', 'genkan', 'hall', 'storage',
];

export const MAP_EDGES: [LocationId, LocationId][] = [
  ['gate', 'garden'],
  ['garden', 'engawa'],
  ['engawa', 'genkan'],
  ['genkan', 'hall'],
  ['hall', 'storage'],
];
