/**
 * 推理的分析的文字（第五批，規格 F131～F133、3.15）：不在場證明・接觸調書、時間切片寫成一行一行的文字。
 * 推理分頁的清單、複製的文字、匯出圖下方的調書共用。只用 visibleDoc 的結果（不洩漏，同 alibi.ts）。
 */
import {
  type AlibiGap,
  alibiGaps,
  type Contact,
  contactReport,
  durationText,
  GAP_MIN,
  gapsSupported,
  spanText,
  type TimeSlice,
  timeSlice,
} from './alibi';
import type { VisibleDoc } from './visible';

export type Tone = 'muted' | 'alert' | 'truth';
export interface ReportLine {
  text: string;
  tone?: Tone;
}
export interface ReportBlock {
  key: 'testimony' | 'truth' | 'gaps';
  heading: string;
  lines: ReportLine[];
}

export interface ReportLabels {
  untitled: string;
  testimony: string;
  truth: string;
  gaps: (min: number) => string;
  noContacts: string;
  noGaps: (min: number) => string;
  gapsYear: string;
  conflict: (name: string, when: string, place: string) => string;
  hidden: string;
  instant: string;
}

const laneNames = (vdoc: VisibleDoc, untitled: string) =>
  new Map(vdoc.lanes.map((l) => [l.id, l.name.trim() || untitled]));

/** 同席一行：「21:00～21:30（30 分）＠大廳：人物甲 × 人物乙」 */
export function contactLine(
  vdoc: VisibleDoc,
  c: Contact,
  names: ReadonlyMap<string, string>,
  L: ReportLabels,
): ReportLine {
  const len = c.b > c.a ? durationText(vdoc.mode, c.b - c.a) : L.instant;
  const head = `${spanText(vdoc, c.a, c.b)}${len ? `（${len}）` : ''}＠${c.place}：${names.get(c.lanes[0]) ?? L.untitled} × ${names.get(c.lanes[1]) ?? L.untitled}`;
  if (c.conflict)
    return {
      text: `${head}　${L.conflict(names.get(c.conflict.laneId) ?? L.untitled, spanText(vdoc, c.conflict.a, c.conflict.b), c.conflict.place)}`,
      tone: 'alert',
    };
  if (c.hidden) return { text: `${head}${L.hidden}`, tone: 'truth' };
  return { text: head };
}

/** 空白一行：「人物甲：21:30～22:00（30 分）」 */
export function gapLine(
  vdoc: VisibleDoc,
  g: AlibiGap,
  names: ReadonlyMap<string, string>,
  untitled: string,
): ReportLine {
  const len = durationText(vdoc.mode, g.b - g.a);
  return {
    text: `${names.get(g.laneId) ?? untitled}：${spanText(vdoc, g.a, g.b)}${len ? `（${len}）` : ''}`,
  };
}

/** 不在場證明・接觸調書的幾塊：證詞的同席、真相的同席（GM 用）、不在場證明空白 */
export function alibiReport(vdoc: VisibleDoc, L: ReportLabels): ReportBlock[] {
  const names = laneNames(vdoc, L.untitled);
  const rep = contactReport(vdoc);
  const blocks: ReportBlock[] = [];
  const contacts = (list: Contact[]) =>
    list.length
      ? list.map((c) => contactLine(vdoc, c, names, L))
      : [{ text: L.noContacts, tone: 'muted' as const }];
  blocks.push({ key: 'testimony', heading: L.testimony, lines: contacts(rep.testimony) });
  if (vdoc.audience === 'gm')
    blocks.push({ key: 'truth', heading: L.truth, lines: contacts(rep.truth) });
  const gaps = alibiGaps(vdoc);
  blocks.push({
    key: 'gaps',
    heading: L.gaps(GAP_MIN),
    lines: !gapsSupported(vdoc.mode)
      ? [{ text: L.gapsYear, tone: 'muted' }]
      : gaps.length
        ? gaps.map((g) => gapLine(vdoc, g, names, L.untitled))
        : [{ text: L.noGaps(GAP_MIN), tone: 'muted' }],
  });
  return blocks;
}

export interface SliceLabels {
  untitled: string;
  redacted: string;
  exitDefault: string;
  unknownPlace: string;
  together: string;
  truthTag: string;
  claimed: (place: string) => string;
  nobody: string;
  unknown: (names: string) => string;
  exited: (list: string) => string;
  ongoing: (list: string) => string;
}

export interface SliceBlock {
  heading: string;
  together: boolean;
  lines: ReportLine[];
}

/** 時間切片的每個地點一塊，加上所在不明、退場、進行中的背景 */
export function sliceReport(
  vdoc: VisibleDoc,
  v: number,
  L: SliceLabels,
): { slice: TimeSlice; blocks: SliceBlock[]; footer: ReportLine[] } {
  const slice = timeSlice(vdoc, v, L);
  const blocks: SliceBlock[] = slice.rooms.map((r) => ({
    heading: `＠${r.place || L.unknownPlace}${r.together ? L.together : ''}`,
    together: r.together,
    lines: [
      ...r.people.map((p) => ({
        text: `・${p.name}${p.truth ? L.truthTag : ''}：${p.title}${p.claimed ? L.claimed(p.claimed) : ''}`,
        ...(p.truth ? { tone: 'truth' as const } : p.masked ? { tone: 'muted' as const } : {}),
      })),
      ...r.events.map((t) => ({ text: `・${t}`, tone: 'muted' as const })),
    ],
  }));
  const footer: ReportLine[] = [];
  if (slice.unknown.length)
    footer.push({ text: L.unknown(slice.unknown.join('、')), tone: 'alert' });
  if (slice.exited.length)
    footer.push({
      text: L.exited(slice.exited.map((x) => `${x.name}（${x.label}）`).join('、')),
      tone: 'muted',
    });
  if (slice.backgrounds.length)
    footer.push({ text: L.ongoing(slice.backgrounds.join('、')), tone: 'muted' });
  if (!blocks.length && !footer.length) footer.push({ text: L.nobody, tone: 'muted' });
  return { slice, blocks, footer };
}

/** 純文字（複製用）：標題、每一塊「■ 小標題」＋「・」開頭的行 */
export function reportText(
  title: string,
  blocks: readonly { heading: string; lines: readonly ReportLine[] }[],
  footer: readonly ReportLine[] = [],
): string {
  const out = [title];
  for (const b of blocks) {
    out.push('', `■ ${b.heading}`);
    for (const ln of b.lines) out.push(ln.text.startsWith('・') ? ln.text : `・${ln.text}`);
  }
  if (footer.length) {
    out.push('');
    for (const ln of footer) out.push(ln.text);
  }
  return `${out.join('\n')}\n`;
}
