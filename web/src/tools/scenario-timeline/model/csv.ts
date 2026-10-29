/**
 * CSV／TSV 的事件表（規格 F75、F76、3.9）：匯出（完整資料，含 GM 欄）與讀入（依表頭認欄位、中英文）。純計算。
 */

import { normalizeHex } from '@/core/color';
import { parseDelimited, toCsv } from '@/core/csv';
import { afterUnit, canonical, parseTime, readTime } from './time';
import {
  type Category,
  type EventKind,
  type Lane,
  LIMITS,
  newEvent,
  newId,
  PALETTE,
  splitPeople,
  type TimelineDoc,
  type TimelineEvent,
} from './types';

export const CSV_HEADERS = [
  '標題',
  '種類',
  '開始',
  '結束',
  '泳道',
  '地點',
  '相關角色',
  '分類',
  '顏色',
  'GM 專用',
  '說明',
  'GM 筆記',
] as const;

type Field =
  | 'title'
  | 'kind'
  | 'start'
  | 'end'
  | 'lane'
  | 'place'
  | 'people'
  | 'category'
  | 'color'
  | 'gm'
  | 'description'
  | 'gmNote';

const key = (s: string) =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s_\-－]/g, '');

const ALIASES: Record<Field, string[]> = {
  title: ['標題', '名稱', '事件', 'title', 'content', 'name'],
  kind: ['種類', '類型', 'kind', 'type'],
  start: ['開始', '開始時間', '時間', 'start', 'date'],
  end: ['結束', '結束時間', 'end'],
  lane: ['泳道', '分組', '角色泳道', 'lane', 'group'],
  place: ['地點', '場所', 'place', 'location'],
  people: ['相關角色', '角色', '人物', 'people', 'characters'],
  category: ['分類', '類別', 'category'],
  color: ['顏色', 'color'],
  gm: ['GM 專用', 'GM', 'gm only', 'gmonly'],
  description: ['說明', '描述', '內容', 'description', 'note'],
  gmNote: ['GM 筆記', 'gm note', 'gmnote'],
};

const ALIAS_MAP = new Map<string, Field>();
for (const [f, list] of Object.entries(ALIASES) as [Field, string[]][])
  for (const a of list) ALIAS_MAP.set(key(a), f);

const KIND_LABEL: Record<EventKind, string> = {
  point: '時間點',
  range: '期間',
  background: '背景',
};

/** 種類的文字 → 種類（空白時 null） */
export function parseKind(text: string): EventKind | 'bad' | null {
  const k = key(text);
  if (!k) return null;
  if (['時間點', '點', 'point', 'box'].includes(k)) return 'point';
  if (['期間', '區間', 'range'].includes(k)) return 'range';
  if (['背景', 'background'].includes(k)) return 'background';
  return 'bad';
}

export function parseGm(text: string): boolean {
  return ['是', 'y', 'yes', 'true', '1', '✓', '✔', 'v', 'o', '○', 'gm', '有'].includes(key(text));
}

/** 事件表（CSV；UTF-8 BOM、CRLF）：依時間排 */
export function eventsToCsv(doc: TimelineDoc): string {
  const laneName = new Map(doc.lanes.map((l) => [l.id, l.name]));
  const catName = new Map(doc.categories.map((c) => [c.id, c.name]));
  const order = doc.events
    .map((e, i) => ({ e, i, v: readTime(doc.mode, e.start, doc.era)?.v ?? 0 }))
    .sort((p, q) => p.v - q.v || p.i - q.i);
  const rows: string[][] = [[...CSV_HEADERS]];
  for (const { e } of order)
    rows.push([
      e.title,
      KIND_LABEL[e.kind],
      e.start,
      e.end,
      laneName.get(e.laneId) ?? '',
      e.place,
      e.people.join('、'),
      catName.get(e.categoryId) ?? '',
      e.color,
      e.gm ? '是' : '否',
      e.description,
      e.gmNote,
    ]);
  return toCsv(rows, { bom: true });
}

export class CsvHeaderError extends Error {}

export interface CsvRowError {
  row: number;
  message: string;
}

export interface CsvImport {
  events: TimelineEvent[];
  lanes: Lane[];
  categories: Category[];
  errors: CsvRowError[];
  /** 有內容的資料列 */
  total: number;
}

/**
 * 讀入事件表：第一列是表頭；泳道、分類照名稱對到現有的，沒有的新增（回傳的 lanes、categories 是新增的）。
 * 開始看不懂、結束看不懂或不比開始晚的列不收（errors，列號從 1 算、含表頭）。
 */
export function parseEventsTable(
  text: string,
  doc: Pick<TimelineDoc, 'mode' | 'era' | 'lanes' | 'categories'>,
  maxEvents: number = LIMITS.events,
): CsvImport {
  const table = parseDelimited(text);
  if (!table.length) throw new CsvHeaderError('沒有內容。');
  const header = table[0].map((h) => ALIAS_MAP.get(key(h)) ?? null);
  if (!header.includes('start'))
    throw new CsvHeaderError(
      '第一列要是欄位名稱，而且要有「開始」（例：標題、開始、結束、泳道…）。',
    );
  const col = (row: string[], f: Field) => {
    const i = header.indexOf(f);
    return i >= 0 ? (row[i] ?? '').trim() : '';
  };
  const lanes: Lane[] = [];
  const categories: Category[] = [];
  const laneByName = new Map<string, string>();
  for (const l of doc.lanes)
    if (!laneByName.has(l.name.trim())) laneByName.set(l.name.trim(), l.id);
  const catByName = new Map<string, string>();
  for (const c of doc.categories)
    if (!catByName.has(c.name.trim())) catByName.set(c.name.trim(), c.id);

  const laneFor = (name: string): string => {
    if (!name) return '';
    const n = name.slice(0, LIMITS.name);
    const hit = laneByName.get(n);
    if (hit) return hit;
    if (doc.lanes.length + lanes.length >= LIMITS.lanes) return '';
    const lane: Lane = {
      id: newId('l'),
      name: n,
      kind: 'other',
      color: PALETTE[(doc.lanes.length + lanes.length) % PALETTE.length],
      parentId: '',
      gm: false,
    };
    lanes.push(lane);
    laneByName.set(n, lane.id);
    return lane.id;
  };
  const catFor = (name: string): string => {
    if (!name) return '';
    const n = name.slice(0, LIMITS.name);
    const hit = catByName.get(n);
    if (hit) return hit;
    if (doc.categories.length + categories.length >= LIMITS.categories) return '';
    const c: Category = {
      id: newId('c'),
      name: n,
      color: PALETTE[(doc.categories.length + categories.length) % PALETTE.length],
    };
    categories.push(c);
    catByName.set(n, c.id);
    return c.id;
  };

  const events: TimelineEvent[] = [];
  const errors: CsvRowError[] = [];
  let total = 0;
  table.slice(1).forEach((row, i) => {
    const rowNo = i + 2;
    if (!row.some((c) => c.trim())) return;
    total++;
    if (events.length >= maxEvents) return;
    const startText = col(row, 'start');
    const start = parseTime(doc.mode, startText, doc.era);
    if (!start.ok) {
      errors.push({ row: rowNo, message: startText ? start.error : '沒有開始時間' });
      return;
    }
    const endText = col(row, 'end');
    let kind = parseKind(col(row, 'kind'));
    if (kind === 'bad') {
      errors.push({ row: rowNo, message: `看不懂種類「${col(row, 'kind')}」` });
      return;
    }
    if (kind === null) kind = endText ? 'range' : 'point';
    let end = '';
    if (kind !== 'point') {
      if (!endText) kind = 'point';
      else {
        const e = parseTime(doc.mode, endText, doc.era);
        if (!e.ok) {
          errors.push({ row: rowNo, message: `結束：${e.error}` });
          return;
        }
        if (afterUnit(doc.mode, e.tv) <= start.tv.v) {
          errors.push({ row: rowNo, message: '結束要比開始晚' });
          return;
        }
        end = canonical(doc.mode, e.tv);
      }
    }
    const hex = col(row, 'color') ? normalizeHex(col(row, 'color'), '', false) : '';
    events.push(
      newEvent({
        title: col(row, 'title').slice(0, LIMITS.eventTitle),
        kind,
        start: canonical(doc.mode, start.tv),
        end,
        laneId: laneFor(col(row, 'lane')),
        place: col(row, 'place').slice(0, LIMITS.place),
        people: splitPeople(col(row, 'people')),
        categoryId: catFor(col(row, 'category')),
        color: hex && /^#[0-9a-f]{6}$/i.test(hex) ? hex.toLowerCase() : '',
        gm: parseGm(col(row, 'gm')),
        description: col(row, 'description').slice(0, LIMITS.text),
        gmNote: col(row, 'gmNote').slice(0, LIMITS.text),
      }),
    );
  });
  return { events, lanes, categories, errors, total };
}
