import type { LocationId } from '../../state/GameState';

export interface LocationDef {
  id: LocationId;
  title: string;
  subtitle: string;
  /** single stock plate — parallax via scale + mouse */
  image: string;
  ambient: string;
  /** CSS filter to vary reuse of same plate */
  filter?: string;
  exits: { to: LocationId; label: string; x: number; y: number; needsItem?: string; needsFlag?: string; blockedText?: string }[];
}

/** Stock frames under /public/sim/img/ryokan/ */
export const LOCATIONS: Record<LocationId, LocationDef> = {
  gate: {
    id: 'gate',
    title: 'ВОРОТА',
    subtitle: 'Дождь · ночь',
    image: '/sim/img/ryokan/lok1/screen.png',
    ambient: 'rain',
    filter: 'saturate(0.75) contrast(1.08) brightness(0.92)',
    exits: [{ to: 'garden', label: 'В сад →', x: 78, y: 70 }],
  },
  garden: {
    id: 'garden',
    title: 'САД КАМНЕЙ',
    subtitle: 'Пруд · мох',
    image: '/sim/img/ryokan/lok1/1.png',
    ambient: 'rain_soft',
    filter: 'saturate(0.78) hue-rotate(-5deg) brightness(0.96)',
    exits: [
      { to: 'gate', label: '← Ворота', x: 12, y: 68 },
      { to: 'engawa', label: 'Веранда →', x: 82, y: 55 },
    ],
  },
  engawa: {
    id: 'engawa',
    title: 'ВЕРАНДА',
    subtitle: 'Мокрые доски',
    image: '/sim/img/ryokan/lok1/2.png',
    ambient: 'wood',
    filter: 'saturate(0.78) contrast(1.06) brightness(0.94)',
    exits: [
      { to: 'garden', label: '← Сад', x: 14, y: 62 },
      {
        to: 'genkan',
        label: 'Генкан →',
        x: 80,
        y: 48,
        needsItem: 'ryokan_key',
        needsFlag: 'door_unlocked',
        blockedText: 'Дверь заперта. Нужен целый ключ.',
      },
    ],
  },
  genkan: {
    id: 'genkan',
    title: 'ГЕНКАН',
    subtitle: 'Камень · лак',
    image: '/sim/img/ryokan/lok1/0.png',
    ambient: 'interior',
    filter: 'saturate(0.72) brightness(0.9) contrast(1.06)',
    exits: [
      { to: 'engawa', label: '← Веранда', x: 15, y: 58 },
      { to: 'hall', label: 'Коридор →', x: 78, y: 50 },
    ],
  },
  hall: {
    id: 'hall',
    title: 'КОРИДОР',
    subtitle: 'Узкий · эхо',
    image: '/sim/img/ryokan/lok1/screen.png',
    ambient: 'interior_low',
    filter: 'saturate(0.72) brightness(0.82) contrast(1.08) hue-rotate(8deg)',
    exits: [
      { to: 'genkan', label: '← Генкан', x: 12, y: 55 },
      { to: 'storage', label: 'Чулан →', x: 80, y: 52 },
    ],
  },
  storage: {
    id: 'storage',
    title: 'ЧУЛАН',
    subtitle: 'Якорь сцены',
    image: '/sim/img/ryokan/lok1/0.png',
    ambient: 'interior_low',
    filter: 'saturate(0.68) brightness(0.78) contrast(1.08)',
    exits: [{ to: 'hall', label: '← Коридор', x: 18, y: 58 }],
  },
};

export const LOCATION_ORDER: LocationId[] = [
  'gate', 'garden', 'engawa', 'genkan', 'hall', 'storage',
];
