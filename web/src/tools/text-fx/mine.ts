/**
 * 我的範本（P11 新增）：把目前的設定存成自己的範本（取名字），之後一鍵套用；可以改名、刪除，
 * 匯出成範本檔分享給別人、讀入別人的範本檔。存在這個瀏覽器（localStorage `trpg-toolkit:text-fx:mine`），
 * 不進復原紀錄、不進專案檔。
 *
 * 範本檔（JSON，UTF-8）：
 * ```json
 * { "format": "trpg-toolkit:text-fx-templates", "version": 1, "exportedAt": "2026-10-09T…Z",
 *   "templates": [{ "name": "我的理智檢定", "mode": "title", "settings": { …完整設定… } }] }
 * ```
 * 讀入時每個範本的設定都經過 normalizeSettings（不認得的值改回預設，F290）。
 */
import { createToolStore } from '@/core/storage';
import { deepClone, MODES, type Mode, normalizeSettings, type Settings } from './settings';

export interface MyTemplate {
  id: string;
  name: string;
  mode: Mode;
  /** 存下來的完整設定（含文字） */
  s: Settings;
  /** 存的時間（毫秒） */
  savedAt: number;
}

export interface MineData {
  items: MyTemplate[];
}

export const TEMPLATE_FILE_FORMAT = 'trpg-toolkit:text-fx-templates';
export const TEMPLATE_FILE_VERSION = 1;
/** 名稱最多幾個字 */
export const MINE_NAME_MAX = 40;
export const MINE_UNNAMED = '未命名範本';

const isMode = (m: unknown): m is Mode => MODES.some(([k]) => k === m);
const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

let seq = 0;
export function newMineId(): string {
  seq = (seq + 1) % 1e6;
  return `m${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** 名稱整理：去頭尾空白、合併連續空白、最多 40 字；空白時用 fallback */
export function cleanName(name: unknown, fallback = MINE_UNNAMED): string {
  const s = String(name ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(s).slice(0, MINE_NAME_MAX).join('') || fallback;
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

/** 存檔 → 合法的資料（模式不對、設定不是物件的丟掉；設定經過 normalizeSettings；識別碼重複時換新的） */
export function normalizeMine(raw: unknown): MineData {
  const list = isObj(raw) && Array.isArray(raw.items) ? raw.items : [];
  const ids = new Set<string>();
  const items: MyTemplate[] = [];
  for (const it of list) {
    if (!isObj(it) || !isMode(it.mode) || !isObj(it.s)) continue;
    let id = typeof it.id === 'string' && it.id ? it.id : newMineId();
    if (ids.has(id)) id = newMineId();
    ids.add(id);
    items.push({
      id,
      name: typeof it.name === 'string' ? it.name : MINE_UNNAMED,
      mode: it.mode,
      s: normalizeSettings(it.mode, it.s),
      savedAt: typeof it.savedAt === 'number' && Number.isFinite(it.savedAt) ? it.savedAt : 0,
    });
  }
  return { items };
}

/** 把一組設定存成新的範本（名稱在同一個模式裡不重複） */
export function makeMine(
  items: readonly MyTemplate[],
  mode: Mode,
  s: Settings,
  name: string,
  now = Date.now(),
): MyTemplate {
  const taken = items.filter((t) => t.mode === mode).map((t) => t.name);
  return {
    id: newMineId(),
    name: uniqueName(cleanName(name), taken),
    mode,
    s: normalizeSettings(mode, deepClone(s)),
    savedAt: now,
  };
}

/* ---------- 範本檔 ---------- */

export function templatesFileText(items: readonly MyTemplate[], now = new Date()): string {
  return `${JSON.stringify(
    {
      format: TEMPLATE_FILE_FORMAT,
      version: TEMPLATE_FILE_VERSION,
      exportedAt: now.toISOString(),
      templates: items.map((t) => ({ name: t.name, mode: t.mode, settings: t.s })),
    },
    null,
    2,
  )}\n`;
}

/** 範本檔的檔名主體：一個時用範本名稱，多個時「文字演出範本_N個」 */
export function templatesFileBase(items: readonly MyTemplate[]): string {
  return items.length === 1
    ? `文字演出範本_${items[0].name.trim() || MINE_UNNAMED}`
    : `文字演出範本_${items.length}個`;
}

export interface ParsedTemplate {
  name: string;
  mode: Mode;
  s: Settings;
}

export class TemplateFileError extends Error {}

/**
 * 讀範本檔：接受本工具的範本檔（format 相符或沒有 format、有 templates 陣列），
 * 或單一個範本（`{ name, mode, settings }`）。模式不對、沒有設定的範本略過（skipped）。
 * 讀不懂、不是範本檔、裡面沒有可用的範本時丟 TemplateFileError（訊息可以直接顯示）。
 */
export function parseTemplatesFile(text: string): {
  templates: ParsedTemplate[];
  skipped: number;
} {
  let raw: unknown;
  try {
    raw = JSON.parse(String(text).replace(/^﻿/, ''));
  } catch {
    throw new TemplateFileError('不是 JSON 檔，讀不懂。');
  }
  if (!isObj(raw)) throw new TemplateFileError('不是文字演出產生器的範本檔。');
  if (raw.format !== undefined && raw.format !== TEMPLATE_FILE_FORMAT)
    throw new TemplateFileError('不是文字演出產生器的範本檔。');
  const list: unknown[] = Array.isArray(raw.templates)
    ? raw.templates
    : raw.format === undefined && 'settings' in raw
      ? [raw]
      : [];
  if (!Array.isArray(raw.templates) && !list.length)
    throw new TemplateFileError('不是文字演出產生器的範本檔。');
  const templates: ParsedTemplate[] = [];
  let skipped = 0;
  for (const it of list) {
    if (!isObj(it) || !isMode(it.mode) || !isObj(it.settings)) {
      skipped++;
      continue;
    }
    templates.push({
      name: cleanName(it.name),
      mode: it.mode,
      s: normalizeSettings(it.mode, it.settings),
    });
  }
  if (!templates.length) throw new TemplateFileError('檔案裡沒有可以用的範本。');
  return { templates, skipped };
}

/** 讀入的範本加進清單：新的識別碼，名稱在同一個模式裡重複時加編號 */
export function addParsed(
  items: readonly MyTemplate[],
  parsed: readonly ParsedTemplate[],
  now = Date.now(),
): MyTemplate[] {
  const out = items.slice();
  for (const p of parsed) {
    const taken = out.filter((t) => t.mode === p.mode).map((t) => t.name);
    out.push({
      id: newMineId(),
      name: uniqueName(p.name, taken),
      mode: p.mode,
      s: p.s,
      savedAt: now,
    });
  }
  return out;
}

/** 讀一批範本檔（每個檔各自成功或失敗；通知由呼叫端合成一則） */
export async function readTemplateFiles(files: readonly File[]): Promise<{
  parsed: ParsedTemplate[];
  skipped: number;
  failures: { name: string; message: string }[];
}> {
  const parsed: ParsedTemplate[] = [];
  const failures: { name: string; message: string }[] = [];
  let skipped = 0;
  for (const f of files) {
    try {
      const r = parseTemplatesFile(await f.text());
      parsed.push(...r.templates);
      skipped += r.skipped;
    } catch (e) {
      failures.push({
        name: f.name,
        message: e instanceof TemplateFileError ? e.message : '檔案讀不到。',
      });
    }
  }
  return { parsed, skipped, failures };
}

/* ---------- 存檔 ---------- */

export const useMine = createToolStore<MineData>(
  'text-fx:mine',
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

export const mineOf = (id: string | null | undefined): MyTemplate | null =>
  (id && useMine.getState().data.items.find((t) => t.id === id)) || null;
