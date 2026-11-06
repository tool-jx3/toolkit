/**
 * SRD 5.1（2014 年的規則）的種族能力值提升（Ability Score Increase），本站翻譯、改成程式可讀的表。
 * SRD 5.1 每個有亞種的種族只收一個亞種，所以種族＋亞種合成一個選項。出處與授權見同資料夾的 LICENSE.txt。
 */
import type { Ability } from '../srd52/abilities';

export type RaceKey =
  | 'hill-dwarf'
  | 'high-elf'
  | 'lightfoot-halfling'
  | 'human'
  | 'dragonborn'
  | 'rock-gnome'
  | 'half-elf'
  | 'half-orc'
  | 'tiefling';

export interface Race51 {
  key: RaceKey;
  name: string;
  en: string;
  /** 固定的提升 */
  bonus: Partial<Record<Ability, number>>;
  /** 自選的提升：選 count 項（不能選 exclude），各 +amount（半精靈） */
  choice?: { count: number; amount: number; exclude: readonly Ability[] };
}

export const RACES_51: readonly Race51[] = [
  {
    key: 'hill-dwarf',
    name: '矮人（丘陵矮人）',
    en: 'Dwarf (Hill Dwarf)',
    bonus: { con: 2, wis: 1 },
  },
  { key: 'high-elf', name: '精靈（高等精靈）', en: 'Elf (High Elf)', bonus: { dex: 2, int: 1 } },
  {
    key: 'lightfoot-halfling',
    name: '半身人（輕足半身人）',
    en: 'Halfling (Lightfoot)',
    bonus: { dex: 2, cha: 1 },
  },
  {
    key: 'human',
    name: '人類',
    en: 'Human',
    bonus: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 },
  },
  { key: 'dragonborn', name: '龍裔', en: 'Dragonborn', bonus: { str: 2, cha: 1 } },
  {
    key: 'rock-gnome',
    name: '侏儒（岩侏儒）',
    en: 'Gnome (Rock Gnome)',
    bonus: { int: 2, con: 1 },
  },
  {
    key: 'half-elf',
    name: '半精靈',
    en: 'Half-Elf',
    bonus: { cha: 2 },
    choice: { count: 2, amount: 1, exclude: ['cha'] },
  },
  { key: 'half-orc', name: '半獸人', en: 'Half-Orc', bonus: { str: 2, con: 1 } },
  { key: 'tiefling', name: '提夫林', en: 'Tiefling', bonus: { cha: 2, int: 1 } },
];

export const race51 = (key: string): Race51 | undefined => RACES_51.find((r) => r.key === key);
