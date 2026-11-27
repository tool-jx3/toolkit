/**
 * 名稱與檔名的規則（規格 3.6、3.7）：
 * - 立繪的檔名 → 演員的名字：去掉副檔名、再去掉開頭的編號（「01_」「2-」「003 」）；剩下空白時用「名字」。
 * - 小標題的 ROUND 編號：清單由上而下 ROUND 01、ROUND 02…（100 人以上照實際位數）。
 * - 匯出檔名：一人＝「NN_名字_型.副檔名」、ZIP 裡＝「NN_名字.副檔名」（NN 是清單上的順序，VS 的對手不出現但不重新編號）、
 *   ZIP＝「角色切入_型_N人.zip」。
 * - VS：全員匯出時對手以外的每個人各做一個「這個人 VS 對手」。
 * - CCFOLIA 房間的切入名稱：演員的名字（VS：「名字VS對手名字」），重複時加「2」「3」…。
 */
import { safeFileName } from '@/core/files';
import type { Actor, CutKind, Doc } from './model';
import { clipChars, MAX_CHARS, MYSTERY } from './model';
import { S } from './strings';

/** 兩位數的序號（01、02…；100 以上照實際位數） */
export const seq2 = (n: number): string => String(n).padStart(2, '0');

/** 檔名 → 演員的名字 */
export function nameFromFile(fileName: string): string {
  const base = fileName.replace(/\.[^./\\]+$/, '');
  const trimmed = base.replace(/^\d+[\s_-]*/u, '').trim();
  return clipChars(trimmed, MAX_CHARS.name) || S.defaultActorName;
}

/** 第 i 個（0 起）的 ROUND 編號 */
export const roundTag = (i: number): string => `ROUND ${seq2(i + 1)}`;

/** 全部的小標題換成 ROUND 編號（清單順序） */
export function withRoundTags(actors: readonly Actor[]): Actor[] {
  return actors.map((a, i) => ({ ...a, tag: roundTag(i) }));
}

/** 檔名裡的名字（不能用的字元換掉；空白時「未命名」） */
export const fileSafeName = (name: string): string =>
  safeFileName(name, { fallback: S.unnamedFile, maxLength: 40 });

/** 選取的一人的檔名 */
export function singleFileName(index: number, name: string, kind: CutKind, ext: string): string {
  return `${seq2(index + 1)}_${fileSafeName(name)}_${S.kinds[kind].label}.${ext}`;
}

/** ZIP 裡一個人的檔名 */
export function zipEntryName(index: number, name: string, ext: string): string {
  return `${seq2(index + 1)}_${fileSafeName(name)}.${ext}`;
}

/** 全員 ZIP 的檔名 */
export const zipFileName = (kind: CutKind, count: number): string =>
  `${S.zipPrefix}_${S.kinds[kind].label}_${count}${S.people}.zip`;

/** CCFOLIA 房間 ZIP 的檔名 */
export const roomZipFileName = (kind: CutKind): string =>
  `${S.zipPrefix}_${S.kinds[kind].label}_${S.roomZipSuffix}.zip`;

export interface CastEntry {
  /** 清單上的位置（0 起；檔名的序號用） */
  index: number;
  hero: Actor;
}

/**
 * 全員匯出時要做的人（依清單順序）：VS 時拿掉被選為對手的人。
 */
export function batchEntries(d: Pick<Doc, 'actors' | 'kind' | 'rival'>): CastEntry[] {
  return d.actors
    .map((hero, index) => ({ index, hero }))
    .filter((e) => !(d.kind === 'versus' && d.rival !== MYSTERY && e.hero.id === d.rival));
}

/** 選取的人能不能放在 VS 的左側（被選為對手的人不行） */
export const canLeadVersus = (d: Pick<Doc, 'kind' | 'rival'>, actorId: string): boolean =>
  !(d.kind === 'versus' && d.rival === actorId);

/** 房間裡的切入名稱（觸發用）；VS 是「名字VS對手」 */
export function triggerName(hero: Actor, kind: CutKind, rivalName: string): string {
  const name = hero.name.trim() || S.unnamedFile;
  if (kind !== 'versus') return name;
  const r = rivalName.trim();
  return r ? `${name}VS${r}` : `${name}VS`;
}

/** 名稱重複時加上 2、3…（CCFOLIA 依名稱觸發，同名的只會播其中一個） */
export function uniqueNames(names: readonly string[]): string[] {
  const used = new Set<string>();
  return names.map((n) => {
    let out = n;
    for (let k = 2; used.has(out); k++) out = `${n}${k}`;
    used.add(out);
    return out;
  });
}
