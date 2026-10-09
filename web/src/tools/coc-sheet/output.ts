/**
 * 輸出（規格 3.5～3.7）：列印（看不見的 iframe，可另存 PDF）、匯出 PNG（SVG foreignObject）、CCFOLIA 角色剪貼簿 JSON。
 * 列印與 PNG 直接用預覽排好的頁面（SheetView），所以三種輸出的版面相同。
 */
import { type CcfoliaCharacterData, serializeCharacterClipboard } from '@/ccfolia';
import { CHARACTERISTICS } from '@/core/coc';
import { canvasToBlob } from '@/core/image';
import {
  PAPER_SIZES,
  paperFileName,
  printPages,
  rasterizeElement,
  stackCanvases,
} from '@/core/paged';
import type { PngPages, Sheet } from './model';
import { derived, skillDisplayName, skillValue, weaponValue } from './rules';
import { SHEET_CSS, SHEET_ROOT_CLASS } from './sheetCss';
import { S, SHEET } from './strings';

/** 檔名與列印標題：調查員姓名 → 角色卡名稱 →「調查員角色卡」 */
export function outputTitle(sheet: Sheet): string {
  return sheet.info.name.trim() || sheet.title.trim() || SHEET.title;
}

/** 列印：只印角色卡兩頁（A4、無邊界） */
export function printSheet(
  sheet: Sheet,
  pages: readonly HTMLElement[],
  dryRun = false,
): Promise<HTMLIFrameElement> {
  return printPages({
    title: outputTitle(sheet),
    css: SHEET_CSS,
    pages: pages.map((p) => p.outerHTML),
    size: PAPER_SIZES.A4,
    bodyClass: SHEET_ROOT_CLASS,
    dryRun,
  });
}

/** PNG 檔名：「姓名_角色卡_第1頁.png」「姓名_角色卡.png」（兩頁接成一張） */
export function pngFileName(sheet: Sheet, pages: PngPages): string {
  const base = `${outputTitle(sheet)}_${S.png.fileSuffix}`;
  return paperFileName(pages === 'both' ? base : `${base}_${S.png.page(pages)}`, 'png', 'sheet');
}

/** 匯出 PNG：一頁＝A4 × scale（scale 1 是 794×1123 px）；兩頁時上下接成一張（中間 gap） */
export async function sheetPng(
  pages: readonly HTMLElement[],
  which: PngPages,
  scale: number,
): Promise<{ blob: Blob; width: number; height: number }> {
  const chosen = which === 'both' ? pages : [pages[Number(which) - 1]].filter(Boolean);
  const canvases = [];
  for (const p of chosen)
    canvases.push(
      await rasterizeElement(p, { css: SHEET_CSS, rootClass: SHEET_ROOT_CLASS, scale }),
    );
  const canvas =
    canvases.length === 1
      ? canvases[0]
      : stackCanvases(canvases, { gap: Math.round(PNG_PAGE_GAP * scale), background: '#ffffff' });
  const blob = await canvasToBlob(canvas, 'image/png');
  return { blob, width: canvas.width, height: canvas.height };
}

/** 兩頁接成一張時中間的間隔（倍率 1 時的 px） */
export const PNG_PAGE_GAP = 16;

/* ---------- CCFOLIA ---------- */

const n = (v: number | null): number => (v === null ? 0 : v);
const s = (v: number | null): string => (v === null ? '' : String(v));

/** 指令裡的 DB 換成 {DB}；拿掉空白（BCDice 的指令不能有空白） */
export function damageCommand(text: string): string {
  return text
    .replace(/\s+/g, '')
    .replace(/(^|[^A-Za-z0-9_{}])DB(?![A-Za-z0-9_{}])/gi, '$1{DB}')
    .replace(/\{db\}/g, '{DB}');
}

/** 傷害欄可以當指令嗎（有骰子或數字，不是「─」這類記號） */
const isDamage = (t: string) => /\d/.test(t);

/** 聊天面板（每行一個） */
export function chatPalette(sheet: Sheet): string {
  const d = derived(sheet);
  const C = S.ccfolia;
  const lines: string[] = [`CC<={SAN} ${C.sanRoll}`, `CC<={${C.luck}} ${C.luckRoll}`];
  const st = sheet.stats;
  if (st.INT !== null) lines.push(`CC<=${st.INT} ${C.idea}`);
  if (st.EDU !== null) lines.push(`CC<=${st.EDU} ${C.know}`);
  for (const k of CHARACTERISTICS) if (st[k] !== null) lines.push(`CC<=${st[k]} ${k}`);
  for (const skill of sheet.skills) {
    const name = skillDisplayName(skill);
    const v = skillValue(skill, st);
    if (name && v !== null) lines.push(`CC<=${v} ${name}`);
  }
  for (const w of sheet.weapons) {
    const name = w.name.trim();
    const v = weaponValue(w, sheet);
    if (name && v !== null) lines.push(`CC<=${v} ${name}`);
    /* 沒有名稱的武器：傷害的標籤用「武器」（不會變成「2D6 （傷害）」，7.1） */
    if (isDamage(w.damage)) lines.push(`${damageCommand(w.damage)} ${C.damage(name || C.weapon)}`);
  }
  lines.push(`//DB=${d.db ?? '0'}`);
  if (d.build !== null) lines.push(`//${C.build}=${d.build}`);
  if (d.mov !== null) lines.push(`//${C.mov}=${d.mov}`);
  for (const k of CHARACTERISTICS) if (st[k] !== null) lines.push(`//${k}=${st[k]}`);
  return lines.join('\n');
}

/** CCFOLIA 角色資料（剪貼簿 JSON 的 data） */
export function ccfoliaData(sheet: Sheet): CcfoliaCharacterData {
  const d = derived(sheet);
  const C = S.ccfolia;
  const st = sheet.stats;
  const params: { label: string; value: string }[] = CHARACTERISTICS.map((k) => ({
    label: k,
    value: s(st[k]),
  }));
  params.push({ label: 'DB', value: d.db ?? '0' });
  params.push({ label: C.build, value: s(d.build) });
  params.push({ label: C.mov, value: s(d.mov) });
  const info = sheet.info;
  const memo = [
    info.occupation && `${SHEET.info.occupation}：${info.occupation}`,
    info.age && `${SHEET.info.age}：${info.age}`,
    info.sex && `${SHEET.info.sex}：${info.sex}`,
    info.player && `${SHEET.info.player}：${info.player}`,
  ]
    .filter(Boolean)
    .join('\n');
  return {
    name: info.name.trim() || sheet.title.trim() || C.unnamed,
    initiative: n(st.DEX),
    externalUrl: '',
    status: [
      { label: 'HP', value: n(sheet.hp.current ?? d.hpMax), max: n(d.hpMax) },
      { label: 'MP', value: n(sheet.mp.current ?? d.mpMax), max: n(d.mpMax) },
      { label: 'SAN', value: n(sheet.san.current ?? d.sanStart), max: n(d.sanMax) },
      { label: C.luck, value: n(sheet.luckNow ?? sheet.luck), max: n(sheet.luck) },
    ],
    params,
    commands: chatPalette(sheet),
    memo,
  };
}

export const SHEET_JSON_FIELDS = Object.freeze([
  'name',
  'initiative',
  'externalUrl',
  'status',
  'params',
  'commands',
  'memo',
] as const);

export function ccfoliaJson(sheet: Sheet): string {
  return serializeCharacterClipboard(ccfoliaData(sheet), { fields: SHEET_JSON_FIELDS });
}
