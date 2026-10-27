/**
 * 我的預設（規格 F40）：把目前的外觀與測試文字取名存在這個瀏覽器（localStorage `trpg-toolkit:ui-frame:mine`，最多 30 組），
 * 套用、改名、刪除；匯出成 JSON（全部或一組）、讀入 JSON。不列入復原、不進專案檔。試看的背景與立繪不存。
 *
 * JSON 檔（UTF-8）：
 * ```json
 * { "format": "trpg-toolkit:ui-frame-presets", "version": 1, "exportedAt": "2026-10-27T…Z",
 *   "presets": [{ "name": "我的舊宅", "design": { …外觀… }, "texts": { …測試文字… } }] }
 * ```
 * 讀入時外觀、文字都經過整理（不認得的值改回預設、超出範圍的夾回範圍）。
 */
import { createToolStore } from '@/core/storage';
import {
  cloneDesign,
  DEFAULT_TEXTS,
  type Design,
  normalizeDesign,
  normalizeTexts,
  type Texts,
} from './model';
import { S } from './strings';

export interface MyPreset {
  id: string;
  name: string;
  design: Design;
  texts: Texts;
  /** 存的時間（毫秒） */
  savedAt: number;
}

export interface MineData {
  items: MyPreset[];
}

export const PRESET_FILE_FORMAT = 'trpg-toolkit:ui-frame-presets';
export const PRESET_FILE_VERSION = 1;
/** 最多幾組（原作的製品版 30 組） */
export const MINE_MAX = 30;
/** 名稱最多幾個字 */
export const MINE_NAME_MAX = 40;

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

let seq = 0;
export function newMineId(): string {
  seq = (seq + 1) % 1e6;
  return `p${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** 名稱整理：去頭尾空白、合併連續空白、最多 40 字；空白時用「未命名」 */
export function cleanName(name: unknown): string {
  const s = String(name ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(s).slice(0, MINE_NAME_MAX).join('') || S.mine.unnamed;
}

/** 名稱重複時加上「（2）」「（3）」… */
export function uniqueName(name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(name)) return name;
  for (let i = 2; ; i++) {
    const next = `${name}（${i}）`;
    if (!used.has(next)) return next;
  }
}

export function normalizeMine(raw: unknown): MineData {
  const list = isObj(raw) && Array.isArray(raw.items) ? raw.items : [];
  const ids = new Set<string>();
  const items: MyPreset[] = [];
  for (const it of list) {
    if (!isObj(it) || !isObj(it.design)) continue;
    let id = typeof it.id === 'string' && it.id ? it.id : newMineId();
    if (ids.has(id)) id = newMineId();
    ids.add(id);
    items.push({
      id,
      name: typeof it.name === 'string' && it.name ? it.name : S.mine.unnamed,
      design: normalizeDesign(it.design),
      texts: normalizeTexts(it.texts, DEFAULT_TEXTS),
      savedAt: typeof it.savedAt === 'number' && Number.isFinite(it.savedAt) ? it.savedAt : 0,
    });
    if (items.length >= MINE_MAX) break;
  }
  return { items };
}

export function makeMine(
  items: readonly MyPreset[],
  name: string,
  design: Design,
  texts: Texts,
  now = Date.now(),
): MyPreset {
  return {
    id: newMineId(),
    name: uniqueName(
      cleanName(name),
      items.map((t) => t.name),
    ),
    design: cloneDesign(design),
    texts: { ...texts },
    savedAt: now,
  };
}

/* ---------- JSON 檔 ---------- */

export function presetsFileText(items: readonly MyPreset[], now = new Date()): string {
  return `${JSON.stringify(
    {
      format: PRESET_FILE_FORMAT,
      version: PRESET_FILE_VERSION,
      exportedAt: now.toISOString(),
      presets: items.map((t) => ({ name: t.name, design: t.design, texts: t.texts })),
    },
    null,
    2,
  )}\n`;
}

export function presetsFileBase(items: readonly MyPreset[]): string {
  return items.length === 1
    ? S.mine.fileBase(items[0].name.trim() || S.mine.unnamed)
    : S.mine.fileBaseAll(items.length);
}

export interface ParsedPreset {
  name: string;
  design: Design;
  texts: Texts;
}

export class PresetFileError extends Error {}

/**
 * 讀預設檔：本工具的預設檔（format 相符或沒有 format、有 presets 陣列），或單一組（`{ name, design, texts? }`）。
 * 沒有外觀的那一組略過（skipped）；讀不懂、不是預設檔、裡面沒有可用的預設時丟 PresetFileError（訊息可以直接顯示）。
 */
export function parsePresetsFile(text: string): { presets: ParsedPreset[]; skipped: number } {
  let raw: unknown;
  try {
    raw = JSON.parse(String(text).replace(/^﻿/, ''));
  } catch {
    throw new PresetFileError(S.mine.notJson);
  }
  if (!isObj(raw)) throw new PresetFileError(S.mine.notOurs);
  if (raw.format !== undefined && raw.format !== PRESET_FILE_FORMAT)
    throw new PresetFileError(S.mine.notOurs);
  const list: unknown[] = Array.isArray(raw.presets)
    ? raw.presets
    : raw.format === undefined && isObj(raw.design)
      ? [raw]
      : [];
  if (!Array.isArray(raw.presets) && !list.length) throw new PresetFileError(S.mine.notOurs);
  const presets: ParsedPreset[] = [];
  let skipped = 0;
  for (const it of list) {
    if (!isObj(it) || !isObj(it.design)) {
      skipped++;
      continue;
    }
    presets.push({
      name: cleanName(it.name),
      design: normalizeDesign(it.design),
      texts: normalizeTexts(it.texts, DEFAULT_TEXTS),
    });
  }
  if (!presets.length) throw new PresetFileError(S.mine.noPresets);
  return { presets, skipped };
}

/** 讀入的預設加進清單：新的識別碼、名稱重複時加編號、超過上限的不加（dropped） */
export function addParsed(
  items: readonly MyPreset[],
  parsed: readonly ParsedPreset[],
  now = Date.now(),
): { items: MyPreset[]; added: number; dropped: number } {
  const out = items.slice();
  let added = 0;
  for (const p of parsed) {
    if (out.length >= MINE_MAX) break;
    out.push({
      id: newMineId(),
      name: uniqueName(
        p.name,
        out.map((t) => t.name),
      ),
      design: p.design,
      texts: p.texts,
      savedAt: now,
    });
    added++;
  }
  return { items: out, added, dropped: parsed.length - added };
}

/** 讀一批預設檔（每個檔各自成功或失敗；通知由呼叫端合成一則） */
export async function readPresetFiles(files: readonly File[]): Promise<{
  parsed: ParsedPreset[];
  skipped: number;
  failures: { name: string; message: string }[];
}> {
  const parsed: ParsedPreset[] = [];
  const failures: { name: string; message: string }[] = [];
  let skipped = 0;
  for (const f of files) {
    try {
      const r = parsePresetsFile(await f.text());
      parsed.push(...r.presets);
      skipped += r.skipped;
    } catch (e) {
      failures.push({
        name: f.name,
        message: e instanceof PresetFileError ? e.message : S.mine.notJson,
      });
    }
  }
  return { parsed, skipped, failures };
}

/* ---------- 存檔 ---------- */

export const useMine = createToolStore<MineData>(
  'ui-frame:mine',
  { items: [] },
  {
    version: 1,
    migrate: (persisted) => normalizeMine(persisted),
    historyLimit: 1,
  },
);

/* 存檔可能缺欄位或被改壞：修正一次（沒有變化時不寫回） */
{
  const cur = useMine.getState().data;
  const fixed = normalizeMine(cur);
  if (JSON.stringify(fixed) !== JSON.stringify(cur)) useMine.getState().replace(fixed);
  useMine.temporal.getState().clear();
}

export const mineOf = (id: string | null | undefined): MyPreset | null =>
  (id && useMine.getState().data.items.find((t) => t.id === id)) || null;
