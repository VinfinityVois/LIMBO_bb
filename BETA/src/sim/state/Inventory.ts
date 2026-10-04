/** Inventory + combine recipes for LIMBO sim */

export type ItemId =
  | 'paper_lantern_shard'
  | 'wet_key_half'
  | 'wet_key_other'
  | 'ryokan_key'
  | 'kokeshi_note'
  | 'silk_thread'
  | 'matchbox';

export interface ItemDef {
  id: ItemId;
  name: string;
  short: string;
  examine: string;
  icon: string; // emoji / glyph fallback
  color: string;
}

export interface Recipe {
  a: ItemId;
  b: ItemId;
  result: ItemId;
  message: string;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  paper_lantern_shard: {
    id: 'paper_lantern_shard',
    name: 'Осколок бумажного фонаря',
    short: 'ФОНАРЬ',
    examine:
      'Тонкая бумага пропитана дождём. На внутренней стороне — тушью: «не смотри в сад после третьего удара». Край оборван ровно, будто ножом.',
    icon: '◈',
    color: '#e8a020',
  },
  wet_key_half: {
    id: 'wet_key_half',
    name: 'Половина ключа (А)',
    short: 'КЛЮЧ·А',
    examine:
      'Холодный металл, излом свежий. Зубья смазаны илом пруда. На обухе едва читается «SASAKI».',
    icon: '🗝️',
    color: '#00d4e8',
  },
  wet_key_other: {
    id: 'wet_key_other',
    name: 'Половина ключа (Б)',
    short: 'КЛЮЧ·Б',
    examine:
      'Вторая половина. Излом совпадает с первой. Пахнет сырым деревом веранды.',
    icon: '🗝️',
    color: '#00d4e8',
  },
  ryokan_key: {
    id: 'ryokan_key',
    name: 'Ключ рёкана',
    short: 'КЛЮЧ',
    examine:
      'Собранный ключ. Тёплый на ощупь — странно для металла. Бородка подходит под замок генкана.',
    icon: '🔑',
    color: '#1ec99a',
  },
  kokeshi_note: {
    id: 'kokeshi_note',
    name: 'Записка кокэси',
    short: 'ЗАПИСКА',
    examine:
      'Жёсткий почерк. «Гости не должны слышать, как двигаются суставы. Если услышишь — уже поздно. — М.» Ниже — схема коридора и крест на чулане.',
    icon: '📜',
    color: '#e01a6f',
  },
  silk_thread: {
    id: 'silk_thread',
    name: 'Шёлковая нить',
    short: 'НИТЬ',
    examine:
      'Тонкая, почти невидимая. Тянется из тёмного угла сада. Липкая на концах — не от росы.',
    icon: '糸',
    color: '#c5cddc',
  },
  matchbox: {
    id: 'matchbox',
    name: 'Спичечный коробок',
    short: 'СПИЧКИ',
    examine:
      'Пустой? Нет — одна сырая спичка. На крышке печать штаба Востока, перечёркнутая красным.',
    icon: '▣',
    color: '#e02848',
  },
};

export const RECIPES: Recipe[] = [
  {
    a: 'wet_key_half',
    b: 'wet_key_other',
    result: 'ryokan_key',
    message: 'Половины сомкнулись с тихим щелчком. Ключ целый. Металл на мгновение теплеет в ладони.',
  },
  {
    a: 'wet_key_other',
    b: 'wet_key_half',
    result: 'ryokan_key',
    message: 'Половины сомкнулись с тихим щелчком. Ключ целый. Металл на мгновение теплеет в ладони.',
  },
];

export function tryCombine(a: ItemId, b: ItemId): Recipe | null {
  return RECIPES.find((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a)) || null;
}
