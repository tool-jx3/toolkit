/**
 * 隨機表引擎：參考 mshea/lazy_gm_tools 的 `css_js/generator.js`（CC0 1.0，見同資料夾的 UPSTREAM_LICENSE）的語法與做法改寫。
 * 不依賴 React，給了同一個亂數（種子）結果就相同。
 *
 * 表的文字格式（和原作相同）：
 *
 * ```
 * 表名
 *   項目
 *   項目 ^3        ← 權重（出現的機會是 3 倍）
 * ```
 *
 * 不縮排的一行是表名（結尾的「:」「：」去掉），縮排的行是上一個表的項目；空行略過。本站另外加：不縮排、`#` 開頭的行是註解。
 *
 * 項目與範本裡可以寫：
 * - `{表名}`：從那個表抽一項（項目裡又有 `{…}` 時繼續展開）；找不到的表是空字串（記在 issues）。
 * - `{"甲"|"乙"|丙 ^4}`：多選一；每個選項是引號裡的字、表名（從那個表抽）或一般的字（也可以再含 `{…}`）；
 *   `^N` 是那個選項的權重（原作只能加在最後一個選項上，本站每個選項都可以）。
 * - `{{表甲}|{表乙}}`：兩個表各抽一項，再二選一（和原作相同：兩個表的機會一樣，不看表的大小）。
 * - `[[100-500]]`：100～500 的整數，千分位加逗號。
 * - `{表名*N}`、`{表名*[[1-3]]}`：從表抽 N 次，一項一行（本站加的；原作用表名猜要不要分行）；N 是 0 時是空字串。
 * - `\n` 或 `<br>`：換行。
 *
 * 範本的最上層另外可以用 `{@欄名:內容}` 標出「欄」（結果卡上可以單獨重抽、鎖定的部分）：內容是表名時從那個表抽，
 * 否則當作一段範本展開；`{@表名}` 等於 `{@表名:表名}`。
 * 最上層其他的 `{…}`、`[[…]]` 是沒有名字的欄（不顯示，整張重抽時才換）。
 */

export type Rng = () => number;

export interface TableEntry {
  text: string;
  weight: number;
}

export type TableSet = Readonly<Record<string, readonly TableEntry[]>>;

/** 用程式算的表（例如依選項篩選的法術）：每次抽都呼叫 */
export type TableFn = (ctx: ExpandContext) => string;

export interface ExpandContext {
  tables: TableSet;
  rng: Rng;
  fns?: Readonly<Record<string, TableFn>>;
  /** 這次已經抽好的欄（欄名 → 值）：表函式可以參考（例如 NPC 的名字依種族） */
  values?: Readonly<Record<string, string>>;
  /** 找不到的表、太深的參照（同一則訊息只記一次） */
  issues?: Set<string>;
}

/** 展開的深度上限（原作是 10 輪；表互相參照時停下來） */
export const MAX_DEPTH = 32;

/* ---------- 建表 ---------- */

/** 程式裡寫的表：字串，或 [字串, 權重] */
export type TableSource = Readonly<Record<string, readonly (string | readonly [string, number])[]>>;

export function tablesFrom(...sources: TableSource[]): Record<string, TableEntry[]> {
  const out: Record<string, TableEntry[]> = {};
  for (const src of sources) {
    for (const [name, items] of Object.entries(src)) {
      out[name] = items.map((it) =>
        typeof it === 'string' ? parseEntry(it) : { text: it[0], weight: it[1] },
      );
    }
  }
  return out;
}

/** 一行項目：結尾的 `^N` 是權重（原作：重複 N 次；`^0` 不會被抽到） */
export function parseEntry(line: string): TableEntry {
  const m = /^(.*?)\s*\^(\d+)\s*$/.exec(line);
  if (m?.[1]) return { text: m[1], weight: Number(m[2]) };
  return { text: line, weight: 1 };
}

export interface ParseIssue {
  /** 第幾行（1 起算） */
  line: number;
  message: string;
}

/** 讀表的文字格式（見檔頭）。同名的表：後面的取代前面的（和原作相同），另外記一筆提醒。 */
export function parseTables(text: string): {
  tables: Record<string, TableEntry[]>;
  order: string[];
  issues: ParseIssue[];
} {
  const tables: Record<string, TableEntry[]> = {};
  const order: string[] = [];
  const issues: ParseIssue[] = [];
  let current: string | null = null;
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  lines.forEach((raw, i) => {
    if (!raw.trim()) return;
    const indented = /^[ \t　]/.test(raw);
    if (!indented) {
      if (raw.startsWith('#')) return;
      const name = raw
        .trim()
        .replace(/[:：]\s*$/, '')
        .trim();
      if (!name) return;
      if (Object.hasOwn(tables, name)) {
        issues.push({ line: i + 1, message: `表「${name}」重複了，後面的取代前面的。` });
        order.splice(order.indexOf(name), 1);
      }
      tables[name] = [];
      order.push(name);
      current = name;
      return;
    }
    if (current === null) {
      issues.push({ line: i + 1, message: '這一行縮排了，但上面還沒有表名。' });
      return;
    }
    tables[current].push(parseEntry(raw.trim()));
  });
  return { tables, order, issues };
}

/* ---------- 抽 ---------- */

/** 依權重抽一項；表是空的（或權重都是 0）時 null */
export function pickEntry(table: readonly TableEntry[], rng: Rng): TableEntry | null {
  let total = 0;
  for (const e of table) total += Math.max(0, e.weight);
  if (total <= 0) return null;
  let r = rng() * total;
  for (const e of table) {
    const w = Math.max(0, e.weight);
    if (r < w) return e;
    r -= w;
  }
  /* 浮點誤差：落在最後 */
  for (let i = table.length - 1; i >= 0; i--) if (table[i].weight > 0) return table[i];
  return null;
}

/** [min, max] 的整數（含兩端；min > max 時對調） */
export function rollInt(min: number, max: number, rng: Rng): number {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/** 千分位加逗號（原作的寶藏：`addCommasToNumber`） */
export function formatNumber(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** 第一個字是英文小寫時改大寫（原作每一筆結果都這樣做；中文不受影響） */
export function capitalize(text: string): string {
  return text.replace(/^(\s*)([a-z])/, (_, s: string, c: string) => s + c.toUpperCase());
}

/** 從 open（`{` 的位置）找對應的 `}`；找不到時 -1 */
export function findClose(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** 在最上層（不在 `{}`、`[[ ]]`、引號裡）切開 */
export function splitTop(text: string, sep = '|'): string[] {
  const out: string[] = [];
  let depth = 0;
  let quoted = false;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' && depth === 0) quoted = !quoted;
    else if (quoted) continue;
    else if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '[' && text[i + 1] === '[') {
      depth++;
      i++;
    } else if (c === ']' && text[i + 1] === ']') {
      depth--;
      i++;
    } else if (c === sep && depth === 0) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out;
}

const RANGE_RE = /^\[\[\s*(-?\d+)\s*-\s*(-?\d+)\s*\]\]/;
const REPEAT_RE = /^(.*?)\s*\*\s*(\d+|\[\[\s*-?\d+\s*-\s*-?\d+\s*\]\])\s*$/;
const QUOTED_RE = /^"([^"]*)"$/;

function note(ctx: ExpandContext, message: string) {
  ctx.issues?.add(message);
}

function hasTable(ctx: ExpandContext, name: string): boolean {
  return (ctx.fns !== undefined && Object.hasOwn(ctx.fns, name)) || Object.hasOwn(ctx.tables, name);
}

/** 從表（或表函式）抽一項並展開 */
export function drawFrom(name: string, ctx: ExpandContext, depth = 0): string {
  if (depth > MAX_DEPTH) {
    note(ctx, `「${name}」參照得太深（表可能互相參照）。`);
    return '';
  }
  const fn = ctx.fns && Object.hasOwn(ctx.fns, name) ? ctx.fns[name] : undefined;
  if (fn) return fn(ctx);
  if (!Object.hasOwn(ctx.tables, name)) {
    note(ctx, `找不到表「${name}」。`);
    return '';
  }
  const entry = pickEntry(ctx.tables[name], ctx.rng);
  if (!entry) {
    note(ctx, `表「${name}」是空的。`);
    return '';
  }
  return expand(entry.text, ctx, depth + 1);
}

/** 多選一的一個選項：引號裡的字、表名或一般的字 */
function expandOption(option: string, ctx: ExpandContext, depth: number): string {
  const text = option.trim();
  const quoted = QUOTED_RE.exec(text);
  if (quoted) return expand(quoted[1], ctx, depth + 1);
  if (text && hasTable(ctx, text)) return drawFrom(text, ctx, depth + 1);
  return expand(text, ctx, depth + 1);
}

/** 欄的內容：表名時從那個表抽，否則當作範本 */
export function expandSlot(template: string, ctx: ExpandContext, depth = 0): string {
  const name = template.trim();
  if (name && hasTable(ctx, name)) return drawFrom(name, ctx, depth + 1);
  return expand(template, ctx, depth + 1);
}

/** 一對大括號裡的內容 */
function expandBraces(inner: string, ctx: ExpandContext, depth: number): string {
  /* 欄的標記（`{@欄名:內容}`）在 expand 裡就照內容展開 */
  if (inner.startsWith('@')) return expandSlot(slotOf(inner, '').template, ctx, depth);
  const options = splitTop(inner);
  if (options.length > 1) {
    const weighted = options.map((o) => parseEntry(o.trim()));
    const chosen = pickEntry(weighted, ctx.rng);
    return chosen ? expandOption(chosen.text, ctx, depth) : '';
  }
  const repeat = REPEAT_RE.exec(inner);
  if (repeat && hasTable(ctx, repeat[1].trim())) {
    const n = Number.parseInt(expand(repeat[2], ctx, depth + 1).replace(/,/g, ''), 10);
    const out: string[] = [];
    for (let i = 0; i < (Number.isFinite(n) ? Math.min(n, 100) : 0); i++)
      out.push(drawFrom(repeat[1].trim(), ctx, depth + 1));
    return out.join('\n');
  }
  const quoted = QUOTED_RE.exec(inner.trim());
  if (quoted) return expand(quoted[1], ctx, depth + 1);
  return drawFrom(inner.trim(), ctx, depth);
}

/** 展開一段範本（見檔頭） */
export function expand(template: string, ctx: ExpandContext, depth = 0): string {
  if (depth > MAX_DEPTH) {
    note(ctx, '參照得太深（表可能互相參照）。');
    return '';
  }
  let out = '';
  let i = 0;
  while (i < template.length) {
    const c = template[i];
    if (c === '[' && template[i + 1] === '[') {
      const m = RANGE_RE.exec(template.slice(i));
      if (m) {
        out += formatNumber(rollInt(Number(m[1]), Number(m[2]), ctx.rng));
        i += m[0].length;
        continue;
      }
    }
    if (c === '{') {
      const close = findClose(template, i);
      if (close > i) {
        out += expandBraces(template.slice(i + 1, close), ctx, depth);
        i = close + 1;
        continue;
      }
    }
    if (c === '\\' && template[i + 1] === 'n') {
      out += '\n';
      i += 2;
      continue;
    }
    if (c === '<' && /^<br\s*\/?>/i.test(template.slice(i, i + 6))) {
      const m = /^<br\s*\/?>/i.exec(template.slice(i)) as RegExpExecArray;
      out += '\n';
      i += m[0].length;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/* ---------- 欄 ---------- */

export interface Slot {
  /** 欄的鍵（欄名；同名的第二個起加「#2」；沒有名字的是「#1」「#2」…） */
  key: string;
  /** 欄名；沒有名字的欄是 null（不顯示在結果卡上） */
  label: string | null;
  template: string;
}

export type TemplatePart = { text: string; slot?: undefined } | { slot: Slot; text?: undefined };

/** `@欄名:內容`（冒號可以是全形）或 `@表名` */
function slotOf(inner: string, key: string): Slot {
  const body = inner.slice(1);
  const m = /^([^:：{}|]+?)\s*[:：]([\s\S]*)$/.exec(body);
  if (m) return { key, label: m[1].trim(), template: m[2] };
  const name = body.trim();
  return { key, label: name, template: name };
}

/** `\n`（反斜線加 n）與 `<br>` 換成換行 */
export function lineBreaks(text: string): string {
  return text.replace(/\\n|<br\s*\/?>/gi, '\n');
}

/** 範本切成字與欄（只看最上層） */
export function parseSlots(template: string): TemplatePart[] {
  const parts: TemplatePart[] = [];
  const seen = new Map<string, number>();
  let anonymous = 0;
  let text = '';
  const flush = () => {
    /* 範本最上層的字也認 `\n` 與 `<br>`（和展開時相同） */
    if (text) parts.push({ text: lineBreaks(text) });
    text = '';
  };
  const keyFor = (label: string | null) => {
    if (label === null) return `#${++anonymous}`;
    const n = (seen.get(label) ?? 0) + 1;
    seen.set(label, n);
    return n === 1 ? label : `${label}#${n}`;
  };
  let i = 0;
  while (i < template.length) {
    const c = template[i];
    if (c === '{') {
      const close = findClose(template, i);
      if (close > i) {
        flush();
        const inner = template.slice(i + 1, close);
        if (inner.startsWith('@')) {
          const slot = slotOf(inner, '');
          parts.push({ slot: { ...slot, key: keyFor(slot.label) } });
        } else {
          parts.push({
            slot: { key: keyFor(null), label: null, template: template.slice(i, close + 1) },
          });
        }
        i = close + 1;
        continue;
      }
    }
    if (c === '[' && template[i + 1] === '[') {
      const m = RANGE_RE.exec(template.slice(i));
      if (m) {
        flush();
        parts.push({ slot: { key: keyFor(null), label: null, template: m[0] } });
        i += m[0].length;
        continue;
      }
    }
    text += c;
    i++;
  }
  flush();
  return parts;
}

/** 結果的一段：字，或一個欄的值（k＝欄的鍵；l＝欄名，沒有名字的欄沒有 l） */
export interface RolledPart {
  t: string;
  k?: string;
  l?: string;
}

export interface RollTemplateOptions {
  /** 先抽這些欄（欄名），其他照範本的順序 */
  order?: readonly string[];
  /** 留著的欄（鍵 → 值）：不重抽 */
  keep?: Readonly<Record<string, string>>;
}

/** 依範本抽一筆：每個欄展開一次（keep 裡的照舊） */
export function rollTemplate(
  template: string,
  ctx: ExpandContext,
  { order = [], keep = {} }: RollTemplateOptions = {},
): RolledPart[] {
  const parts = parseSlots(template);
  const slots = parts.flatMap((p) => (p.slot ? [p.slot] : []));
  const rank = (s: Slot) => {
    const i = s.label === null ? -1 : order.indexOf(s.label);
    return i < 0 ? order.length : i;
  };
  const sequence = [...slots].sort((a, b) => rank(a) - rank(b));
  const values: Record<string, string> = {};
  const byKey: Record<string, string> = {};
  for (const slot of sequence) {
    const kept = Object.hasOwn(keep, slot.key) ? keep[slot.key] : undefined;
    const value =
      kept ?? expandSlot(slot.template, { ...ctx, values: { ...ctx.values, ...values } });
    byKey[slot.key] = value;
    if (slot.label !== null && !Object.hasOwn(values, slot.label)) values[slot.label] = value;
  }
  return parts.map((p) =>
    p.slot
      ? p.slot.label === null
        ? { t: byKey[p.slot.key], k: p.slot.key }
        : { t: byKey[p.slot.key], k: p.slot.key, l: p.slot.label }
      : { t: p.text },
  );
}

/** 結果的全文：第一個字母大寫（原作）、去掉每行頭尾的空白與空行（數量是 0 的寶藏那一行） */
export function partsText(parts: readonly RolledPart[]): string {
  const text = parts.map((p) => p.t).join('');
  return capitalize(
    text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .join('\n'),
  );
}

/* ---------- 檢查（自訂產生器） ---------- */

/** 範本或項目裡參照到的表名（不含多選一裡的一般字） */
export function referencedTables(text: string): string[] {
  const out = new Set<string>();
  const visit = (s: string) => {
    let i = 0;
    while (i < s.length) {
      if (s[i] === '{') {
        const close = findClose(s, i);
        if (close < 0) return;
        const inner = s.slice(i + 1, close);
        if (inner.startsWith('@')) {
          /* `{@表名}` 一定是表；`{@欄名:字}` 的字可能只是一般的字（找得到表時才是表），只看裡面的 {…} */
          if (/^@[^:：]+$/.test(inner)) out.add(inner.slice(1).trim());
          else visit(slotOf(inner, '').template);
        } else {
          const options = splitTop(inner);
          if (options.length > 1) {
            for (const o of options) {
              const t = parseEntry(o.trim()).text.trim();
              if (QUOTED_RE.test(t)) visit(t.slice(1, -1));
              else if (t.includes('{')) visit(t);
            }
          } else {
            const repeat = REPEAT_RE.exec(inner);
            const t = (repeat ? repeat[1] : inner).trim();
            if (QUOTED_RE.test(t)) visit(t.slice(1, -1));
            else out.add(t);
          }
        }
        i = close + 1;
        continue;
      }
      i++;
    }
  };
  visit(text);
  return [...out];
}

export interface TableCheck {
  /** 找不到的表（參照的地方：表名或「範本」） */
  missing: { name: string; from: string }[];
  /** 空的表 */
  empty: string[];
  /** 互相參照（一定會停下來）的表 */
  cycles: string[];
}

/**
 * 檢查自訂的表：找不到的表、空的表、一定會互相參照下去的表（每一項都參照回自己時）。
 * 多選一的一般字也可能是表名：只有在找得到時才算參照，所以不會誤報。
 */
export function checkTables(
  tables: TableSet,
  templates: readonly string[],
  known: readonly string[] = [],
): TableCheck {
  const exists = (n: string) => Object.hasOwn(tables, n) || known.includes(n);
  const missing: { name: string; from: string }[] = [];
  const seen = new Set<string>();
  const add = (name: string, from: string) => {
    const k = `${from}\u0000${name}`;
    if (!exists(name) && !seen.has(k)) {
      seen.add(k);
      missing.push({ name, from });
    }
  };
  for (const t of templates) for (const n of referencedTables(t)) add(n, '範本');
  for (const [name, entries] of Object.entries(tables)) {
    for (const e of entries) for (const n of referencedTables(e.text)) add(n, name);
  }
  const empty = Object.entries(tables)
    .filter(([, e]) => !e.some((x) => x.weight > 0))
    .map(([n]) => n);
  /* 停得下來的表：有一項（權重大於 0）參照的都是停得下來的表或不是表。反覆找到不再增加為止，剩下的就是一定停不下來的 */
  const refs = new Map(
    Object.entries(tables).map(([n, e]) => [
      n,
      e.filter((x) => x.weight > 0).map((x) => referencedTables(x.text)),
    ]),
  );
  const ends = new Set<string>();
  for (let changed = true; changed; ) {
    changed = false;
    for (const [name, entries] of refs) {
      if (ends.has(name)) continue;
      if (entries.some((r) => r.every((n) => ends.has(n) || !Object.hasOwn(tables, n)))) {
        ends.add(name);
        changed = true;
      }
    }
  }
  const cycles = Object.keys(tables).filter((n) => !ends.has(n) && !empty.includes(n));
  return { missing, empty, cycles };
}
