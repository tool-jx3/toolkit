/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 角色卡（原作的 charCardText：把一個角色的設定整理成 Markdown 形狀的純文字）與數值圖表的序列
 * （原作的 radarSeriesFor、radarStateName）。
 */
import { charLevel, displayName, sheetCtx } from '../engine/geom';
import {
  grelEndIsLbl,
  grelEndMembers,
  grelEndName,
  grelEntriesFor,
  grelExcluded,
} from '../engine/labels';
import { variantOf } from '../model/library';
import { ownColor } from '../model/normalize';
import type { Char, Project, RadarTpl, RadarVals, Sheet } from '../model/types';
import { richToLines } from './rich';

/** 範本的名稱（空白＝「未命名範本」） */
export const radarTplName = (t: Pick<RadarTpl, 'name'>): string => t.name || '未命名範本';
/** 軸的名稱（空白＝「第 N 軸」） */
export const radarAxisName = (a: { label: string }, i: number): string =>
  a.label || `第 ${i + 1} 軸`;
/** 狀態的名稱：空白且只有一個狀態＝不寫；多個狀態時空白的叫「狀態 N」 */
export const radarStateName = (s: Pick<RadarVals, 'state'>, i: number, total: number): string =>
  s.state || (total > 1 ? `狀態 ${i + 1}` : '');

export interface RadarSeries {
  key: string;
  name: string;
  /** 角色自訂的外框色（只給第一個狀態） */
  own: string;
  vals: Record<string, number>;
  hidden: boolean;
  color?: string;
}

/** 一位角色（目前這件變體）在一份範本的全部狀態 → 畫圖用的序列（名稱＝「名字・狀態」） */
export function radarSeriesFor(
  p: Pick<Project, 'library'>,
  c: Char | undefined,
  tpl: RadarTpl | undefined,
  key: string,
  hide: ReadonlySet<string> = new Set(),
): RadarSeries[] {
  if (!c || !tpl) return [];
  const v = variantOf(p, c).variant;
  if (!v) return [];
  const list = v.radars.filter((s) => s.tpl === tpl.id);
  const own = ownColor(c.color) ?? '';
  return list.map((s, i) => {
    const k = `${key}:${i}`;
    const nm = radarStateName(s, i, list.length);
    return {
      key: k,
      name: displayName(c) + (nm ? `・${nm}` : ''),
      own: i === 0 && own ? own : '',
      vals: s.vals,
      hidden: hide.has(k),
    };
  });
}

/**
 * 角色卡：# 名字、標籤、重要度（> 0 才寫）、## 角色資訊、## 關係、## 群體關係（依標籤）、## 看法、## 數值圖表；
 * 空的段落整段不出。和原作不同：關係名稱的換行換成空白、表格的儲存格之間用「｜」。
 */
export function charCardText(p: Project, sheet: Sheet, c: Char): string {
  const L: string[] = [];
  const push = (h: string, body: string[]) => {
    if (!body.length) return;
    L.push(`## ${h}`, ...body, '');
  };
  L.push(`# ${displayName(c)}`, '');
  const ctx = sheetCtx(sheet, p.labels);
  const { entry, variant } = variantOf(p, c);
  const lblNames = c.labels.map((id) => ctx.lblById.get(id)?.text).filter((t): t is string => !!t);
  const head: string[] = [];
  if (lblNames.length) head.push(`標籤：${lblNames.join('、')}`);
  if (charLevel(c) > 0) head.push(`角色重要度：H${charLevel(c)}`);
  if (head.length) L.push(...head, '');
  if (entry?.info) {
    const lines = richToLines(entry.info);
    while (lines.length && !lines[lines.length - 1]) lines.pop();
    push('角色資訊', lines);
  }
  const one = (s: string) => s.replace(/\s*\n+\s*/g, ' ');
  const rels: string[] = [];
  for (const r of sheet.rels) {
    if (r.from !== c.id && r.to !== c.id) continue;
    const t = ctx.typeById.get(r.type);
    if (!t) continue;
    const self = r.from === r.to;
    const mine = r.from === c.id;
    const other = ctx.byId.get(self ? c.id : mine ? r.to : r.from);
    if (!other) continue;
    const arrow = self ? '↻' : r.both ? '⇄' : mine ? '→' : '←';
    rels.push(`- ${arrow} ${one(t.label)} ${self ? '（自己）' : displayName(other)}`);
  }
  push('關係', rels);
  push(
    '群體關係（依標籤）',
    grelEntriesFor(ctx, c.id)
      .filter((en) => !en.ex)
      .map((en) => {
        const t = ctx.typeById.get(en.g.type);
        const arrow = en.g.both ? '⇄' : en.dirOut ? '→' : '←';
        const n = grelEndIsLbl(en.other)
          ? ` ×${grelEndMembers(ctx, en.other).filter((m) => !grelExcluded(en.g, m.id)).length}`
          : '';
        const via = en.via ? `（來自標籤：${en.via.text}）` : '';
        return `- ${arrow} ${one(t?.label ?? '')} ${grelEndName(ctx, en.other)}${n}${via}`;
      }),
  );
  const views: string[] = [];
  const vs = sheet.views;
  for (const o of sheet.chars) {
    if (o.id === c.id) continue;
    const mine = vs[c.id]?.[o.id];
    if (mine) views.push(`- → ${displayName(o)}：「${mine}」`);
  }
  for (const o of sheet.chars) {
    if (o.id === c.id) continue;
    const theirs = vs[o.id]?.[c.id];
    if (theirs) views.push(`- ← ${displayName(o)}：「${theirs}」`);
  }
  push('看法', views);
  const radar: string[] = [];
  for (const s of variant?.radars ?? []) {
    const tp = p.radarTpls.find((t) => t.id === s.tpl);
    if (!tp) continue;
    const list = (variant?.radars ?? []).filter((x) => x.tpl === tp.id);
    const nm = radarStateName(s, list.indexOf(s), list.length);
    radar.push(
      `- ${radarTplName(tp)}${nm ? `（${nm}）` : ''}：${tp.axes
        .map((a, i) => {
          const v = Number(s.vals[a.id]);
          return `${radarAxisName(a, i)} ${Number.isFinite(v) ? v : 0}${a.unit ? ` ${a.unit}` : ''}`;
        })
        .join('／')}`,
    );
  }
  push('數值圖表', radar);
  return `${L.join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()}\n`;
}
