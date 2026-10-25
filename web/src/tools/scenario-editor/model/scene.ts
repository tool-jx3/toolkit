/**
 * 場景轉換連到標題（2026-10，上游 v3.15.0、v3.24.0；規格 F270、F271、3.17.4）。
 * 從場景轉換的文字取出目的地的名稱（「前往書房」「→ 書房へ移行」「場景 3『書房』」…），
 * 和標題 1～3 的名稱完全相同時才連過去（只包含不算：短的標題才不會被誤連）。
 * 「跳到的標題」有寫時用它找。
 */
import { rubyPlain } from './text';
import type { Block, Doc } from './types';

export const SCENE_HEAD_TYPES: readonly string[] = ['h1', 'h2', 'h3'];

/** 前後成對的括號拿掉 */
function stripBrackets(s: string): string {
  const m = s.trim().match(/^[「『【〈《（([“"]\s*(.*?)\s*[」』】〉》）)\]”"]$/);
  return (m ? m[1] : s).trim();
}

/** 開頭的「シーン 3：」拿掉（同原作） */
const stripSceneNo = (s: string): string =>
  s.replace(/^(シーン|場面|scene)\s*[0-9０-９]+\s*[:：.．、\s]?\s*/i, '').trim();
/** 新版另外拿掉繁中的「場景 3」（D14） */
const stripSceneNoZh = (s: string): string =>
  s.replace(/^場景\s*[0-9０-９]+\s*[:：.．、\s]?\s*/, '').trim();

const uniq = (list: string[]): string[] => list.filter((x, i) => x && list.indexOf(x) === i);

/** 標題的名稱（原文、拿掉括號、拿掉場景編號與括號；新版另外拿掉「場景 3」） */
export function headNames(text: unknown): string[] {
  const p = rubyPlain(String(text ?? ''))
    .replace(/\s+/g, ' ')
    .trim();
  return uniq([
    p,
    stripBrackets(p),
    stripBrackets(stripSceneNo(p)),
    stripBrackets(stripSceneNoZh(p)),
  ]);
}

/** 句尾與日文的「〜へ移行」拿掉 */
const stripTail = (s: string): string =>
  s
    .replace(/[。．.！!]+$/, '')
    .replace(/\s*(へ|に)\s*(の)?\s*(移行|移動|続く|進む|進行|向かう)(する)?$/, '')
    .replace(/\s*(へ|に)$/, '')
    .trim();

/**
 * 場景轉換的文字裡的目的地名稱。先照原作（拿掉「→」、「シーン移行：」、「〜へ移行／移動／続く…」），
 * 所以和標題完全相同的寫法（例如「進入地下室」「場景轉換：大廳」）一定連得到；
 * 之後才加上新版另外認的繁中寫法（拿掉「前往」「移動到」「轉到」「場景轉換：」「場景 3」…；D14、7.5 的 S1）。
 */
export function sceneNames(text: unknown): string[] {
  const [a, b] = sceneNameGroups(text);
  return uniq([...a, ...b]);
}

/** 目的地名稱的兩組：原作的取法、新版另外加的（先用第一組找，找不到才用第二組） */
export function sceneNameGroups(text: unknown): [string[], string[]] {
  const p = rubyPlain(String(text ?? ''))
    .replace(/\s+/g, ' ')
    .trim();
  /* 原作的取法 */
  const s = stripTail(
    p.replace(/^[→⇒➡▶►＞>]+\s*/, '').replace(/^(シーン移行|場面移行|シーン移動)\s*[:：]?\s*/, ''),
  );
  /* 新版另外拿掉繁中的前綴 */
  const z = stripTail(
    s
      .replace(/^(場景轉換|場景切換|場景移動|轉換場景)\s*[:：]?\s*/, '')
      .replace(/^(前往|移動到|移動至|移至|轉到|轉往|來到|進入|回到)\s*/, ''),
  );
  const first = uniq([s, stripBrackets(s), stripBrackets(stripSceneNo(s))]);
  const more = uniq([z, stripBrackets(z), stripBrackets(stripSceneNoZh(stripSceneNo(z)))]).filter(
    (x) => !first.includes(x),
  );
  return [first, more];
}

/** 場景轉換要找的名稱（「跳到的標題」有寫時用它） */
export const sceneWanted = (b: Pick<Block, 'text' | 'jump'>): string[] =>
  String(b.jump ?? '').trim() ? headNames(b.jump) : sceneNames(b.text);

/** 依序找的名稱組（「跳到的標題」一組；本文的目的地名稱：原作的取法、新版的繁中寫法兩組） */
const wantGroups = (b: Pick<Block, 'text' | 'jump'>): string[][] =>
  String(b.jump ?? '').trim() ? [headNames(b.jump)] : sceneNameGroups(b.text);

/**
 * 場景轉換連到的標題（本文裡的標題 1～3；找不到時 null）。同名的標題有好幾個時，
 * 取這個場景轉換之後最近的，之後沒有就取之前最近的。只看本文（彈出視窗、儲存格裡的場景轉換不連）。
 */
export function sceneTargetOf(doc: Pick<Doc, 'blocks'>, b: Block): Block | null {
  if (b.type !== 'scene') return null;
  const at = doc.blocks.indexOf(b);
  if (at < 0) return null;
  /* 先用原作的取法找（前後都找），找不到才用新版另外認的寫法（7.5 的 S1） */
  for (const want of wantGroups(b)) {
    if (!want.length) continue;
    const hit = (h: Block) =>
      SCENE_HEAD_TYPES.includes(h.type) && headNames(h.text).some((n) => want.includes(n));
    for (let i = at + 1; i < doc.blocks.length; i++) if (hit(doc.blocks[i])) return doc.blocks[i];
    for (let i = at - 1; i >= 0; i--) if (hit(doc.blocks[i])) return doc.blocks[i];
  }
  return null;
}

/** 場景轉換 id → 標題 id（ok：只連到這些標題，例如輸出範圍內的） */
export function sceneLinks(
  doc: Pick<Doc, 'blocks'>,
  ok: (id: string) => boolean = () => true,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const b of doc.blocks) {
    if (b.type !== 'scene') continue;
    const h = sceneTargetOf(doc, b);
    if (h && ok(h.id)) out.set(b.id, h.id);
  }
  return out;
}

/** 「跳到的標題」的候選：本文的標題 1～3 的名稱（拿掉注音、同名一次） */
export function headingChoices(doc: Pick<Doc, 'blocks'>): string[] {
  const out: string[] = [];
  for (const x of doc.blocks) {
    if (!SCENE_HEAD_TYPES.includes(x.type)) continue;
    const t = rubyPlain(String(x.text ?? '')).trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}
