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
  /** Multiple independently inspectable finds at one search point. */
  items?: ItemId[];
  takenFlags?: string[];
  useWith?: ItemId[];
  useFlag?: string;
  useSuccess?: string;
  complete?: boolean;
  /** Scene artwork for a physical note pinned or left in the location. */
  art?: string;
  clueFlag?: string;
  clueText?: string;
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
    examine: 'Чёрная вода не отражает небо. На дне блестит металл. Ты вытаскиваешь первую половину ключа; на её изломе видны волокна шёлка.',
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
    examine: 'Доска шатается. На торце — три короткие царапины, почти скрытые мхом. Под ней — вторая половина ключа в мокрой тряпке.',
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
    id: 'hs_rain_gutter', location: 'gate', x: 78, y: 28, w: 7, h: 12,
    label: 'Водосточный желоб',
    examine: 'Дождевая вода идёт по желобу против уклона. Под краем вырезаны три короткие черты и одна длинная — тот же ритм, который возвращает эхо.',
  },
  {
    id: 'hs_footprint_wall', location: 'garden', x: 8, y: 34, w: 8, h: 14,
    label: 'Следы на стене',
    examine: 'Мокрые отпечатки ладоней тянутся вверх по стене. Между ними повторяется знак закрытого глаза. Под последним отпечатком процарапано: «Не всякая тень хочет войти».',
  },
  {
    id: 'hs_mirror_fragments', location: 'hall', x: 68, y: 70, w: 10, h: 12,
    label: 'Осколки разбитого зеркала',
    examine: 'Под шкафом лежат два похожих фрагмента. Каждый отражает разное время: один — комнату до пожара, другой — после. Можно забрать оба.',
    items: ['mirror_shard', 'mirror_shard'],
    takenFlags: ['took_mirror_shard_a', 'took_mirror_shard_b'],
  },
  {
    id: 'hs_mirror_panel', location: 'hall', x: 78, y: 38, w: 9, h: 16,
    label: 'Потемневшее стекло',
    examine: 'В стекле отражается коридор, которого нет за спиной. На миг видна фигура с перевязанными руками. Если направить сюда восстановленный свет, отражение исчезает.',
  },
  {
    id: 'hs_note_gate',
    location: 'gate',
    x: 88, y: 43, w: 4.8, h: 10,
    label: 'Мокрая записка у ворот',
    examine: 'Между доской и водостоком застрял сложенный лист. Бумага размокла по краям, но чернила ещё держатся.',
    art: '/assets/game/notes/note_gate.svg',
    clueFlag: 'clue_note_gate',
    clueText: 'Три коротких удара. Один длинный. Не звони, чтобы позвать — звони, чтобы предупредить. Бумажный осколок удержит нить; если встретит спичку, станет светом.',
  },
  {
    id: 'hs_note_garden',
    location: 'garden',
    x: 15, y: 66, w: 4.8, h: 10,
    label: 'Записка под камнем',
    examine: 'Край бумаги выглядывает из-под плоского камня. На ней остались отпечатки мокрых пальцев.',
    art: '/assets/game/notes/note_garden.svg',
    clueFlag: 'clue_note_garden',
    clueText: 'Горькие листья останавливают кровь. Шёлковая нить удерживает их вместе. Не затягивай слишком туго — под повязкой должно остаться место для дыхания.',
  },
  {
    id: 'hs_note_engawa',
    location: 'engawa',
    x: 58, y: 25, w: 4.8, h: 10,
    label: 'Записка под карнизом',
    examine: 'У карниза зацепился узкий листок. На нём нарисованы две половины одного ключа.',
    art: '/assets/game/notes/note_engawa.svg',
    clueFlag: 'clue_note_engawa',
    clueText: 'У каждой половины ключа свой излом. Не ищи замок, пока металл не станет целым. Три царапины отмечают доску, под которой лежит вторая часть.',
  },
  {
    id: 'hs_note_storage',
    location: 'storage',
    x: 82, y: 73, w: 4.8, h: 10,
    label: 'Записка у якоря',
    examine: 'Сухой лист сложен вчетверо и зажат между камнем и основанием якоря. На полях три символа: колокольчик, узел, огонь.',
    art: '/assets/game/notes/note_storage.svg',
    clueFlag: 'clue_note_storage',
    clueText: 'Сначала звук. Затем защита. И только после этого свет. Якорь не принимает силу — он принимает три свидетельства, принесённые из разных комнат.',
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
