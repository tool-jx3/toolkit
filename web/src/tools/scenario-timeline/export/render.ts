/**
 * 匯出圖片（規格 F70～F73、F78）：決定範圍、算出畫面描述、畫成 PNG 或寫成 SVG。
 */
import { safeFileName } from '@/core/files';
import { ensureFont, googleFontSubsetCss } from '@/core/fonts';
import { canvasToBlob } from '@/core/image';
import { alibiGaps, tvAt } from '../model/alibi';
import {
  alibiReport,
  type ReportLabels,
  type ReportLine,
  type SliceLabels,
  sliceReport,
} from '../model/alibiReport';
import { axisTicks } from '../model/axis';
import { calInfo } from '../model/calendar';
import { chronicle } from '../model/chronicle';
import { type FilterState, filteredDoc, matchingIds } from '../model/filter';
import { contentRange, eventSpan, hasContentIn, type Span } from '../model/layout';
import { createMeasure } from '../model/measure';
import { pageLabel, planPages } from '../model/paging';
import { litIds, spotLanes, validSpot } from '../model/spotlight';
import { formatLong, type Precision, parseTime, readTime, type Tv } from '../model/time';
import { nowValue, type TimelineDoc, todayValue } from '../model/types';
import {
  type Audience,
  progressValue,
  REDACTED,
  type VisibleDoc,
  visibleDoc,
} from '../model/visible';
import { fitWithLabels, type Win } from '../model/window';
import type { ExportPrefs } from '../store';
import { S } from '../strings';
import { type PanelKind, TITLE_FONT_SPECS, type TitleFont } from './paper';
import {
  buildPicture,
  drawPicture,
  laneColumnWidth,
  type PanelSpec,
  type Picture,
  type PictureMeasures,
  type PictureStyle,
  pictureChars,
  pictureFamilyChars,
  pictureToSvg,
  SVG_FAMILY,
} from './picture';

export const EXPORT_FONT = 'Noto Sans TC';
export const MAX_SIDE = 16000;

export const measures = (font: TitleFont = 'sans'): PictureMeasures => ({
  item: createMeasure(12, 500, SVG_FAMILY),
  small: createMeasure(11, 400, SVG_FAMILY),
  major: createMeasure(11, 600, SVG_FAMILY),
  lane: createMeasure(12, 600, SVG_FAMILY),
  title: createMeasure(18, 700, SVG_FAMILY),
  ...(font !== 'sans'
    ? { titleAlt: createMeasure(18, TITLE_FONT_SPECS[font].weight, TITLE_FONT_SPECS[font].stack) }
    : {}),
});

const clampWidth = (w: number) => Math.min(8000, Math.max(600, Math.round(w) || 1600));

export type PlanResult = { ok: true; pic: Picture; range: Span } | { ok: false; error: string };

/** 專案名稱 → 檔名的主體（空白時「劇本時間表」） */
export function fileBase(doc: Pick<TimelineDoc, 'title'>): string {
  return safeFileName(doc.title.trim() || S.toolName, { fallback: S.toolName, maxLength: 60 });
}

/** 對象的檔名尾巴：GM 用「_GM」、人物別「_<名稱>」（F118）、PL 用沒有 */
function audienceTail(doc: TimelineDoc, audience: Audience, pov = ''): string {
  if (audience === 'gm') return `_${S.fileName.gm}`;
  const lane = pov ? doc.lanes.find((l) => l.id === pov) : undefined;
  if (!lane) return '';
  const name = safeFileName(lane.name.trim() || S.untitled, {
    fallback: S.untitled,
    maxLength: 40,
  });
  return `_${name}`;
}

export function imageFileName(
  doc: TimelineDoc,
  audience: Audience,
  ext: 'png' | 'svg',
  pov = '',
  page = 0,
): string {
  const tail = page ? `_p${String(page).padStart(2, '0')}` : '';
  return `${fileBase(doc)}_${S.fileName.image}${audienceTail(doc, audience, pov)}${tail}.${ext}`;
}

/** 文字的檔名：年表（時間順）或進行表（人物・地點別，F122） */
export function textFileName(
  doc: TimelineDoc,
  audience: Audience,
  ext: 'txt' | 'md',
  pov = '',
  byLane = false,
): string {
  return `${fileBase(doc)}_${byLane ? S.fileName.lanes : S.fileName.text}${audienceTail(doc, audience, pov)}.${ext}`;
}

/** 範圍的文字寫到哪裡：日期時間、第 N 天寫到分；架空年寫到年（有月份時寫到日；寫到時刻時到分，F110） */
function rangeTv(doc: TimelineDoc, v: number): Tv {
  if (doc.mode !== 'year') return { v: Math.round(v), p: 'minute' as Precision };
  const info = calInfo(doc.calendar);
  if (info) return { v, p: info.clock ? 'minute' : 'day' };
  return { v: Math.round(v), p: 'year' };
}

/**
 * 給某個對象的資料；filter 給了時只留符合篩選的事件（「只匯出篩選的結果」，F91）。pov：人物別（PL 用時，F118）
 */
export function exportDoc(
  doc: TimelineDoc,
  audience: Audience,
  filter: FilterState | null,
  pov = '',
) {
  const vdoc = visibleDoc(doc, audience, pov);
  return filter ? filteredDoc(vdoc, matchingIds(vdoc, filter)) : vdoc;
}

/** 時間軸那邊的聚光與時間切片（F134；匯出的「照時間軸的聚光與時間切片」、時間切片的調書用） */
export interface FocusContext {
  /** 目前檢視的聚光（在匯出的對象裡沒有這個選項時不用） */
  spot?: string;
  /** 時間切片的時間（標準寫法；關著時 null） */
  sliceTime?: string | null;
}

/** 圖下方的調書最多列幾行（每一塊；其他寫「…還有 N 筆」） */
export const PANEL_MAX_LINES = 12;

const clipLines = (lines: ReportLine[]): ReportLine[] =>
  lines.length > PANEL_MAX_LINES
    ? [
        ...lines.slice(0, PANEL_MAX_LINES - 1),
        { text: S.anMore(lines.length - PANEL_MAX_LINES + 1), tone: 'muted' },
      ]
    : lines;

/** 推理的文字（調書、時間切片）的寫法 */
export const reportLabels = (): ReportLabels => ({
  untitled: S.untitled,
  testimony: S.anTestimony,
  truth: S.anTruth,
  gaps: S.anGaps,
  noContacts: S.anNoContacts,
  noGaps: S.anNoGaps,
  gapsYear: S.anGapsYear,
  conflict: S.anConflict,
  hidden: S.anHidden,
  instant: S.anInstant,
});
export const sliceLabels = (): SliceLabels => ({
  untitled: S.untitled,
  redacted: REDACTED,
  exitDefault: S.exitDefault,
  unknownPlace: S.anUnknownPlace,
  together: S.anTogether,
  truthTag: S.anTruthTag,
  claimed: S.anClaimed,
  nobody: S.anNobody,
  unknown: S.anUnknown,
  exited: S.anExited,
  ongoing: S.anOngoing,
});

/** 調書的標題（PL 用寫「只比證詞」） */
export const reportTitle = (vdoc: VisibleDoc) =>
  vdoc.audience === 'gm' ? S.anReportTitleGm : S.anReportTitlePl;

/** 時間切片的位置（看不懂、關著時 null） */
export function sliceValue(doc: TimelineDoc, t: string | null | undefined): number | null {
  if (!t) return null;
  return readTime(doc.mode, t, doc)?.v ?? null;
}

/** 圖下方的調書（F140）：不在場證明・接觸調書，或時間切片 */
export function panelSpec(
  doc: TimelineDoc,
  vdoc: VisibleDoc,
  kind: PanelKind | undefined,
  sliceV: number | null,
): PanelSpec | null {
  if (kind === 'report')
    return {
      title: reportTitle(vdoc),
      layout: 'columns',
      blocks: alibiReport(vdoc, reportLabels()).map((b) => ({
        heading: b.heading,
        lines: clipLines(b.lines),
      })),
    };
  if (kind === 'slice' && sliceV !== null) {
    const rep = sliceReport(vdoc, sliceV, sliceLabels());
    return {
      title: S.anSliceTitle(formatLong(doc.mode, tvAt(vdoc, sliceV), doc)),
      layout: 'cards',
      blocks: rep.blocks.map((b) => ({
        heading: b.heading,
        accent: b.together,
        lines: clipLines(b.lines),
      })),
      footer: rep.footer,
    };
  }
  return null;
}

/** 匯出設定 → 第五批的圖面設定（都沒用時 undefined：畫法和改版前相同） */
export function pictureStyle(
  doc: TimelineDoc,
  vdoc: VisibleDoc,
  ex: ExportPrefs,
  ctx: FocusContext = {},
): PictureStyle | undefined {
  const paper = ex.paper && ex.paper !== 'none' ? ex.paper : undefined;
  const font = ex.titleFont && ex.titleFont !== 'sans' ? ex.titleFont : undefined;
  const panel = ex.panel && ex.panel !== 'none' ? ex.panel : undefined;
  const sliceV = sliceValue(doc, ctx.sliceTime);
  const focus = !!ex.focus;
  if (
    !paper &&
    !font &&
    !panel &&
    !focus &&
    !ex.frame &&
    ex.grid !== false &&
    !ex.marks &&
    !ex.gaps
  )
    return undefined;
  const spot = focus ? validSpot(vdoc, ctx.spot) : '';
  const sliceOn = focus ? sliceV : null;
  return {
    ...(paper
      ? {
          paper,
          age: Math.min(100, Math.max(0, ex.age ?? DEFAULT_AGE)) / 100,
          seed: ex.seed ?? 0,
          curl: ex.curl !== false,
          transparent: ex.transparent !== false,
        }
      : {}),
    ...(font ? { titleFont: font } : {}),
    ...(ex.frame ? { frame: true } : {}),
    ...(ex.grid === false ? { grid: false } : {}),
    ...(ex.marks ? { marks: true } : {}),
    ...(ex.gaps ? { gaps: alibiGaps(vdoc) } : {}),
    ...(focus
      ? {
          lit: litIds(vdoc, spot, sliceOn),
          litLanes: spotLanes(vdoc, spot),
          sliceV: sliceOn,
          ...(sliceOn !== null
            ? { sliceLabel: S.anSliceTag(formatLong(doc.mode, tvAt(vdoc, sliceOn), doc)) }
            : {}),
        }
      : {}),
    ...(panel ? { panel: panelSpec(doc, vdoc, panel, sliceV) } : {}),
  };
}

/** 紙的老舊的預設（選了紙的樣式時） */
export const DEFAULT_AGE = 20;

/** 畫一張圖（範圍、寬度已經決定） */
function pictureFor(
  doc: TimelineDoc,
  vdoc: VisibleDoc,
  ex: ExportPrefs,
  range: Span,
  rangeText: string,
  width: number,
  collapsed: Readonly<Record<string, boolean>>,
  nowV: number | null,
  style: PictureStyle | undefined,
): Picture {
  return buildPicture({
    vdoc,
    range,
    width,
    title: ex.title,
    legend: ex.legend,
    theme: ex.theme,
    collapsed,
    measures: measures(style?.titleFont ?? 'sans'),
    strings: {
      untitled: S.untitled,
      main: S.main,
      fallbackTitle: S.toolName,
      gmUse: S.gmUse,
      progress: S.progress,
      now: S.now,
      rangeText,
      ...(vdoc.pov ? { pov: S.povUse(laneName(doc, vdoc.pov)) } : {}),
      truth: S.tagTruth,
      alibi: S.tagAlibi,
      redacted: S.tagRedacted,
      opened: S.tagOpened,
      exit: S.exitDefault,
      ...(style ? { gap: S.anGapTag, marks: S.markLabels } : {}),
    },
    nowV,
    ...(style ? { style } : {}),
  });
}

/** 圖片的範圍（規格 F70）與畫面描述 */
export function planPicture(
  doc: TimelineDoc,
  ex: ExportPrefs,
  view: Win | null,
  collapsed: Readonly<Record<string, boolean>>,
  nowV: number | null = nowValue(),
  filter: FilterState | null = null,
  pov = ex.audience === 'pl' && ex.pov !== POV_ALL ? (ex.pov ?? '') : '',
  ctx: FocusContext = {},
): PlanResult {
  const vdoc = exportDoc(doc, ex.audience, filter, pov);
  let range: Span | null = null;
  let rangeText = '';
  if (ex.range === 'all') {
    const p = progressValue(vdoc);
    if (!contentRange(vdoc, p === null ? [] : [p])) return { ok: false, error: S.exEmpty };
    const m = measures();
    const width = clampWidth(ex.width);
    const w = fitWithLabels(
      vdoc,
      width - laneColumnWidth(vdoc, m, S.main, S.untitled),
      m.item,
      todayValue(),
      0.03,
    );
    range = { a: w.start, b: w.end };
    rangeText = chronicle(vdoc, S.untitled, S.toolName).range;
  } else if (ex.range === 'view') {
    if (!view) return { ok: false, error: S.exEmpty };
    range = { a: view.start, b: view.end };
  } else {
    const a = parseTime(doc.mode, ex.from, doc);
    const b = parseTime(doc.mode, ex.to, doc);
    if (!a.ok) return { ok: false, error: `${S.exFrom}：${a.error}` };
    if (!b.ok) return { ok: false, error: `${S.exTo}：${b.error}` };
    if (b.tv.v <= a.tv.v) return { ok: false, error: S.exRangeBad };
    range = { a: a.tv.v, b: b.tv.v };
  }
  if (ex.range !== 'all') {
    /* 目前畫面、自訂範圍裡沒有事件、標記、目前進度時不匯出（規格 F70） */
    const p = progressValue(vdoc);
    if (!hasContentIn(vdoc, range, p === null ? [] : [p])) return { ok: false, error: S.exEmpty };
  }
  if (!rangeText) rangeText = spanRangeText(doc, range);
  const style = pictureStyle(doc, vdoc, ex, ctx);
  const pic = pictureFor(
    doc,
    vdoc,
    ex,
    range,
    rangeText,
    clampWidth(ex.width),
    collapsed,
    nowV,
    style,
  );
  return { ok: true, pic, range };
}

const spanRangeText = (doc: TimelineDoc, range: Span) =>
  `${formatLong(doc.mode, rangeTv(doc, range.a), doc)}～${formatLong(doc.mode, rangeTv(doc, range.b), doc)}`;

export type PagesResult =
  | { ok: true; pages: { pic: Picture; range: Span }[] }
  | { ok: false; error: string };

/**
 * A4 自動分頁（F141）：整張圖照 planPicture 的範圍與寬度（比例尺）切成好幾頁；每頁再畫一次標題列、刻度、泳道名稱，
 * 右上角寫頁碼（打開時），調書放在最後一頁。一頁放得下時只有一頁。
 */
export function planPicturePages(
  doc: TimelineDoc,
  ex: ExportPrefs,
  view: Win | null,
  collapsed: Readonly<Record<string, boolean>>,
  nowV: number | null = nowValue(),
  filter: FilterState | null = null,
  pov = ex.audience === 'pl' && ex.pov !== POV_ALL ? (ex.pov ?? '') : '',
  ctx: FocusContext = {},
): PagesResult {
  const first = planPicture(doc, { ...ex, panel: 'none' }, view, collapsed, nowV, filter, pov, ctx);
  if (!first.ok) return first;
  const vdoc = exportDoc(doc, ex.audience, filter, pov);
  const range = first.range;
  const width = clampWidth(ex.width);
  const lw = laneColumnWidth(vdoc, measures(), S.main, S.untitled);
  const k = Math.max(40, width - lw) / Math.max(1e-9, range.b - range.a);
  const bars: Span[] = [];
  const backgrounds: Span[] = [];
  for (const e of [...vdoc.events, ...(vdoc.truths ?? [])]) {
    if (e.kind === 'point') continue;
    const sp = eventSpan(vdoc.mode, e, vdoc);
    if (sp) (e.kind === 'background' ? backgrounds : bars).push(sp);
  }
  const ticks = axisTicks(vdoc.mode, range.a, range.b, k, measures().small, vdoc);
  const spans = planPages({
    range,
    k,
    laneW: lw,
    height: first.pic.height,
    bars,
    backgrounds,
    cuts: [...ticks.minor.map((t) => t.v), ...ticks.major.map((t) => t.v)],
  });
  const style = pictureStyle(doc, vdoc, ex, ctx) ?? {};
  const n = spans.length;
  const pages = spans.map((sp, i) => {
    const last = i === n - 1;
    const st: PictureStyle = {
      ...style,
      ...(ex.pageNum !== false ? { pageLabel: pageLabel(i + 1, n) } : {}),
      ...(last ? {} : { panel: null }),
    };
    const w = Math.round(lw + (sp.b - sp.a) * k);
    const text =
      n === 1 && ex.range === 'all'
        ? chronicle(vdoc, S.untitled, S.toolName).range
        : spanRangeText(doc, sp);
    return { pic: pictureFor(doc, vdoc, ex, sp, text, w, collapsed, nowV, st), range: sp };
  });
  return { ok: true, pages };
}

/** 「人物別：全部各一張」（F118） */
export const POV_ALL = '*';

const laneName = (doc: TimelineDoc, id: string) =>
  doc.lanes.find((l) => l.id === id)?.name.trim() || S.untitled;

/** 標題的字體（F139）：字型堆疊 → 要載入的字型 */
const familiesOf = (stack: string): readonly string[] =>
  Object.values(TITLE_FONT_SPECS).find((f) => f.stack === stack)?.families ?? [];

/** 載入畫圖要用的字（PNG） */
async function ensurePictureFonts(pic: Picture): Promise<void> {
  const chars = pictureChars(pic);
  const jobs: Promise<boolean>[] = [...chars].map(([w, set]) =>
    ensureFont(EXPORT_FONT, w, [...set].join(''), { timeoutMs: 6000 }),
  );
  for (const [stack, byW] of pictureFamilyChars(pic))
    for (const family of familiesOf(stack))
      for (const [w, set] of byW)
        jobs.push(ensureFont(family, w, [...set].join(''), { timeoutMs: 6000 }));
  await Promise.all(jobs);
}

export async function renderPng(
  pic: Picture,
  scale: number,
): Promise<{ blob: Blob; scale: number; width: number; height: number }> {
  await ensurePictureFonts(pic);
  const s = Math.max(0.1, Math.min(scale, MAX_SIDE / pic.width, MAX_SIDE / pic.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(pic.width * s));
  canvas.height = Math.max(1, Math.round(pic.height * s));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('無法建立畫布。');
  ctx.scale(s, s);
  drawPicture(ctx, pic);
  const blob = await canvasToBlob(canvas, 'image/png');
  const out = { blob, scale: s, width: canvas.width, height: canvas.height };
  canvas.width = 0;
  canvas.height = 0;
  return out;
}

export async function renderSvg(pic: Picture): Promise<{ blob: Blob; fontEmbedded: boolean }> {
  const css = await googleFontSubsetCss(EXPORT_FONT, pictureChars(pic));
  /* 標題的字體（F139；沒有時和以前相同） */
  const extra: (string | null)[] = [];
  for (const [stack, byW] of pictureFamilyChars(pic))
    for (const family of familiesOf(stack)) extra.push(await googleFontSubsetCss(family, byW));
  const all = extra.length ? [css, ...extra] : [css];
  const ok = all.every((c) => c !== null);
  const text = pictureToSvg(pic, extra.length ? all.filter((c) => c).join('\n') : (css ?? ''));
  return { blob: new Blob([text], { type: 'image/svg+xml' }), fontEmbedded: ok };
}
