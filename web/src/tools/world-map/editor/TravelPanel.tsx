/**
 * 路線的旅程概算（第二批，規格 F76～F81）：總長、必要日數（或算不出的理由）、地形別的距離、影響計算的素材、
 * 假設；設定：只用距離計算、移動方式、每日距離、追加的難度、通行的方式、比例尺（整張地圖共用）。
 * 城牆與國界線只顯示總長。
 */
import { useMemo } from 'react';
import { historyGesture } from '@/core/storage';
import { Field, NumberInput, Select, Toggle } from '@/ui';
import { assetDef } from '../model/assets';
import { formatLength, pathKm } from '../model/scale';
import { gridOf } from '../model/terrain';
import { travelForPath } from '../model/travel';
import {
  type MapPath,
  RANGES,
  type SelRef,
  TRAVEL_ACCESS,
  TRAVEL_DIFFICULTIES,
  TRAVEL_MODES,
} from '../model/types';
import { S } from '../strings';
import * as act from './actions';
import { useDoc } from './store';

const g = historyGesture(useDoc);
const T = S.travel;

/** 0.1 未滿寫「不到 0.1」，其他到小數 1 位 */
const fmt = (v: number) => formatLength(v);

/** 影響計算的素材：依種類列出（同種類加 ×N） */
function usedList(
  ids: readonly string[],
  objects: readonly { id: string; kind: string }[],
): string {
  const counts = new Map<string, number>();
  for (const id of ids) {
    const o = objects.find((v) => v.id === id);
    if (!o) continue;
    const name = assetDef(o.kind)?.name ?? o.kind;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts].map(([n, c]) => (c > 1 ? `${n} ×${c}` : n)).join('、');
}

export function TravelPanel({ sel, p }: { sel: SelRef; p: MapPath }) {
  const doc = useDoc((s) => s.data);
  const travel = p.kind !== 'wall' && p.kind !== 'border';
  const { terrain, ground, cols, rows } = doc;
  const grid = useMemo(
    () => gridOf({ terrain, ground, cols, rows }),
    [terrain, ground, cols, rows],
  );
  const m = useMemo(() => (travel ? travelForPath(doc, grid, p) : null), [travel, doc, grid, p]);
  const km = doc.settings.kmPer100;
  const scale = (
    <Field label={S.finish.scale} hint={S.finish.scaleHint}>
      <NumberInput
        value={km}
        min={RANGES.kmPer100.min}
        max={RANGES.kmPer100.max}
        step={1}
        precision={2}
        unit="km"
        onChange={g.live((v) =>
          useDoc.getState().update((d) => {
            d.settings.kmPer100 = act.clampKm(v);
          }),
        )}
        onCommit={g.commit}
      />
    </Field>
  );
  if (!m)
    return (
      <>
        <p
          className="m-0 rounded-md bg-surface-2 px-2.5 py-1.5 text-sm font-medium tabular-nums"
          data-testid="path-length"
        >
          {S.inspector.length(fmt(pathKm(p, km)))}
        </p>
        {scale}
      </>
    );
  const notes: string[] = [];
  if (m.hazards.length) notes.push(T.hazards(m.hazards.length));
  if (m.infra.length) notes.push(T.infra(m.infra.length));
  if (m.bridged) notes.push(T.bridge);
  if (m.portUsed) notes.push(T.port);
  const used = [usedList(m.hazards, doc.objects), usedList(m.infra, doc.objects)]
    .filter(Boolean)
    .join('、');
  const byTerrain = m.terrain
    .map((v, i) => (v > 0.01 ? `${T.terrains[i]} ${fmt(v)} km` : ''))
    .filter(Boolean)
    .join('／');
  return (
    <>
      <div
        className="flex flex-col gap-1 rounded-md bg-surface-2 px-2.5 py-2 text-sm tabular-nums"
        data-testid="path-travel"
      >
        <b data-testid="path-length">{S.inspector.length(fmt(m.km))}</b>
        {m.reason ? (
          <>
            <span className="text-danger" data-testid="travel-reason">
              {T.reasons[m.reason]}
            </span>
            {m.pureDays !== null ? (
              <small className="text-xs text-muted">{T.pureIfIgnore(fmt(m.pureDays))}</small>
            ) : null}
          </>
        ) : (
          <b data-testid="travel-days">
            {T.days(fmt(m.days ?? 0))}
            {!m.simple &&
            m.pureDays !== null &&
            m.days !== null &&
            Math.abs(m.days - m.pureDays) >= 0.15 ? (
              <small className="ml-1 text-xs font-normal text-muted">
                {T.pureNote(fmt(m.pureDays))}
              </small>
            ) : null}
          </b>
        )}
        {m.cliffKm > 0 ? (
          <small className="text-xs text-warning" data-testid="travel-cliff">
            {T.cliff(m.cliffKm.toFixed(1))}
          </small>
        ) : null}
        {byTerrain || notes.length ? (
          <small className="text-xs text-muted" data-testid="travel-terrain">
            {byTerrain}
            {notes.length ? `${byTerrain ? '｜' : ''}${notes.join('・')}` : ''}
          </small>
        ) : null}
        {used ? (
          <small className="text-xs text-muted" data-testid="travel-used">
            {T.used}：{used}
          </small>
        ) : null}
        <small className="text-xs text-muted">
          {T.assume(T.modes[m.mode], m.speed)}
          {m.simple
            ? T.assumeSimple(m.difficulty)
            : T.assumeFull(m.factor.toFixed(1), m.difficulty)}
        </small>
      </div>
      {scale}
      <Field label={T.simple} layout="inline">
        <Toggle
          checked={p.simpleCalc}
          onCheckedChange={(v) => act.patchItem(sel, { simpleCalc: v })}
        />
      </Field>
      <Field label={T.mode}>
        <Select
          value={m.mode}
          onValueChange={(v) => act.setTravelMode(sel, v)}
          options={TRAVEL_MODES.map((v) => ({ value: v, label: T.modes[v] }))}
        />
      </Field>
      <Field label={T.dailyKm}>
        <NumberInput
          value={m.speed}
          min={RANGES.dailyKm.min}
          max={RANGES.dailyKm.max}
          step={1}
          unit="km"
          onChange={g.live((v) =>
            act.patchItem(sel, {
              dailyKm: Math.min(RANGES.dailyKm.max, Math.max(RANGES.dailyKm.min, v)),
            }),
          )}
          onCommit={g.commit}
        />
      </Field>
      <Field label={T.difficulty}>
        <Select
          value={p.difficulty}
          onValueChange={(v) => act.patchItem(sel, { difficulty: v })}
          options={TRAVEL_DIFFICULTIES.map((v) => ({ value: v, label: T.difficulties[v] }))}
        />
      </Field>
      {p.simpleCalc ? null : (
        <Field label={T.access}>
          <Select
            value={p.access}
            onValueChange={(v) => act.patchItem(sel, { access: v })}
            options={TRAVEL_ACCESS.map((v) => ({ value: v, label: T.accesses[v] }))}
          />
        </Field>
      )}
      <div className="text-xs leading-relaxed text-muted">
        <p className="m-0">{T.hint}</p>
        <details>
          <summary className="cursor-pointer">{T.howTitle}</summary>
          <p className="m-0 mt-1">{T.how}</p>
        </details>
      </div>
    </>
  );
}
