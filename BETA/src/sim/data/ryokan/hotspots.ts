import type { LocationId, ItemId } from '../../state/GameState';

export interface HotspotDef {
  id: string;
  location: LocationId;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  examine: string;
  item?: ItemId;
  takenFlag?: string;
  useWith?: ItemId[];
  useFlag?: string;
  useSuccess?: string;
  complete?: boolean;
}

export const HOTSPOTS: HotspotDef[] = [
  {
    id: 'hs_lantern',
    location: 'gate',
    x: 32, y: 48, w: 11, h: 16,
    label: 'Бумажный фонарь',
    examine: 'Фонарь качается. Бумага порвана. Внутри осколок каркаса и клочок с надписью.',
    item: 'paper_lantern_shard',
    takenFlag: 'took_lantern',
  },
  {
    id: 'hs_pond',
    location: 'garden',
    x: 58, y: 64, w: 14, h: 12,
    label: 'Пруд',
    examine: 'Чёрная вода. На дне блестит металл. Ты вытаскиваешь половину ключа.',
    item: 'wet_key_half',
    takenFlag: 'took_key_a',
  },
  {
    id: 'hs_silk',
    location: 'garden',
    x: 24, y: 50, w: 9, h: 11,
    label: 'Тень у камня',
    examine: 'Между валунами — почти невидимая липкая нить. Ты сматываешь её.',
    item: 'silk_thread',
    takenFlag: 'took_silk',
  },
  {
    id: 'hs_herbs',
    location: 'garden',
    x: 72, y: 78, w: 9, h: 10,
    label: 'Травы у ступеней',
    examine: 'Под мокрым папоротником растут горькие травы. Листья целые, корни легко поддаются.',
    item: 'medicinal_herbs',
    takenFlag: 'took_herbs',
  },
  {
    id: 'hs_board',
    location: 'engawa',
    x: 48, y: 72, w: 13, h: 10,
    label: 'Щель в досках',
    examine: 'Доска шатается. Под ней — вторая половина ключа в мокрой тряпке.',
    item: 'wet_key_other',
    takenFlag: 'took_key_b',
  },
  {
    id: 'hs_door',
    location: 'engawa',
    x: 72, y: 40, w: 12, h: 26,
    label: 'Дверь генкана',
    examine: 'Тяжёлая дверь. Замок зубчатый. Без целого ключа не откроется.',
    useWith: ['ryokan_key'],
    useFlag: 'door_unlocked',
    useSuccess: 'Ключ поворачивается. Дверь поддаётся. Запах лака и пыли.',
  },
  {
    id: 'hs_matches',
    location: 'genkan',
    x: 30, y: 58, w: 8, h: 8,
    label: 'Полка',
    examine: 'Коробок на полке. Внутри сырая спичка и перечёркнутая печать.',
    item: 'matchbox',
    takenFlag: 'took_matches',
  },
  {
    id: 'hs_note',
    location: 'hall',
    x: 42, y: 46, w: 9, h: 12,
    label: 'Записка',
    examine: 'Приколота булавкой. «Если услышишь суставы — уже поздно. — М.»',
    item: 'kokeshi_note',
    takenFlag: 'took_note',
  },
  {
    id: 'hs_bell',
    location: 'hall',
    x: 61, y: 61, w: 8, h: 11,
    label: 'Колокольчик без языка',
    examine: 'Под полкой лежит медный колокольчик. Язычка нет, но металл почему-то тёплый.',
    item: 'copper_bell',
    takenFlag: 'took_bell',
  },
  {
    id: 'hs_seed', location: 'garden', x: 82, y: 56, w: 8, h: 10,
    label: 'Чёрное семя',
    examine: 'Между корнями лежит тёмное семя. Вокруг него дождевые капли стекают вверх по коре.',
    item: 'black_seed', takenFlag: 'took_black_seed',
  },
  {
    id: 'hs_mask', location: 'storage', x: 70, y: 43, w: 10, h: 14,
    label: 'Сшитая маска',
    examine: 'На полке сидит бумажная маска. Чёрная нить прошивает глазницы. Изнутри доносится слабое дыхание.',
    item: 'stitched_mask', takenFlag: 'took_stitched_mask',
  },
  {
    id: 'hs_anchor',
    location: 'storage',
    x: 50, y: 48, w: 16, h: 20,
    label: 'Якорь сцены',
    examine: 'Чёрный куб «ЦЕФЕЙ · NODE RK-01». Точка привязки сектора. Можно стабилизировать канал.',
    complete: true,
  },
];

export function hotspotsFor(loc: LocationId): HotspotDef[] {
  return HOTSPOTS.filter((h) => h.location === loc);
}
