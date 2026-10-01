/**
 * 自訂 CSS 的規則建構器：統一處理優先順序、keyframes 登記、@import 位置與 :has() 的隔離。
 *
 * 優先順序的做法（OBS 自訂 CSS 的特殊處境）：
 * - CCFOLIA 的樣式在自訂 CSS **之後**才插入，而且有行內樣式（名稱顏色、虛擬捲動位移、滑入滑出…）。
 *   所以宣告預設加 `!important`：蓋得過後插入的 class 規則，也蓋得過行內樣式。
 * - 但 `!important` 的宣告也會蓋過 CSS 動畫（cascade 中 important 高於動畫），會被 keyframes 改動的屬性
 *   （濾鏡、不透明度、位移、背景位置、顏色…）若寫成 important，動畫就失效。這些屬性要列在 `animated`：
 *   輸出時不加 `!important`，改把選擇器的權重提高（加上 `:not(#tk-x)`，等於多一個 ID），仍然蓋得過 CCFOLIA 的 class 規則。
 *   注意：不加 important 的宣告蓋不過行內樣式，但動畫本身可以（動畫在 cascade 中高於一般宣告與行內樣式）。
 * - `:has()` 要 OBS 31 以上；舊版會丟掉「含有不認得語法的整條規則」。建構器會把含 `:has(` 的選擇器與其他選擇器
 *   拆成不同規則，舊 OBS 只有那些演出不動，其他照常。
 *
 * ```ts
 * const css = createCssSheet({ animated: ['filter'] });
 * css.header({ title: '狀態條', toolName: '狀態條產生器', url, size, localFonts });
 * css.import(googleFontsUrl);
 * const pulse = css.keyframes('tk-pulse', { '0%, 100%': { filter: 'none' }, '50%': { filter: 'brightness(1.3)' } });
 * css.rule('#root > div:first-child', { padding: 0, 'max-width': 'none' });
 * css.rule(barPartSelector('track'), { animation: `${pulse} 1.1s ease-in-out infinite` });
 * css.media('(max-width: 899px)', (m) => m.rule('…', { width: px(240) }));
 * const text = css.toString();
 * ```
 */
import { cssComment, cssIdent } from './escape';
import { type CssHeaderOptions, cssHeaderLines } from './header';

export type CssValue = string | number | null | undefined | false;
/** 宣告：屬性名稱可以是 kebab-case（建議）或 camelCase；null／undefined／false／'' 會略過 */
export type CssDecls = Readonly<Record<string, CssValue>>;

export interface RuleOptions {
  /** 這條規則是否加 !important（預設跟著 sheet） */
  important?: boolean;
  /** 這條規則裡會被動畫改動的屬性（不加 !important、提高選擇器權重） */
  animated?: readonly string[];
  /** 不提高選擇器權重 */
  noBoost?: boolean;
}

export interface SheetOptions {
  /** 預設加 !important（預設 true） */
  important?: boolean;
  /** 整份 CSS 裡一律視為「會被動畫改動」的屬性 */
  animated?: readonly string[];
  /** 縮排（預設兩個空白） */
  indent?: string;
  /** 提高權重用的 ID（預設 tk-x；頁面上不可以真的有這個 id） */
  boostId?: string;
}

type Item =
  | { kind: 'comment'; text: string }
  | { kind: 'rule'; selectors: string[]; decls: CssDecls; opts: RuleOptions }
  | { kind: 'keyframes'; name: string; body: string }
  | { kind: 'group'; prelude: string; sheet: CssSheet }
  | { kind: 'raw'; text: string }
  | { kind: 'blank' };

interface Registry {
  keyframes: Map<string, string>;
  imports: string[];
}

/** camelCase → kebab-case（自訂屬性 --x 不變） */
export function cssPropName(name: string): string {
  if (name.startsWith('--')) return name;
  return name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

/**
 * 依最外層的逗號拆開選擇器清單（略過括號、中括號、引號裡的逗號）。
 * splitSelectorList('a, b:is(c, d), [x=","]') → ['a', 'b:is(c, d)', '[x=","]']
 */
export function splitSelectorList(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let cur = '';
  for (let i = 0; i < list.length; i++) {
    const ch = list[i];
    if (quote) {
      cur += ch;
      if (ch === '\\') {
        cur += list[++i] ?? '';
      } else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    else if (ch === ',' && depth === 0) {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const PSEUDO_ELEMENT =
  /(::?(?:before|after|first-line|first-letter|marker|placeholder|selection|backdrop|file-selector-button|part\([^)]*\)|slotted\([^)]*\))\s*)$/i;

/**
 * 提高一個選擇器的權重（多一個 ID）而不改變它選到的元素：在主體的最後（偽元素之前）加 `:not(#id)`。
 * boostSelector('#root .a::before') → '#root .a:not(#tk-x)::before'
 */
export function boostSelector(selector: string, id = 'tk-x'): string {
  const s = selector.trim();
  const m = PSEUDO_ELEMENT.exec(s);
  const add = `:not(#${id})`;
  if (m) return `${s.slice(0, m.index)}${add}${m[1].trim()}`;
  return `${s}${add}`;
}

/** 選擇器裡有沒有 :has()（OBS 31 以上才支援） */
export const usesHas = (selector: string): boolean => /:has\(/i.test(selector);

function serializeDecls(
  decls: CssDecls,
  indent: string,
  importantFor: (prop: string) => boolean,
): string[] {
  const lines: string[] = [];
  for (const [rawName, value] of Object.entries(decls)) {
    if (value === null || value === undefined || value === false || value === '') continue;
    const name = cssPropName(rawName);
    let v = String(value).trim();
    const alreadyImportant = /!important$/i.test(v);
    if (alreadyImportant) v = v.replace(/\s*!important$/i, '');
    const imp = alreadyImportant || importantFor(name);
    lines.push(`${indent}${name}: ${v}${imp ? ' !important' : ''};`);
  }
  return lines;
}

export class CssSheet {
  private readonly items: Item[] = [];
  private readonly head: string[] = [];
  private readonly options: Required<SheetOptions>;
  private readonly registry: Registry;
  private readonly nested: boolean;

  constructor(options: SheetOptions = {}, registry?: Registry) {
    this.options = {
      important: options.important ?? true,
      animated: options.animated ?? [],
      indent: options.indent ?? '  ',
      boostId: options.boostId ?? 'tk-x',
    };
    this.nested = !!registry;
    this.registry = registry ?? { keyframes: new Map(), imports: [] };
  }

  /** 註解。還沒有任何規則之前加的註解會放在 @import 之前（CSS 開頭的說明） */
  comment(text: string | readonly string[]): this {
    const c = cssComment(text);
    if (!this.nested && this.items.every((i) => i.kind === 'comment' || i.kind === 'blank'))
      this.head.push(c);
    else this.items.push({ kind: 'comment', text: c });
    return this;
  }

  /** CSS 開頭的說明註解（工具名稱、範本、網址、來源大小、OBS 版本、電腦字型…；見 header.ts） */
  header(options: CssHeaderOptions): this {
    return this.comment(cssHeaderLines(options));
  }

  /** @import（自動移到最前面；同一網址只出現一次）。可以給網址或完整的 @import 敘述 */
  import(urlOrStatement: string): this {
    const s = urlOrStatement.trim();
    const stmt = s.startsWith('@import') ? s.replace(/;?$/, ';') : `@import url("${s}");`;
    if (!this.registry.imports.includes(stmt)) this.registry.imports.push(stmt);
    return this;
  }

  /** 一條規則。selector 可以是字串（可含逗號）或陣列 */
  rule(selector: string | readonly string[], decls: CssDecls, opts: RuleOptions = {}): this {
    const list = typeof selector === 'string' ? splitSelectorList(selector) : [...selector];
    if (!list.length) return this;
    /* :has() 與一般選擇器分開：舊 OBS 丟掉含 :has() 的規則時，不會連累其他選擇器 */
    const plain = list.filter((s) => !usesHas(s));
    const has = list.filter(usesHas);
    if (plain.length && has.length) {
      this.items.push({ kind: 'rule', selectors: plain, decls, opts });
      this.items.push({ kind: 'rule', selectors: has, decls, opts });
    } else {
      this.items.push({ kind: 'rule', selectors: list, decls, opts });
    }
    return this;
  }

  /**
   * 登記 keyframes，回傳實際使用的名稱。同名且內容相同只輸出一次；同名但內容不同時自動改名（name-2…）。
   * frames 的鍵是關鍵影格選擇器（'from'、'50%'、'0%, 100%'）；keyframes 裡的宣告不會加 !important。
   */
  keyframes(name: string, frames: Readonly<Record<string, CssDecls>>): string {
    const ind = this.options.indent;
    const body = Object.entries(frames)
      .map(([sel, decls]) =>
        [`${ind}${sel} {`, ...serializeDecls(decls, ind + ind, () => false), `${ind}}`].join('\n'),
      )
      .join('\n');
    const base = cssIdent(name);
    let final = base;
    for (let n = 2; ; n++) {
      const existing = this.registry.keyframes.get(final);
      if (existing === undefined) break;
      if (existing === body) return final;
      final = `${base}-${n}`;
    }
    this.registry.keyframes.set(final, body);
    this.items.push({ kind: 'keyframes', name: final, body });
    return final;
  }

  /** 這個名稱的 keyframes 已經登記過了嗎 */
  hasKeyframes(name: string): boolean {
    return this.registry.keyframes.has(cssIdent(name));
  }

  /** @media 區塊 */
  media(query: string, build: (sheet: CssSheet) => void): this {
    return this.group(`@media ${query}`, build);
  }

  /** @supports 區塊 */
  supports(condition: string, build: (sheet: CssSheet) => void): this {
    return this.group(`@supports ${condition}`, build);
  }

  /** 任何 at-rule 區塊（prelude 例：'@media (hover: hover)'） */
  group(prelude: string, build: (sheet: CssSheet) => void): this {
    const inner = new CssSheet(this.options, this.registry);
    build(inner);
    this.items.push({ kind: 'group', prelude, sheet: inner });
    return this;
  }

  /** 原樣輸出（自己負責語法正確） */
  raw(text: string): this {
    this.items.push({ kind: 'raw', text });
    return this;
  }

  /** 空一行（排版用） */
  blank(): this {
    this.items.push({ kind: 'blank' });
    return this;
  }

  private serializeItems(level: number): string[] {
    const ind = this.options.indent;
    const pad = ind.repeat(level);
    const animatedAll = new Set(this.options.animated.map(cssPropName));
    const blocks: string[] = [];
    for (const item of this.items) {
      switch (item.kind) {
        case 'comment':
          blocks.push(
            item.text
              .split('\n')
              .map((l) => pad + l)
              .join('\n'),
          );
          break;
        case 'blank':
          blocks.push('');
          break;
        case 'raw':
          blocks.push(
            item.text
              .split('\n')
              .map((l) => (l ? pad + l : l))
              .join('\n'),
          );
          break;
        case 'keyframes':
          blocks.push(
            [
              `${pad}@keyframes ${item.name} {`,
              ...item.body.split('\n').map((l) => pad + l),
              `${pad}}`,
            ].join('\n'),
          );
          break;
        case 'group': {
          const inner = item.sheet.serializeItems(level + 1);
          blocks.push([`${pad}${item.prelude} {`, ...inner, `${pad}}`].join('\n'));
          break;
        }
        case 'rule': {
          const important = item.opts.important ?? this.options.important;
          const animated = new Set([
            ...animatedAll,
            ...(item.opts.animated ?? []).map(cssPropName),
          ]);
          const importantFor = (p: string) => important && !animated.has(p) && !p.startsWith('--');
          const lines = serializeDecls(item.decls, pad + ind, importantFor);
          if (!lines.length) break;
          const needsBoost =
            important &&
            !item.opts.noBoost &&
            Object.keys(item.decls).some((k) => animated.has(cssPropName(k)));
          const sels = needsBoost
            ? item.selectors.map((s) => boostSelector(s, this.options.boostId))
            : item.selectors;
          blocks.push(
            [`${sels.map((s) => pad + s).join(',\n')} {`, ...lines, `${pad}}`].join('\n'),
          );
          break;
        }
      }
    }
    return blocks;
  }

  /** 輸出整份 CSS（開頭說明 → @import → 其他，依加入順序） */
  toString(): string {
    const parts: string[] = [];
    if (this.head.length) parts.push(this.head.join('\n'));
    if (!this.nested && this.registry.imports.length) parts.push(this.registry.imports.join('\n'));
    const body = this.serializeItems(0);
    /* 連續的空白行合併 */
    const joined = body.join('\n\n').replace(/\n{3,}/g, '\n\n');
    if (joined.trim()) parts.push(joined.trim());
    return `${parts.join('\n\n')}\n`;
  }
}

export function createCssSheet(options?: SheetOptions): CssSheet {
  return new CssSheet(options);
}
