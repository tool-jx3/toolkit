/**
 * 文字方框產生器的排版核心（純函式，不依賴 React／DOM）。
 *
 * 依規格 docs/refactor/specs/textbox.md 第 2～3 節：
 * - 字寬一律換算成整數單位計算，避免浮點誤差（CCFOLIA 校準的比例以 1/119 框線寬為單位，精度遠高於 4 位小數）。
 * - 字元以 Unicode 碼位為單位處理（擴充 B 漢字、表情符號都算一個字）。
 * - 輸出行與行以 LF 分隔，最後一行後面沒有換行；行尾空白與全形空白（U+3000）都是輸出的一部分。
 */

export type Mode = 'box' | 'table';
export type Calibration = 'ccfolia' | 'mono' | 'custom';
export type LineStyle = 'single' | 'double';
export type PadStyle = 'fullwidth' | 'halfwidth';

/** 使用者的輸入。數值欄保留使用者打的原始文字（解析規則見 parseLimit／parseRatio）。 */
export interface TextboxInput {
  mode: Mode;
  calibration: Calibration;
  line: LineStyle;
  pad: PadStyle;
  /** 側邊框線（四邊都有框線） */
  sides: boolean;
  /** 自訂比例：寬字寬度（以半形字＝1） */
  customWide: string;
  /** 自訂比例：框線寬度（以半形字＝1） */
  customBorder: string;
  /** 方框寬度上限（框線字元個數） */
  boxWidth: string;
  /** 表格寬度上限（框線字元個數，不含左右外框） */
  tableWidth: string;
  title: string;
  body: string;
  table: string;
  /** 首列當表頭 */
  header: boolean;
}

export const DEFAULT_INPUT: TextboxInput = {
  mode: 'box',
  calibration: 'ccfolia',
  line: 'single',
  pad: 'fullwidth',
  sides: false,
  customWide: '2.66',
  customBorder: '2.12',
  boxWidth: '24',
  tableWidth: '19',
  title: '',
  body: '',
  table: '',
  header: false,
};

/** 微調鈕的範圍（直接打字可以超出，照用） */
export const BOX_WIDTH_RANGE = { min: 10, max: 100 } as const;
export const TABLE_WIDTH_RANGE = { min: 10, max: 150 } as const;
/** 欄位空白、0 或無法解析時的退回值（注意表格是 30，不是預設的 19） */
export const BOX_WIDTH_FALLBACK = 24;
export const TABLE_WIDTH_FALLBACK = 30;
/** 自訂比例欄位空白、0 或無法解析時的退回值 */
export const CUSTOM_WIDE_FALLBACK = 2;
export const CUSTOM_BORDER_FALLBACK = 1;
/** 自訂比例的合理上限（超過時限制在這個值並提示） */
export const CUSTOM_RATIO_MAX = 100;

/* ---------- 字寬 ---------- */

/** 各類字元的寬度（整數單位） */
export interface Metrics {
  /** 輸出用的框線字元（─ 或 ═） */
  border: number;
  /** 寬字（含全形空白） */
  wide: number;
  /** 韓文字母（U+1100–115F、U+3130–318F） */
  jamo: number;
  /** 半形空白、不換行空白 */
  space: number;
  /** 其他基本平面字元 */
  other: number;
  /** 基本平面以外、又不是寬字的字元 */
  astral: number;
  /** 空表格的小方框寬度（框線字元個數） */
  emptyTableWidth: number;
  /** 表格儲存格的可用寬度下限（CCFOLIA 校準沒有下限） */
  minCellAvail: number;
}

/**
 * CCFOLIA 校準：以框線字元＝119 單位。
 * 換算回比例：寬字 155/119≈1.3025、韓文字母 145/119≈1.2185、半形空白 44/119≈0.3697、其他 93/119≈0.7815。
 */
export const CCFOLIA_METRICS: Metrics = {
  border: 119,
  wide: 155,
  jamo: 145,
  space: 44,
  other: 93,
  astral: 186,
  emptyTableWidth: 1,
  minCellAvail: Number.NEGATIVE_INFINITY,
};

/** 等寬 1:2：半形字＝1 */
export const MONO_METRICS: Metrics = {
  border: 1,
  wide: 2,
  jamo: 2,
  space: 1,
  other: 1,
  astral: 2,
  emptyTableWidth: 10,
  minCellAvail: 1,
};

/** 自訂比例換算成整數的倍數（支援到 6 位小數） */
export const CUSTOM_SCALE = 1_000_000;

export function customMetrics(wide: number, border: number): Metrics {
  const S = CUSTOM_SCALE;
  return {
    border: Math.round(border * S),
    wide: Math.round(wide * S),
    jamo: Math.round(wide * S),
    space: S,
    other: S,
    astral: 2 * S,
    emptyTableWidth: Math.max(1, Math.round(10 / border)),
    minCellAvail: S,
  };
}

/** 寬字：CJK、韓文、全形英數與標點、第 2～3 平面 */
export function isWide(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0x9fff) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe10 && cp <= 0xfe1f) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  );
}

export function isJamo(cp: number): boolean {
  return (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x3130 && cp <= 0x318f);
}

export function charWidth(cp: number, m: Metrics): number {
  if (cp === 0x20 || cp === 0xa0) return m.space;
  if (isJamo(cp)) return m.jamo;
  if (isWide(cp)) return m.wide;
  if (cp > 0xffff) return m.astral;
  return m.other;
}

/** 一段文字的估計寬度（逐碼位加總） */
export function textWidth(text: string, m: Metrics): number {
  let w = 0;
  for (const ch of text) w += charWidth(ch.codePointAt(0)!, m);
  return w;
}

/* ---------- 換行與補白 ---------- */

/** 空行或只含空白字元 */
const isBlank = (line: string) => line.trim() === '';

/**
 * 換行（3.2）：先依 LF 切行；空白行輸出空字串；其他行逐字放入，超過可用寬度且這行已有字時換行。
 * 一定是逐字斷行（英文單字也會切開），每行至少一個字。
 */
export function wrapText(text: string, avail: number, m: Metrics): string[] {
  const out: string[] = [];
  for (const raw of text.split('\n')) {
    if (isBlank(raw)) {
      out.push('');
      continue;
    }
    let cur = '';
    let w = 0;
    for (const ch of raw) {
      const cw = charWidth(ch.codePointAt(0)!, m);
      if (cur !== '' && w + cw > avail) {
        out.push(cur);
        cur = ch;
        w = cw;
      } else {
        cur += ch;
        w += cw;
      }
    }
    out.push(cur);
  }
  return out;
}

/** a ÷ b 四捨五入（剛好一半進位），a ≥ 0、b > 0 */
function roundDiv(a: number, b: number): number {
  return Math.floor((2 * a + b) / (2 * b));
}

/** a ÷ b 無條件進位，b > 0 */
function ceilDiv(a: number, b: number): number {
  return Math.ceil(a / b);
}

/**
 * 補白（3.3）：在文字後面加空白，使總寬接近 target。差額 ≤ 0 時不加。
 * 全形為主：先加整數個全形空白，剩下的用半形空白四捨五入補；只用半形：全部用半形空白四捨五入補。
 */
export function padTo(text: string, target: number, m: Metrics, style: PadStyle): string {
  const diff = target - textWidth(text, m);
  if (diff <= 0) return text;
  if (style === 'fullwidth') {
    const full = Math.floor(diff / m.wide);
    const rest = diff - full * m.wide;
    return text + '　'.repeat(full) + ' '.repeat(roundDiv(rest, m.space));
  }
  return text + ' '.repeat(roundDiv(diff, m.space));
}

/* ---------- 框線字元 ---------- */

export interface BorderChars {
  h: string;
  v: string;
  tl: string;
  tr: string;
  bl: string;
  br: string;
  /** ├ */
  lt: string;
  /** ┤ */
  rt: string;
  /** ┬ */
  tt: string;
  /** ┴ */
  bt: string;
  /** ┼ */
  cross: string;
}

export const BORDERS: Record<LineStyle, BorderChars> = {
  single: {
    h: '─',
    v: '│',
    tl: '┌',
    tr: '┐',
    bl: '└',
    br: '┘',
    lt: '├',
    rt: '┤',
    tt: '┬',
    bt: '┴',
    cross: '┼',
  },
  double: {
    h: '═',
    v: '║',
    tl: '╔',
    tr: '╗',
    bl: '╚',
    br: '╝',
    lt: '╠',
    rt: '╣',
    tt: '╦',
    bt: '╩',
    cross: '╬',
  },
};

/* ---------- 數值欄的解析 ---------- */

export type WarningField = 'boxWidth' | 'customWide' | 'customBorder' | 'table';

export interface TextboxWarning {
  field: WarningField;
  message: string;
}

/**
 * 寬度上限：取整數部分（12.9→12、「3e1」→3）；空白、0 或無法解析時用 fallback。
 * 直接打字超出微調鈕範圍也照用。
 */
export function parseLimit(raw: string, fallback: number): number {
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) || n === 0 ? fallback : n;
}

export interface ParsedRatio {
  value: number;
  /** 超出合理範圍時的說明 */
  problem?: 'negative' | 'tooSmall' | 'tooLarge';
}

/** 自訂比例：可輸入小數；空白、0 或不是數字時用 fallback；負數、過小、過大時限制並回報。 */
export function parseRatio(raw: string, fallback: number): ParsedRatio {
  const n = Number.parseFloat(raw);
  if (Number.isNaN(n) || n === 0) return { value: fallback };
  if (n < 0) return { value: fallback, problem: 'negative' };
  if (!Number.isFinite(n) || n > CUSTOM_RATIO_MAX)
    return { value: CUSTOM_RATIO_MAX, problem: 'tooLarge' };
  if (Math.round(n * CUSTOM_SCALE) < 1) return { value: fallback, problem: 'tooSmall' };
  return { value: n };
}

/** 依校準方式取得字寬（自訂比例時順便回報欄位問題） */
export function resolveMetrics(
  input: Pick<TextboxInput, 'calibration' | 'customWide' | 'customBorder'>,
): {
  metrics: Metrics;
  warnings: TextboxWarning[];
} {
  if (input.calibration === 'ccfolia') return { metrics: CCFOLIA_METRICS, warnings: [] };
  if (input.calibration === 'mono') return { metrics: MONO_METRICS, warnings: [] };
  const wide = parseRatio(input.customWide, CUSTOM_WIDE_FALLBACK);
  const border = parseRatio(input.customBorder, CUSTOM_BORDER_FALLBACK);
  const warnings: TextboxWarning[] = [];
  if (wide.problem) warnings.push({ field: 'customWide', message: ratioMessage(wide) });
  if (border.problem) warnings.push({ field: 'customBorder', message: ratioMessage(border) });
  return { metrics: customMetrics(wide.value, border.value), warnings };
}

function ratioMessage(r: ParsedRatio): string {
  if (r.problem === 'tooLarge') return `寬度最大 ${CUSTOM_RATIO_MAX}，目前以 ${r.value} 計算。`;
  return `寬度必須大於 0，目前以 ${r.value} 計算。`;
}

/* ---------- 方框（3.4、3.5） ---------- */

export function layoutBox(
  input: Pick<TextboxInput, 'title' | 'body' | 'line' | 'pad' | 'sides' | 'boxWidth'>,
  m: Metrics,
): { lines: string[]; warnings: TextboxWarning[] } {
  const warnings: TextboxWarning[] = [];
  let limit = parseLimit(input.boxWidth, BOX_WIDTH_FALLBACK);
  if (limit < 1) {
    limit = 1;
    warnings.push({ field: 'boxWidth', message: '寬度上限至少為 1，目前以 1 計算。' });
  }
  const c = BORDERS[input.line];
  const s = m.space;
  const avail = limit * m.border - 2 * s;
  const hasTitle = input.title !== '';
  const titleLines = hasTitle ? wrapText(input.title, avail, m) : [];
  const bodyLines = input.body !== '' ? wrapText(input.body, avail, m) : [];

  let widest = 0;
  for (const l of [...titleLines, ...bodyLines]) widest = Math.max(widest, textWidth(l, m));
  const n = widest === 0 ? Math.min(10, limit) : Math.min(limit, ceilDiv(widest + 2 * s, m.border));
  const T = n * m.border;
  const bar = c.h.repeat(n);

  const out: string[] = [];
  const content = (l: string) =>
    input.sides
      ? `${c.v}${padTo(` ${l}`, T - s, m, input.pad)} ${c.v}`
      : padTo(` ${l}`, T, m, input.pad);

  out.push(input.sides ? `${c.tl}${bar}${c.tr}` : bar);
  if (hasTitle) {
    for (const l of titleLines) out.push(content(l));
    out.push(input.sides ? `${c.lt}${bar}${c.rt}` : bar);
  }
  if (input.body === '') {
    /* 內文欄是空字串：開頭與結尾沒有那個半形空白（與「只有空白」不同） */
    out.push(
      input.sides
        ? `${c.v}${padTo('', T - 2 * s, m, input.pad)}${c.v}`
        : padTo('', T, m, input.pad),
    );
  } else {
    for (const l of bodyLines) out.push(content(l));
  }
  out.push(input.sides ? `${c.bl}${bar}${c.br}` : bar);
  return { lines: out, warnings };
}

/* ---------- 表格（3.6、3.7） ---------- */

export type TableRow = { kind: 'separator' } | { kind: 'data'; cells: string[] };

/** 整列只由 - = _ ─ 組成（一個以上，可混用） */
export function isSeparatorRow(row: string): boolean {
  if (row === '') return false;
  for (const ch of row) if (ch !== '-' && ch !== '=' && ch !== '_' && ch !== '─') return false;
  return true;
}

/** 解析表格資料：去頭尾空白、忽略空列、分隔列、以半形「|」切格並去頭尾空白 */
export function parseTable(text: string): TableRow[] {
  const rows: TableRow[] = [];
  for (const raw of text.split('\n')) {
    const row = raw.trim();
    if (row === '') continue;
    if (isSeparatorRow(row)) rows.push({ kind: 'separator' });
    else rows.push({ kind: 'data', cells: row.split('|').map((x) => x.trim()) });
  }
  return rows;
}

/** 欄寬（框線字元個數）：理想寬度 → 超過上限時從最寬的欄開始縮 */
export function columnWidths(rows: readonly TableRow[], limit: number, m: Metrics): number[] {
  const data = rows.filter((r): r is Extract<TableRow, { kind: 'data' }> => r.kind === 'data');
  const cols = data.reduce((n, r) => Math.max(n, r.cells.length), 0);
  const s = m.space;
  const minCol = Math.max(1, ceilDiv(2 * s, m.border));
  const widths: number[] = [];
  for (let c = 0; c < cols; c++) {
    let ideal = 0;
    for (const r of data) ideal = Math.max(ideal, textWidth(r.cells[c] ?? '', m));
    widths.push(Math.max(minCol, ceilDiv(ideal + 2 * s, m.border)));
  }
  let total = widths.reduce((a, b) => a + b, 0) + (cols - 1);
  while (total > limit && cols > 0) {
    let k = 0;
    for (let c = 1; c < cols; c++) if (widths[c] > widths[k]) k = c;
    if (widths[k] <= minCol) break;
    widths[k]--;
    total--;
  }
  return widths;
}

export function layoutTable(
  input: Pick<TextboxInput, 'table' | 'line' | 'pad' | 'sides' | 'tableWidth' | 'header'>,
  m: Metrics,
): { lines: string[]; warnings: TextboxWarning[] } {
  const c = BORDERS[input.line];
  const s = m.space;
  const warnings: TextboxWarning[] = [];

  const emptyBox = () => {
    const n0 = m.emptyTableWidth;
    const bar = c.h.repeat(n0);
    return [
      `${c.tl}${bar}${c.tr}`,
      `${c.v}${padTo(' ', n0 * m.border - s, m, input.pad)} ${c.v}`,
      `${c.bl}${bar}${c.br}`,
    ];
  };

  /* 空表格：不論側邊框線開關，一律是完整外框的小方框 */
  if (input.table.trim() === '') return { lines: emptyBox(), warnings };

  const rows = parseTable(input.table);
  const hasData = rows.some((r) => r.kind === 'data');
  if (!hasData) {
    warnings.push({ field: 'table', message: '表格裡只有分隔列，沒有可以排的資料。' });
    /* 側邊框線關、只有分隔列：舊版出錯；新版改輸出空表格的小方框 */
    if (!input.sides) return { lines: emptyBox(), warnings };
  }

  const limit = parseLimit(input.tableWidth, TABLE_WIDTH_FALLBACK);
  const widths = columnWidths(rows, limit, m);
  const cols = widths.length;
  const total = widths.reduce((a, b) => a + b, 0) + (cols - 1);
  const avails = widths.map((w) => Math.max(m.minCellAvail, w * m.border - 2 * s));

  const join = (l: string, mid: string, r: string) =>
    input.sides
      ? `${l}${widths.map((w) => c.h.repeat(w)).join(mid)}${r}`
      : c.h.repeat(Math.max(0, total));
  const top = join(c.tl, c.tt, c.tr);
  const sep = join(c.lt, c.cross, c.rt);
  const bottom = join(c.bl, c.bt, c.br);

  const out: string[] = [top];
  const dataLines = (cells: readonly string[]) => {
    const wrapped = widths.map((_, k) => wrapText(cells[k] ?? '', avails[k], m));
    const height = wrapped.reduce((h, w) => Math.max(h, w.length), 0);
    for (let i = 0; i < height; i++) {
      const joined = wrapped
        .map((w, k) => `${padTo(` ${w[i] ?? ''}`, widths[k] * m.border - s, m, input.pad)} `)
        .join(c.v);
      out.push(input.sides ? `${c.v}${joined}${c.v}` : joined);
    }
  };

  rows.forEach((r, i) => {
    if (r.kind === 'separator') out.push(sep);
    else dataLines(r.cells);
    if (i === 0 && input.header && r.kind === 'data' && rows.length >= 2 && rows[1].kind === 'data')
      out.push(sep);
  });
  out.push(bottom);
  return { lines: out, warnings };
}

/* ---------- 入口 ---------- */

export interface TextboxResult {
  /** 輸出全文（最後一行後面沒有換行） */
  text: string;
  warnings: TextboxWarning[];
}

export function renderTextbox(input: TextboxInput): TextboxResult {
  const { metrics, warnings } = resolveMetrics(input);
  const r = input.mode === 'box' ? layoutBox(input, metrics) : layoutTable(input, metrics);
  return { text: r.lines.join('\n'), warnings: [...warnings, ...r.warnings] };
}
