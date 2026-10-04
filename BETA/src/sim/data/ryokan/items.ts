/** Рёкан — предметы Phase A */
export type ItemId =
  | 'ceramic_shard'
  | 'wet_key_half'
  | 'wet_key_other'
  | 'ryokan_key'
  | 'scope_lens'
  | 'ofuda_core';

export interface ItemDef {
  id: ItemId;
  name: string;
  icon: string;
  examine: string;
}

const I = (n: number) => `sim/img/ryokan/items/${n}.png`;

export const ITEMS: Record<ItemId, ItemDef> = {
  ceramic_shard: {
    id: 'ceramic_shard',
    name: 'ОСКОЛОК ЧАШИ',
    icon: I(3),
    examine: 'Тонкий фарфоровый край. Киноварь: иероглиф «ждать».',
  },
  wet_key_half: {
    id: 'wet_key_half',
    name: 'МОКРАЯ ПОЛОВИНКА КЛЮЧА',
    icon: I(7),
    examine: 'Обломанный зубчатый край. Ил в прорези.',
  },
  wet_key_other: {
    id: 'wet_key_other',
    name: 'ВТОРАЯ ПОЛОВИНКА КЛЮЧА',
    icon: I(8),
    examine: 'Зубья совпадают с обломком из лужи.',
  },
  ryokan_key: {
    id: 'ryokan_key',
    name: 'КЛЮЧ РЁКАНА',
    icon: I(12),
    examine: 'Собранный ключ. Откроет проход к веранде.',
  },
  scope_lens: {
    id: 'scope_lens',
    name: 'ОПТИЧЕСКИЙ МОДУЛЬ',
    icon: I(1),
    examine: 'Визор штаба. Зелёная линза ещё жива.',
  },
  ofuda_core: {
    id: 'ofuda_core',
    name: 'БАМБУКОВЫЙ МАЯК',
    icon: I(5),
    examine: 'Связка бамбука с голубой сеткой-офуда.',
  },
};

export interface Recipe {
  a: ItemId;
  b: ItemId;
  result: ItemId;
  message: string;
}

export const RECIPES: Recipe[] = [
  {
    a: 'wet_key_half',
    b: 'wet_key_other',
    result: 'ryokan_key',
    message: 'Половины сомкнулись. Ключ тёплый и целый.',
  },
];
