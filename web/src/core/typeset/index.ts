/**
 * core/typeset：文字排版（橫書／直書、禁則、自動換行、自動縮小）與逐字 sprite（外框、光暈分層）。
 * G1 文字演出群組（文字演出、打字機、切入、文字軌跡、拼貼信…）共用。
 *
 * 最簡單的用法：
 * ```ts
 * const font = (px: number) => canvasFont(fontStack({ family: 'Noto Sans TC', styleClass: 'sans' }, text), 700, px);
 * const r = typesetToFit({ main: text, size: 96, mainFont: font, vertical: true }, { width: 1280, height: 720, marginX: 64 });
 * for (const g of r.block.glyphs) { … g.x, g.y 是字身中心（區塊座標），g.rot0 是直書的固定旋轉 … }
 * ```
 * 要畫字時用 `paintGlyph()` 先畫好 sprite（光暈／本體／閃白分層），每格再依動畫狀態 drawImage。
 */
import { isWide } from './chars';
import { overflowRatio, shrinkSize } from './fit';
import {
  type Align,
  type BlockLayout,
  composeBlock,
  type GroupLayout,
  layoutGroup,
} from './layout';
import { canvasMeasure, type MeasureFn, Meter } from './measure';
import { breakText, type UnitFn } from './wrap';

export * from './chars';
export * from './fit';
export * from './font';
export * from './layout';
export * from './measure';
export * from './paint';
export * from './wrap';

export interface TypesetInput {
  /** 主文字（可多行） */
  main: string;
  /** 副文字（可留空） */
  sub?: string;
  /** 主文字字級（px） */
  size: number;
  /** 主文字的 canvas font 字串（依字級） */
  mainFont: (px: number) => string;
  /** 副文字的 canvas font 字串（預設同主文字） */
  subFont?: (px: number) => string;
  /** 決定字身中心參考字的樣本文字（預設為文字本身；多頁時傳全部的文字，讓每頁一致） */
  sample?: { main?: string; sub?: string };
  vertical?: boolean;
  latinUpright?: boolean;
  punctCenter?: boolean;
  /** 字距、行距（字級的倍數） */
  tracking?: number;
  leading?: number;
  align?: Align;
  /** 副文字大小（主文字字級的倍數）、字距、與主文字的間距（主文字字級的倍數）、位置 */
  subScale?: number;
  subTracking?: number;
  subGap?: number;
  subPos?: 'before' | 'after';
  /** 依字數換行（半形英數算半個字；只用於主文字）；0＝不依字數 */
  wrapChars?: number;
  /** 依長度換行：行方向可用的長度（px，至少一個字）；null／不填＝不換行 */
  wrapLength?: number | null;
  /** 已經斷好的行（自動縮小後沿用原本的斷行） */
  fixedLines?: { main: string[][]; sub: string[][] | null };
  measure?: MeasureFn;
}

export interface TypesetResult {
  size: number;
  block: BlockLayout;
  main: GroupLayout;
  sub: GroupLayout | null;
  lines: { main: string[][]; sub: string[][] | null };
  mainCss: string;
  subCss: string | null;
  mainMeter: Meter;
  subMeter: Meter | null;
}

/** 排版一個「主文字＋副文字」區塊（座標以區塊左上角為原點） */
export function typeset(input: TypesetInput): TypesetResult {
  const S = input.size;
  const vertical = !!input.vertical;
  const measure = input.measure ?? canvasMeasure;
  const tracking = input.tracking ?? 0;
  const leading = input.leading ?? 1.5;
  const wrapChars = input.wrapChars ?? 0;
  const wrapLength = input.wrapLength ?? null;

  const unitBy =
    (meter: Meter, Sx: number, tr: number): UnitFn =>
    (ch) => {
      if (wrapChars > 0) return isWide(ch) || (vertical && input.latinUpright) ? 1 : 0.5;
      if (vertical) return (isWide(ch) || input.latinUpright ? Sx : meter.get(ch).w) + tr;
      return meter.get(ch).w + tr;
    };

  const mainCss = input.mainFont(S);
  const mainMeter = new Meter(mainCss, S, input.sample?.main ?? input.main, measure);
  const track = tracking * S;
  const limit =
    wrapChars > 0 ? wrapChars : wrapLength !== null ? Math.max(S, wrapLength) + track : 0;
  const mainLines =
    input.fixedLines?.main ?? breakText(input.main, { limit, unit: unitBy(mainMeter, S, track) });
  const common = { vertical, latinUpright: input.latinUpright, punctCenter: input.punctCenter };
  const main = layoutGroup(mainLines, { ...common, S, meter: mainMeter, tracking, leading });

  let sub: GroupLayout | null = null;
  let subLines: string[][] | null = null;
  let subCss: string | null = null;
  let subMeter: Meter | null = null;
  if (input.sub) {
    const S2 = S * (input.subScale ?? 0.3);
    subCss = (input.subFont ?? input.mainFont)(S2);
    subMeter = new Meter(subCss, S2, input.sample?.sub ?? input.sub, measure);
    const subTracking = input.subTracking ?? 0;
    const tr2 = subTracking * S2;
    const lim2 = wrapChars > 0 ? 0 : wrapLength !== null ? Math.max(S2, wrapLength) + tr2 : 0;
    subLines =
      input.fixedLines?.sub ??
      breakText(input.sub, { limit: lim2, unit: unitBy(subMeter, S2, tr2) });
    sub = layoutGroup(subLines, {
      ...common,
      S: S2,
      meter: subMeter,
      tracking: subTracking,
      leading,
    });
  }
  const block = composeBlock(main, sub, {
    vertical,
    align: input.align ?? 'center',
    subPos: input.subPos ?? 'after',
    subGap: (input.subGap ?? 0.3) * S,
  });
  return {
    size: S,
    block,
    main,
    sub,
    lines: { main: mainLines, sub: subLines },
    mainCss,
    subCss,
    mainMeter,
    subMeter,
  };
}

export interface FitOptions {
  width: number;
  height: number;
  marginX?: number;
  marginY?: number;
  /** 外框、光暈、陰影往外擴的距離（以原字級計，會跟著縮放） */
  pad?: number;
  minSize?: number;
}

/** 排版，放不下時整體縮小（沿用原字級時的斷行，只排兩次） */
export function typesetToFit(
  input: TypesetInput,
  fit: FitOptions,
): TypesetResult & { scale: number; shrunk: boolean } {
  const first = typeset(input);
  const need = overflowRatio([first.block], { ...fit, pad: fit.pad ?? 0 });
  const { size, k } = shrinkSize(input.size, need, { minSize: fit.minSize });
  if (k === 1) return { ...first, scale: 1, shrunk: false };
  return {
    ...typeset({ ...input, size, fixedLines: first.lines }),
    scale: k,
    shrunk: k < 0.999,
  };
}
