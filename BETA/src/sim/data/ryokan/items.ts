import type { ItemId } from '../../state/GameState';

export interface ItemDef {
  id: ItemId;
  name: string;
  short: string;
  examine: string;
  color: string;
  /** inline SVG (viewBox 0 0 64 64) */
  svg: string;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  paper_lantern_shard: {
    id: 'paper_lantern_shard',
    name: 'Осколок фонаря',
    short: 'ФОНАРЬ',
    examine:
      'Тонкая бумага пропитана дождём. На внутренней стороне тушью: «не смотри в сад после третьего удара». Край оборван ровно.',
    color: '#e8a020',
    svg: `<circle cx="32" cy="28" r="16" fill="none" stroke="#e8a020" stroke-width="2"/>
      <path d="M32 12 V8 M24 14 L20 10 M40 14 L44 10" stroke="#e8a020" stroke-width="1.5"/>
      <path d="M20 36 Q32 48 44 36" fill="none" stroke="#c49020" stroke-width="1.5"/>
      <path d="M26 24 L30 32 L38 20" fill="none" stroke="#ffcc66" stroke-width="1.5" opacity="0.8"/>
      <rect x="28" y="44" width="8" height="10" fill="none" stroke="#8a7030" stroke-width="1.5"/>`,
  },
  wet_key_half: {
    id: 'wet_key_half',
    name: 'Половина ключа · А',
    short: 'КЛЮЧ·А',
    examine: 'Холодный металл, излом свежий. Зубья в иле. На обухе едва читается «SASA…».',
    color: '#00d4e8',
    svg: `<circle cx="18" cy="32" r="10" fill="none" stroke="#00d4e8" stroke-width="2"/>
      <circle cx="18" cy="32" r="4" fill="none" stroke="#00d4e8" stroke-width="1.5"/>
      <path d="M28 32 H48" stroke="#00d4e8" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M48 32 V26 M48 32 V38" stroke="#007a88" stroke-width="2" stroke-linecap="round"/>
      <path d="M40 28 V36" stroke="#007a88" stroke-width="1.5"/>
      <path d="M52 28 L58 32 L52 36" fill="none" stroke="#6a7590" stroke-width="1.2" stroke-dasharray="2 2"/>`,
  },
  wet_key_other: {
    id: 'wet_key_other',
    name: 'Половина ключа · Б',
    short: 'КЛЮЧ·Б',
    examine: 'Вторая половина. Излом совпадает с первой. Пахнет сырым деревом веранды.',
    color: '#00d4e8',
    svg: `<path d="M8 28 L18 32 L8 36" fill="none" stroke="#6a7590" stroke-width="1.2" stroke-dasharray="2 2"/>
      <path d="M16 32 H40" stroke="#00d4e8" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M28 28 V36 M34 26 V38 M40 28 V36" stroke="#007a88" stroke-width="2" stroke-linecap="round"/>
      <rect x="40" y="26" width="14" height="12" rx="1" fill="none" stroke="#00d4e8" stroke-width="2"/>
      <path d="M44 32 H50" stroke="#00d4e8" stroke-width="1.5"/>`,
  },
  ryokan_key: {
    id: 'ryokan_key',
    name: 'Ключ рёкана',
    short: 'КЛЮЧ',
    examine: 'Собранный ключ. На мгновение теплеет в ладони. Бородка подходит под замок генкана.',
    color: '#1ec99a',
    svg: `<circle cx="16" cy="32" r="10" fill="none" stroke="#1ec99a" stroke-width="2"/>
      <circle cx="16" cy="32" r="4" fill="#1ec99a" opacity="0.35"/>
      <path d="M26 32 H52" stroke="#1ec99a" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M40 28 V36 M46 26 V38 M52 28 V36" stroke="#0a8a68" stroke-width="2" stroke-linecap="round"/>
      <circle cx="16" cy="32" r="14" fill="none" stroke="#1ec99a" stroke-width="0.8" opacity="0.4"/>`,
  },
  kokeshi_note: {
    id: 'kokeshi_note',
    name: 'Записка кокэси',
    short: 'ЗАПИСКА',
    examine: 'Жёсткий почерк. «Если услышишь суставы — уже поздно. — М.» Ниже схема коридора и крест на чулане.',
    color: '#e01a6f',
    svg: `<rect x="14" y="10" width="36" height="44" rx="2" fill="none" stroke="#e01a6f" stroke-width="2"/>
      <path d="M20 20 H44 M20 28 H40 M20 36 H42 M20 44 H36" stroke="#e01a6f" stroke-width="1.2" opacity="0.7"/>
      <circle cx="48" cy="14" r="3" fill="#e01a6f"/>
      <path d="M48 14 V8" stroke="#c5cddc" stroke-width="1"/>
      <path d="M32 48 L32 52 M28 50 H36" stroke="#e02848" stroke-width="1.5"/>`,
  },
  silk_thread: {
    id: 'silk_thread',
    name: 'Шёлковая нить',
    short: 'НИТЬ',
    examine: 'Почти невидимая. Липкая на концах — не от росы. Тянется из тёмного угла сада.',
    color: '#c5cddc',
    svg: `<path d="M12 40 Q20 12 32 32 Q44 52 52 20" fill="none" stroke="#c5cddc" stroke-width="1.5"/>
      <path d="M14 38 Q22 14 32 30" fill="none" stroke="#00d4e8" stroke-width="0.8" opacity="0.5"/>
      <circle cx="12" cy="40" r="3" fill="none" stroke="#e01a6f" stroke-width="1"/>
      <circle cx="52" cy="20" r="3" fill="none" stroke="#e01a6f" stroke-width="1"/>`,
  },
  matchbox: {
    id: 'matchbox',
    name: 'Спичечный коробок',
    short: 'СПИЧКИ',
    examine: 'Пустой на вид. Внутри одна сырая спичка. На крышке печать штаба Востока, перечёркнутая красным.',
    color: '#e02848',
    svg: `<rect x="12" y="20" width="40" height="24" rx="2" fill="none" stroke="#e02848" stroke-width="2"/><rect x="16" y="24" width="32" height="16" fill="none" stroke="#8a2030" stroke-width="1"/><path d="M20 28 H44 M20 36 H36" stroke="#6a7590" stroke-width="1.2"/><path d="M22 22 L42 42 M42 22 L22 42" stroke="#e02848" stroke-width="1.5" opacity="0.7"/>`,
  },
  medicinal_herbs: {
    id: 'medicinal_herbs', name: 'Горькие травы', short: 'ТРАВЫ',
    examine: 'Пучок горьких листьев, перевязанный сухим стеблем. Пахнет землёй и полынью. Если растереть листья, сок остановит кровь.',
    color: '#91b66c',
    svg: `<path d="M32 54 Q26 35 12 20 Q31 20 32 43 Q36 19 53 13 Q52 36 34 48" fill="#668b55" stroke="#a9c98a" stroke-width="2"/><path d="M32 54 Q31 35 32 16 M32 38 L20 28 M33 32 L45 22" stroke="#c5d99a" stroke-width="2" fill="none"/>`,
  },
  copper_bell: {
    id: 'copper_bell', name: 'Медный колокольчик', short: 'ЗВОНОК',
    examine: 'Старый колокольчик с трещиной у края. Внутри нет язычка. Даже без звука от него становится спокойнее.',
    color: '#c58a52',
    svg: `<path d="M18 42 Q20 35 22 24 Q32 10 42 24 Q44 35 46 42 Z" fill="#8e633f" stroke="#d9ae78" stroke-width="2"/><path d="M15 43 H49 M29 48 Q32 53 35 48" stroke="#d9ae78" stroke-width="2" fill="none"/><circle cx="32" cy="22" r="3" fill="#e9c18b"/>`,
  },
  herbal_poultice: {
    id: 'herbal_poultice', name: 'Травяная повязка', short: 'ПОВЯЗКА',
    examine: 'Свежие листья, плотно обёрнутые шёлковой нитью. Пахнет горечью. Повязка может восстановить 25 единиц здоровья.',
    color: '#9ab77a',
    svg: `<path d="M15 24 Q32 12 49 24 L45 43 Q32 53 19 43 Z" fill="#718e5a" stroke="#c2d39a" stroke-width="2"/><path d="M18 30 L46 38 M20 39 L43 27" stroke="#e0d5b0" stroke-width="3"/>`,
  },
  warding_charm: {
    id: 'warding_charm', name: 'Тихий оберег', short: 'ОБЕРЕГ',
    examine: 'Осколок фонаря, обмотанный шёлком. На бумаге проступил знак, которого раньше не было. Оберег возвращает 20 единиц рассудка.',
    color: '#d0b77a',
    svg: `<path d="M32 8 L49 25 L32 56 L15 25 Z" fill="#b49b65" fill-opacity=".25" stroke="#d8c48d" stroke-width="2"/><path d="M32 16 V48 M22 29 H42 M25 39 L39 23" stroke="#e9d8a8" stroke-width="2"/>`,
  },
  ember_lantern: {
    id: 'ember_lantern', name: 'Тлеющий фонарь', short: 'ФОНАРЬ',
    examine: 'Спичка обожгла край бумаги, но не погасла. Внутри дрожит слабый огонёк. Свет помогает удержать мысли в темноте и возвращает 12 единиц рассудка.',
    color: '#e6a64f',
    svg: `<path d="M20 20 Q32 8 44 20 L48 39 Q32 54 16 39 Z" fill="#9d6332" fill-opacity=".35" stroke="#e6a64f" stroke-width="2"/><path d="M32 14 Q22 29 32 38 Q42 29 32 14" fill="#ffd17b" stroke="#fff0bf" stroke-width="1.5"/><path d="M24 45 H40" stroke="#e6a64f" stroke-width="2"/>`,
  },
};

export const RECIPES = [
  {
    a: 'wet_key_half' as ItemId,
    b: 'wet_key_other' as ItemId,
    result: 'ryokan_key' as ItemId,
    message: 'Половины сомкнулись с тихим щелчком. Ключ целый. Металл на мгновение теплеет.',
  },
  {
    a: 'medicinal_herbs' as ItemId, b: 'silk_thread' as ItemId,
    result: 'herbal_poultice' as ItemId,
    message: 'Ты растираешь листья и стягиваешь их шёлковой нитью. Получилась лечебная повязка.',
  },
  {
    a: 'paper_lantern_shard' as ItemId, b: 'silk_thread' as ItemId,
    result: 'warding_charm' as ItemId,
    message: 'Нить легла на бумагу странным знаком. Получился тихий оберег.',
  },
  {
    a: 'paper_lantern_shard' as ItemId, b: 'matchbox' as ItemId,
    result: 'ember_lantern' as ItemId,
    message: 'Сырая спичка вспыхнула неестественно ровно. Осколок фонаря удержал огонёк.',
  },
];

export function itemSvgMarkup(id: ItemId, size = 48): string {
  const it = ITEMS[id];
  if (!it) return '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">${it.svg}</svg>`;
}
