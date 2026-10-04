import type { LocationId } from './locations';
import type { ItemId } from '../../state/Inventory';

export type HotspotId =
  | 'hs_lantern'
  | 'hs_pond'
  | 'hs_silk'
  | 'hs_board_gap'
  | 'hs_genkan_door'
  | 'hs_note'
  | 'hs_matches'
  | 'hs_anchor';

export interface HotspotDef {
  id: HotspotId;
  location: LocationId;
  x: number;
  y: number;
  w: number;
  h: number;
  cursor: 'look' | 'hand' | 'door' | 'use';
  label: string;
  examine: string;
  item?: ItemId;
  takenFlag?: string;
  hideWhenFlag?: string;
  useWith?: ItemId[];
  useFlag?: string;
  useSuccess?: string;
  useFail?: string;
  complete?: boolean;
}

export const HOTSPOTS: HotspotDef[] = [
  {
    id: 'hs_lantern',
    location: 'gate',
    x: 28, y: 42, w: 12, h: 18,
    cursor: 'hand',
    label: 'Бумажный фонарь',
    examine:
      'Фонарь качается на цепочке. Бумага порвана. Внутри — только осколок каркаса и клочок с надписью. Ты можешь забрать осколок.',
    item: 'paper_lantern_shard',
    takenFlag: 'took_lantern',
    hideWhenFlag: 'took_lantern',
  },
  {
    id: 'hs_pond',
    location: 'garden',
    x: 55, y: 62, w: 16, h: 14,
    cursor: 'hand',
    label: 'Пруд',
    examine:
      'Чёрная вода. На дне что-то блестит — не отражение луны. Ты запускаешь руку в холод и вытаскиваешь половину ключа.',
    item: 'wet_key_half',
    takenFlag: 'took_key_a',
    hideWhenFlag: 'took_key_a',
  },
  {
    id: 'hs_silk',
    location: 'garden',
    x: 22, y: 48, w: 10, h: 12,
    cursor: 'look',
    label: 'Тень у камня',
    examine:
      'Между валунами натянута почти невидимая нить. Шёлк. Липкий. Ты сматываешь её, стараясь не порвать.',
    item: 'silk_thread',
    takenFlag: 'took_silk',
    hideWhenFlag: 'took_silk',
  },
  {
    id: 'hs_board_gap',
    location: 'engawa',
    x: 48, y: 72, w: 14, h: 10,
    cursor: 'hand',
    label: 'Щель в досках',
    examine:
      'Одна доска шатается. Под ней — вторая половина ключа, завернутая в мокрую тряпку. Кто-то прятал её недавно.',
    item: 'wet_key_other',
    takenFlag: 'took_key_b',
    hideWhenFlag: 'took_key_b',
  },
  {
    id: 'hs_genkan_door',
    location: 'engawa',
    x: 70, y: 38, w: 14, h: 28,
    cursor: 'door',
    label: 'Дверь генкана',
    examine:
      'Тяжёлая раздвижная дверь. Замок не из этой эпохи — зубчатый, холодный. Без целого ключа не откроется.',
    useWith: ['ryokan_key'],
    useFlag: 'door_unlocked',
    useSuccess: 'Ключ поворачивается мягко, будто его ждали. Дверь поддаётся. Запах лака и пыли.',
    useFail: 'Замок не поддаётся. Нужен целый ключ, не осколки.',
  },
  {
    id: 'hs_note',
    location: 'hall',
    x: 40, y: 45, w: 10, h: 14,
    cursor: 'hand',
    label: 'Записка на стене',
    examine:
      'Приколота к стойке булавкой. Почерк жёсткий, кукольный. Это не просьба о помощи — инструкция.',
    item: 'kokeshi_note',
    takenFlag: 'took_note',
    hideWhenFlag: 'took_note',
  },
  {
    id: 'hs_matches',
    location: 'genkan',
    x: 30, y: 58, w: 8, h: 8,
    cursor: 'hand',
    label: 'Полка',
    examine:
      'На полке для обуви — коробок. Пустой на вид. Внутри одна сырая спичка и перечёркнутая печать.',
    item: 'matchbox',
    takenFlag: 'took_matches',
    hideWhenFlag: 'took_matches',
  },
  {
    id: 'hs_anchor',
    location: 'storage',
    x: 50, y: 48, w: 18, h: 22,
    cursor: 'use',
    label: 'Якорь сцены',
    examine:
      'В центре чулана — чёрный куб с гравировкой «ЦЕФЕЙ · NODE RK-01». Это не мебель. Это точка привязки сектора. Можно стабилизировать канал.',
    complete: true,
  },
];

export function hotspotsFor(loc: LocationId): HotspotDef[] {
  return HOTSPOTS.filter((h) => h.location === loc);
}
