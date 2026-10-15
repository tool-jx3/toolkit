/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見上一層的 UPSTREAM_LICENSE。
 *
 * 關係表（規格 3.6；原作的 parseRelTableText、buildRelTableText、planRelTableImport、relLabelNorm、
 * 批次建立的 parseBatchPasteCells）。純函式。
 */
import { displayName } from '../engine/geom';
import type { Char, Rel, RelType } from '../model/types';

export interface TableRow {
  from: string;
  to: string;
  rel: string;
  note: string;
}

export interface ParsedTable {
  rows: TableRow[];
  /** 略過的列（來源或目標空白）：原文的第幾列（1 起） */
  bad: number[];
  header: boolean;
  sep: 'TSV' | 'CSV';
}

/** 分隔字元：有 Tab＝TSV，否則半形或全形逗號；雙引號欄位可含分隔字元與換行 */
export function splitDelimited(textIn: string): { cells: string[][]; sep: 'TSV' | 'CSV' } {
  const text = String(textIn || '').replace(/\r\n?/g, '\n');
  const sep = text.includes('\t') ? '\t' : ',';
  const rows: string[][] = [];
  let cur = '';
  let row: string[] = [];
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += ch;
    } else if (ch === '"' && cur === '') inQ = true;
    else if (ch === sep || (sep === ',' && ch === '，')) {
      row.push(cur);
      cur = '';
    } else if (ch === '\n') {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
    } else cur += ch;
  }
  row.push(cur);
  rows.push(row);
  return { cells: rows, sep: sep === '\t' ? 'TSV' : 'CSV' };
}

const HDR_SRC = /^(來源|来源|源|起點|起点|from|source|角色a|character a|a)$/i;
const HDR_DST = /^(目標|目标|對象|对象|終點|终点|to|target|角色b|character b|b)$/i;
const HDR_REL = /^(關係|关系|關係類型|关系类型|類型|类型|relation|relationship|type|rel|c)$/i;

/** 標題列：三個條件同時成立，而且至少一欄不是單一字母 */
const looksLikeHeader = (r: string[]): boolean => {
  const c0 = r[0] || '';
  const c1 = r[1] || '';
  const c2 = r[2] || '';
  if (!HDR_SRC.test(c0) || !HDR_DST.test(c1)) return false;
  if (c2 && !HDR_REL.test(c2)) return false;
  return [c0, c1, c2].some((s) => s.length > 1);
};

export function parseRelTable(text: string): ParsedTable {
  const { cells: raw, sep } = splitDelimited(text);
  let cells = raw.map((r) => r.map((s) => s.trim())).filter((r) => r.some(Boolean));
  let header = false;
  if (cells.length > 1 && looksLikeHeader(cells[0])) {
    cells = cells.slice(1);
    header = true;
  }
  const rows: TableRow[] = [];
  const bad: number[] = [];
  cells.forEach((r, i) => {
    const from = r[0] || '';
    const to = r[1] || '';
    if (!from || !to) {
      bad.push(i + 1 + (header ? 1 : 0));
      return;
    }
    rows.push({ from, to, rel: r[2] || '', note: r[3] || '' });
  });
  return { rows, bad, header, sep };
}

/** 「寫法幾乎相同」：大小寫、全半形、空白、連接符之差 */
export const relLabelNorm = (s: string): string =>
  String(s)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[·・･_\-–—]/g, '');

export interface TablePlan {
  newNames: string[];
  relLabels: string[];
  links: TableRow[];
  similar: [string, string][];
  /** 沿用畫布上既有角色的人數 */
  existingUsed: number;
}

const nameKey = (s: string) => String(s).trim();

export function planImport(
  parsed: ParsedTable,
  chars: readonly Char[],
  types: readonly RelType[],
): TablePlan {
  const existing = new Map<string, Char>();
  for (const c of chars) {
    const k = nameKey(c.name);
    if (k && !existing.has(k)) existing.set(k, c);
  }
  const newNames: string[] = [];
  const relLabels: string[] = [];
  const seenNew = new Set<string>();
  const seenRel = new Set<string>();
  const typeByLabel = new Map<string, RelType>();
  for (const t of types) {
    const k = nameKey(t.label);
    if (k && !typeByLabel.has(k)) typeByLabel.set(k, t);
  }
  for (const r of parsed.rows) {
    for (const nm of [r.from, r.to]) {
      const k = nameKey(nm);
      if (existing.has(k) || seenNew.has(k)) continue;
      seenNew.add(k);
      newNames.push(k);
    }
    const rk = nameKey(r.rel);
    if (rk && !typeByLabel.has(rk) && !seenRel.has(rk)) {
      seenRel.add(rk);
      relLabels.push(rk);
    }
  }
  const similar: [string, string][] = [];
  const seenPair = new Set<string>();
  const normMap = new Map<string, string>();
  for (const k of typeByLabel.keys()) {
    const n = relLabelNorm(k);
    if (n && !normMap.has(n)) normMap.set(n, k);
  }
  for (const k of relLabels) {
    const n = relLabelNorm(k);
    if (!n) continue;
    const prev = normMap.get(n);
    if (prev === undefined) {
      normMap.set(n, k);
      continue;
    }
    const pk = JSON.stringify([prev, k]);
    if (prev !== k && !seenPair.has(pk)) {
      seenPair.add(pk);
      similar.push([prev, k]);
    }
  }
  const used = new Set(parsed.rows.flatMap((r) => [nameKey(r.from), nameKey(r.to)]));
  return {
    newNames,
    relLabels,
    links: parsed.rows,
    similar,
    existingUsed: [...used].filter((k) => existing.has(k)).length,
  };
}

/** 複製關係表（TSV）：雙向輸出成「去」「回」兩列；隱藏的關係類型照樣輸出 */
export function buildRelTable(
  chars: readonly Char[],
  rels: readonly Rel[],
  types: readonly RelType[],
): { text: string; lines: number; both: number } {
  const clean = (s: string | undefined | null) =>
    String(s ?? '')
      .replace(/[\t\r\n]+/g, ' ')
      .trim();
  const byId = new Map(chars.map((c) => [c.id, c]));
  const typeById = new Map(types.map((t) => [t.id, t]));
  const rows: string[][] = [['來源', '目標', '關係', '備註']];
  let both = 0;
  for (const r of rels) {
    const a = byId.get(r.from);
    const b = byId.get(r.to);
    if (!a || !b) continue;
    const t = typeById.get(r.type);
    const nm = [clean(displayName(a)), clean(displayName(b))];
    const cells = [nm[0], nm[1], clean(t?.label), clean(r.note)];
    rows.push(cells);
    if (r.both && r.from !== r.to) {
      both++;
      rows.push([nm[1], nm[0], cells[2], cells[3]]);
    }
  }
  return { text: rows.map((r) => r.join('\t')).join('\n'), lines: rows.length - 1, both };
}

/**
 * 批次建立的貼上：試算表的一欄（多欄只取第 1 欄；引號內的換行保留）或一行一位的文字。
 * 回傳每一格與是否用到了多欄。
 */
export function parseBatchPaste(text: string): { cells: string[]; usedCols: boolean } {
  const t = String(text || '').replace(/\r\n?/g, '\n');
  let cells: string[];
  let usedCols = false;
  if (t.includes('\t') || /^"/.test(t) || /\n"/.test(t)) {
    const rows: string[][] = [];
    let cur = '';
    let row: string[] = [];
    let inQ = false;
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (inQ) {
        if (ch === '"') {
          if (t[i + 1] === '"') {
            cur += '"';
            i++;
          } else inQ = false;
        } else cur += ch;
      } else if (ch === '"' && cur === '') inQ = true;
      else if (ch === '\t') {
        row.push(cur);
        cur = '';
      } else if (ch === '\n') {
        row.push(cur);
        rows.push(row);
        row = [];
        cur = '';
      } else cur += ch;
    }
    row.push(cur);
    rows.push(row);
    usedCols = rows.some((r) => r.length > 1);
    cells = rows.map((r) => r[0] ?? '');
  } else {
    cells = t.split('\n');
    /* 單行：從文章複製的「甲、乙、丙」 */
    if (cells.length === 1 && /[、,]/.test(cells[0])) cells = cells[0].split(/[、,]/);
  }
  return { cells: cells.map((s) => s.trim()).filter(Boolean), usedCols };
}
