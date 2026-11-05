/**
 * SF 證件的名字產生器（規格 F92）：從離線的姓名語料（`@/core/names/corpus`）抽一個名字，轉成英文字母、大寫。
 * 按下「產生名字」時才載入（import()）。地區對應見 names.ts。
 */
import { kanaToRomaji, type RandomFn } from '@/core/names';
import {
  type CorpusRegion,
  corpusPack,
  drawCorpusName,
  type InknomuPack,
  loadCorpus,
} from '@/core/names/corpus';
import type { SfName, SfNameGender, SfNameRegion } from './names';

/** 每個地區用的包（語料的地區與包的 id） */
const PACKS: Record<Exclude<SfNameRegion, 'any'>, readonly [CorpusRegion, string][]> = {
  west: [
    ['uk', 'uk-modern'],
    ['us', 'us-modern'],
  ],
  latino: [['us', 'us-latino']],
  nordic: [['nordic', 'nordic-modern']],
  ru: [['ru', 'ru-modern']],
  jp: [['jp', 'jp-modern']],
  kr: [['kr', 'kr-modern']],
  tw: [['tw', 'tw-modern']],
  fantasy: [
    ['fantasy', 'fantasy-human'],
    ['fantasy', 'fantasy-elf'],
    ['fantasy', 'fantasy-dwarf'],
    ['fantasy', 'fantasy-orc'],
    ['fantasy', 'fantasy-halfling'],
  ],
};

const ANY: readonly Exclude<SfNameRegion, 'any'>[] = ['west', 'latino', 'nordic', 'ru', 'jp', 'kr'];

const pick = <T>(list: readonly T[], r: number): T =>
  list[Math.min(list.length - 1, Math.floor(r * list.length))];

/** 平假名（有兩種讀法「のぞみ／のぞむ」時取第一種）→ 羅馬拼音 */
const romaji = (kana: string | undefined) => (kana ? kanaToRomaji(kana.split('／')[0]) : '');

/** 名字的英文字母寫法：韓國用羅馬拼音、日本用平假名轉的羅馬拼音、其他照語料（俄羅斯的已經是拉丁字母） */
function latinParts(
  pack: InknomuPack,
  region: CorpusRegion,
  name: ReturnType<typeof drawCorpusName>,
): { given: string; surname: string } {
  if (region === 'jp')
    return { given: romaji(name.givenReading), surname: romaji(name.familyReading) };
  if (region === 'kr' && name.ref) {
    const list = name.ref.g.charAt(0) as 'm' | 'f' | 'u';
    const g = pack.given[list]?.[Number(name.ref.g.slice(1))];
    const s = name.ref.s !== undefined ? pack.surnames[name.ref.s] : undefined;
    return { given: g?.reading ?? name.given, surname: s?.reading ?? name.family };
  }
  return { given: name.given, surname: name.family };
}

/** 產生一個名字（第一次用到那個地區時載入語料） */
export async function generateSfName(
  region: SfNameRegion,
  gender: SfNameGender,
  random: RandomFn = Math.random,
): Promise<SfName> {
  const area = region === 'any' ? pick(ANY, random()) : region;
  const [corpusRegion, packId] = pick(PACKS[area], random());
  const g: 'm' | 'f' = gender === 'any' ? (random() < 0.5 ? 'm' : 'f') : gender;
  const data = await loadCorpus(corpusRegion);
  const pack = corpusPack(data, packId) ?? data.packs[0];
  const name = drawCorpusName(
    pack,
    { gender: g === 'f' ? 'female' : 'male' },
    random,
    corpusRegion,
  );
  const { given, surname } = latinParts(pack, corpusRegion, name);
  const up = (s: string) => s.trim().toLocaleUpperCase('en');
  return { given: up(given), surname: up(surname), gender: g };
}
