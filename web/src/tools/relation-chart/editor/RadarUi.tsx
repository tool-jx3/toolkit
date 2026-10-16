/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 數值圖表（F192）的三個地方（原作 2026-09-15 的分工）：
 * ① 編輯角色的「數值圖表」節（radarValuesSecHtml）＝填數值的唯一地方；
 * ② 數值比較（openRadarPanel）＝只看不填，A、B 疊圖；
 * ③ 範本設定（openRadarTplPanel）。
 * 數值在變體上（換穿變體＝另一組數值）；打字即時重畫、離開欄位才記一步。
 * 第四批：「放到畫布上」＝新增一個圖表節點（帶範本與 A、B），並打開它的設定。
 */
import type { Draft } from 'immer';
import { useState } from 'react';
import {
  Button,
  Dialog,
  Field,
  Section,
  Segmented,
  Select,
  TextInput,
  Toggle,
  useConfirm,
} from '@/ui';
import { charts } from '../engine/charts';
import { displayName } from '../engine/geom';
import { radarSeriesFor, radarStateName, radarTplName } from '../logic/card';
import { variantOf } from '../model/library';
import { CHART_KINDS, RADAR_AXES_MAX, RADAR_AXES_MIN } from '../model/normalize';
import type { Char, ChartKind, Project, RadarTpl } from '../model/types';
import {
  addRadarAxis,
  addRadarState,
  addRadarTpl,
  deleteRadarAxis,
  deleteRadarState,
  deleteRadarTpl,
  setRadarStateName,
  setRadarVal,
  updateRadarTpl,
} from '../state/libActions';
import { addChartNote } from '../state/noteActions';
import { type DialogKind, gesture, setUi, useProject, useUi } from '../state/store';
import { S } from '../strings';
import { useSheet } from './hooks';
import { LiveText } from './widgets';

const T = S.radar;
type Lib = Pick<Project, 'library' | 'radarTpls'>;

/** 角色預設看哪一份範本：目前選的（這件變體有數值時）→ 有數值的第一份 → 目前選的 → 第一份（原作的 radarPickTplFor） */
export function pickTplFor(p: Lib, c: Char | undefined, cur: number | null): number {
  const has = (id: number | null) => id !== null && p.radarTpls.some((t) => t.id === id);
  const v = c ? variantOf(p, c).variant : undefined;
  if (has(cur) && v?.radars.some((s) => s.tpl === cur)) return cur as number;
  const used = v?.radars.find((s) => has(s.tpl));
  if (used) return used.tpl;
  if (has(cur)) return cur as number;
  return p.radarTpls[0]?.id ?? 0;
}

const chartOpts = { axisName: (i: number) => T.axisN(i + 1), pal: charts.PALETTE };

function ChartBox({
  tpl,
  series,
  empty,
}: {
  tpl: RadarTpl | undefined;
  series: ReturnType<typeof radarSeriesFor>;
  empty: string;
}) {
  if (!tpl) return <p className="text-xs text-muted">{T.noTpl}</p>;
  if (!series.length) return <p className="text-xs text-muted">{empty}</p>;
  return (
    <div
      className="mx-auto w-full max-w-[18rem] text-fg [&_svg]:h-auto [&_svg]:w-full"
      data-testid="radar-chart"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: 圖是自己的畫法產生的 SVG（文字都跳脫過）
      dangerouslySetInnerHTML={{ __html: charts.chartSvg(tpl, series, chartOpts) }}
    />
  );
}

function Legend({
  series,
  onToggle,
}: {
  series: ReturnType<typeof radarSeriesFor>;
  onToggle: (key: string) => void;
}) {
  if (!series.length) return null;
  return (
    <div className="flex flex-wrap gap-1" data-testid="radar-legend">
      {series.map((s) => (
        <button
          key={s.key}
          type="button"
          title={T.legendTip}
          aria-pressed={!s.hidden}
          className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${s.hidden ? 'border-border text-muted line-through' : 'border-border-strong text-fg'}`}
          onClick={() => onToggle(s.key)}
        >
          <span className="size-2.5 rounded-full" style={{ background: s.color }} aria-hidden />
          {s.name}
        </button>
      ))}
    </div>
  );
}

/** 數字欄：打字即時寫入（清空＝刪掉這一軸的值）、離開才記一步；不夾上限 */
function NumField({
  value,
  onValue,
  placeholder,
  label,
  positive,
  testId,
}: {
  value: number | undefined;
  onValue: (v: number | null) => void;
  placeholder?: string;
  label: string;
  positive?: boolean;
  testId?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === undefined ? '' : String(value));
  return (
    <TextInput
      value={shown}
      inputMode="decimal"
      placeholder={placeholder}
      aria-label={label}
      className="h-7 w-24 text-right text-sm tabular-nums"
      onFocus={() => gesture.begin()}
      onBlur={() => {
        setDraft(null);
        gesture.commit();
      }}
      onChange={(e) => {
        const t = e.target.value;
        setDraft(t);
        const n = Number.parseFloat(t);
        if (positive) {
          if (Number.isFinite(n) && n > 0) onValue(n);
        } else onValue(t.trim() === '' || !Number.isFinite(n) ? null : n);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      data-testid={testId}
    />
  );
}

function TplSelect({ value, onChange }: { value: number; onChange: (id: number) => void }) {
  const tpls = useProject((s) => s.data.radarTpls);
  if (tpls.length < 2) return null;
  return (
    <Field label={T.tpl}>
      <Select
        size="sm"
        value={String(value)}
        onValueChange={(v) => onChange(Number(v))}
        options={tpls.map((t) => ({ value: String(t.id), label: radarTplName(t) }))}
        aria-label={T.tpl}
        data-testid="radar-tpl"
      />
    </Field>
  );
}

const toggleIn = (list: readonly string[], k: string) =>
  list.includes(k) ? list.filter((x) => x !== k) : [...list, k];

/** ① 編輯角色的「數值圖表」節 */
export function RadarSection({ c }: { c: Char }) {
  const library = useProject((s) => s.data.library);
  const radarTpls = useProject((s) => s.data.radarTpls);
  const cur = useUi((u) => u.radarTpl);
  const hide = useUi((u) => u.radarHide);
  const [open, setOpen] = useState<boolean | null>(null);
  const [openStates, setOpenStates] = useState<ReadonlySet<number>>(() => new Set());
  const p = { library, radarTpls };
  const tplId = pickTplFor(p, c, cur);
  const tpl = radarTpls.find((t) => t.id === tplId);
  const v = variantOf(p, c).variant;
  const hasVals = !!v?.radars.some((s) => radarTpls.some((t) => t.id === s.tpl));
  const series = tpl
    ? charts.assignColors(radarSeriesFor(p, c, tpl, 'a', new Set(hide)), charts.PALETTE)
    : [];
  const states = tpl && v ? v.radars.filter((s) => s.tpl === tpl.id) : [];
  const toTpl = (back: DialogKind = null) =>
    setUi({ dialog: 'radarTpl', radarTpl: tplId, radarBack: back });
  return (
    <Section title={T.sec} open={open ?? hasVals} onOpenChange={setOpen} className="bg-transparent">
      <div className="flex flex-col gap-2" data-testid="radar-sec">
        {!radarTpls.length ? (
          <>
            <p className="text-xs text-muted">{T.noTpl}</p>
            <Button
              size="sm"
              className="self-start"
              onClick={() => {
                const id = addRadarTpl();
                setOpen(true);
                setUi({ dialog: 'radarTpl', radarTpl: id, radarBack: null });
              }}
              data-testid="radar-new-tpl"
            >
              {T.newTpl}
            </Button>
          </>
        ) : (
          <>
            <TplSelect value={tplId} onChange={(id) => setUi({ radarTpl: id, radarHide: [] })} />
            <ChartBox tpl={tpl} series={series} empty={T.noState} />
            <Legend series={series} onToggle={(k) => setUi({ radarHide: toggleIn(hide, k) })} />
            {states.map((st, i) => (
              <details
                // biome-ignore lint/suspicious/noArrayIndexKey: 狀態沒有 id，「這份範本的第幾個」就是它的身分
                key={`${tplId}:${i}`}
                open={openStates.has(i)}
                onToggle={(e) => {
                  const on = (e.target as HTMLDetailsElement).open;
                  setOpenStates((s) => {
                    const n = new Set(s);
                    if (on) n.add(i);
                    else n.delete(i);
                    return n;
                  });
                }}
                className="rounded-md border border-border"
                data-testid="radar-state"
              >
                <summary className="cursor-pointer px-2 py-1 text-sm">
                  {radarStateName(st, i, states.length) || T.stateN(i + 1)}
                </summary>
                <div className="flex flex-col gap-2 px-2 pb-2">
                  <Field label={T.stateName}>
                    <LiveText
                      value={st.state}
                      placeholder={T.stateN(i + 1)}
                      onChange={(t) => setRadarStateName(c.id, tplId, i, t)}
                      data-testid="radar-state-name"
                    />
                  </Field>
                  {tpl?.axes.map((ax, j) => (
                    <div key={ax.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate">{ax.label || T.axisN(j + 1)}</span>
                      <NumField
                        value={st.vals[String(ax.id)]}
                        label={ax.label || T.axisN(j + 1)}
                        placeholder={T.valuePh(ax.max, ax.unit)}
                        onValue={(n) => setRadarVal(c.id, tplId, i, ax.id, n)}
                        testId="radar-val"
                      />
                    </div>
                  ))}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="self-start"
                    onClick={() => deleteRadarState(c.id, tplId, i)}
                  >
                    {T.stateDel}
                  </Button>
                </div>
              </details>
            ))}
            <div className="flex flex-wrap gap-1">
              <Button
                size="sm"
                disabled={!tpl}
                onClick={() => {
                  const idx = addRadarState(c.id, tplId);
                  if (idx >= 0) setOpenStates((s) => new Set([...s, idx]));
                }}
                data-testid="radar-state-add"
              >
                {T.stateAdd}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => toTpl()}>
                {T.tplSettings}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setUi({ dialog: 'radarCompare', compare: { a: c.id, b: null }, radarTpl: tplId })
                }
                data-testid="radar-compare"
              >
                {T.compareOpen}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={!tpl || !series.length}
                onClick={() => {
                  const id = addChartNote({ tpl: tplId, a: c.id });
                  setUi({ panel: { kind: 'note', id } });
                }}
                data-testid="radar-to-canvas"
              >
                {S.note.toCanvas}
              </Button>
            </div>
          </>
        )}
      </div>
    </Section>
  );
}

/* ---------- ② 數值比較 ---------- */

function CompareBody() {
  const sheet = useSheet();
  const library = useProject((s) => s.data.library);
  const radarTpls = useProject((s) => s.data.radarTpls);
  const compare = useUi((u) => u.compare);
  const cur = useUi((u) => u.radarTpl);
  const [hide, setHide] = useState<string[]>([]);
  const p = { library, radarTpls };
  const A = sheet.chars.find((c) => c.id === compare.a);
  const Bc = sheet.chars.find((c) => c.id === compare.b && c.id !== compare.a);
  const [tplId, setTplId] = useState(() => pickTplFor(p, A, cur));
  const tpl = radarTpls.find((t) => t.id === tplId) ?? radarTpls[0];
  const h = new Set(hide);
  const series = tpl
    ? charts.assignColors(
        [...radarSeriesFor(p, A, tpl, 'a', h), ...radarSeriesFor(p, Bc, tpl, 'b', h)],
        charts.PALETTE,
      )
    : [];
  const chars = sheet.chars.map((c) => ({ value: String(c.id), label: displayName(c) }));
  return (
    <div className="flex flex-col gap-3" data-testid="radar-compare-dialog">
      {radarTpls.length ? (
        <TplSelect
          value={tpl?.id ?? 0}
          onChange={(id) => {
            setTplId(id);
            setHide([]);
          }}
        />
      ) : null}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Field label={T.charA}>
          <Select
            size="sm"
            value={A ? String(A.id) : ''}
            placeholder={T.pickChar}
            onValueChange={(v) => {
              const a = Number(v);
              setUi({ compare: { a, b: compare.b === a ? null : compare.b } });
              setHide([]);
            }}
            options={chars}
            aria-label={T.charA}
            data-testid="radar-a"
          />
        </Field>
        <Field label={T.charB}>
          <Select
            size="sm"
            value={Bc ? String(Bc.id) : '0'}
            onValueChange={(v) => {
              const b = Number(v);
              setUi({ compare: { a: compare.a, b: b && b !== compare.a ? b : null } });
              setHide([]);
            }}
            options={[{ value: '0', label: T.noCompare }, ...chars]}
            aria-label={T.charB}
            data-testid="radar-b"
          />
        </Field>
      </div>
      <ChartBox tpl={tpl} series={series} empty={A ? T.noState : T.noChar} />
      <Legend series={series} onToggle={(k) => setHide((h) => toggleIn(h, k))} />
      <div className="flex flex-wrap gap-1">
        <Button
          size="sm"
          disabled={!A}
          onClick={() => {
            if (!A) return;
            setUi({
              dialog: null,
              panel: { kind: 'char', id: A.id },
              radarTpl: tpl?.id ?? null,
              radarHide: [],
            });
          }}
          data-testid="radar-edit-a"
        >
          {T.editA}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            setUi({ dialog: 'radarTpl', radarTpl: tpl?.id ?? null, radarBack: 'radarCompare' })
          }
        >
          {T.tplSettings}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!tpl || !series.length}
          onClick={() => {
            if (!tpl) return;
            const id = addChartNote({ tpl: tpl.id, a: A?.id ?? null, b: Bc?.id ?? null });
            setUi({ dialog: null, panel: { kind: 'note', id } });
          }}
          data-testid="radar-compare-to-canvas"
        >
          {S.note.toCanvas}
        </Button>
      </div>
    </div>
  );
}

export function RadarCompareDialog() {
  const open = useUi((u) => u.dialog === 'radarCompare');
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && setUi({ dialog: null })}
      title={T.compareTitle}
      size="md"
    >
      {open ? <CompareBody /> : null}
    </Dialog>
  );
}

/* ---------- ③ 範本設定 ---------- */

function TplBody() {
  const sheet = useSheet();
  const confirm = useConfirm();
  const library = useProject((s) => s.data.library);
  const radarTpls = useProject((s) => s.data.radarTpls);
  const cur = useUi((u) => u.radarTpl);
  const tpl = radarTpls.find((t) => t.id === cur) ?? radarTpls[0];
  const p = { library, radarTpls };
  /* 預覽：本分頁第一位在這份範本有數值的角色 */
  const first =
    tpl && sheet.chars.find((x) => variantOf(p, x).variant?.radars.some((s) => s.tpl === tpl.id));
  const preview =
    tpl && first ? charts.assignColors(radarSeriesFor(p, first, tpl, 'a'), charts.PALETTE) : [];
  const set = (recipe: (t: Draft<RadarTpl>) => void) => {
    if (tpl) updateRadarTpl(tpl.id, recipe);
  };
  const kind = (tpl?.chart ?? 'radar') as ChartKind;
  return (
    <div className="flex flex-col gap-3" data-testid="radar-tpl-dialog">
      {radarTpls.length ? (
        <TplSelect value={tpl?.id ?? 0} onChange={(id) => setUi({ radarTpl: id })} />
      ) : null}
      {tpl ? (
        <>
          <Field label={T.tplName}>
            <LiveText
              value={tpl.name}
              placeholder={T.unnamedTpl}
              onChange={(v) =>
                set((t) => {
                  t.name = v.slice(0, 100);
                })
              }
              data-testid="radar-tpl-name"
            />
          </Field>
          <ChartBox tpl={tpl} series={preview} empty={T.tplNoPreview} />
          <div className="flex flex-col gap-2">
            {tpl.axes.map((ax, j) => (
              <fieldset
                key={ax.id}
                className="m-0 flex flex-col gap-1 rounded-md border border-border p-2"
                data-testid="radar-axis"
              >
                <legend className="px-1 text-xs font-semibold text-muted">{T.axisN(j + 1)}</legend>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
                  <Field label={T.axisName}>
                    <LiveText
                      value={ax.label}
                      placeholder={T.axisN(j + 1)}
                      onChange={(v) =>
                        set((t) => {
                          const a = t.axes.find((x) => x.id === ax.id);
                          if (a) a.label = v.slice(0, 60);
                        })
                      }
                    />
                  </Field>
                  <Field label={T.axisMax}>
                    <NumField
                      value={ax.max}
                      label={T.axisMax}
                      placeholder="100"
                      positive
                      onValue={(n) =>
                        set((t) => {
                          const a = t.axes.find((x) => x.id === ax.id);
                          if (a && n !== null) a.max = n;
                        })
                      }
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
                  <Field label={T.axisUnit}>
                    <LiveText
                      value={ax.unit}
                      onChange={(v) =>
                        set((t) => {
                          const a = t.axes.find((x) => x.id === ax.id);
                          if (a) a.unit = v.slice(0, 20);
                        })
                      }
                    />
                  </Field>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={tpl.axes.length <= RADAR_AXES_MIN}
                    title={T.axisRange}
                    onClick={() => deleteRadarAxis(tpl.id, ax.id)}
                    data-testid="radar-axis-del"
                  >
                    {T.axisDel}
                  </Button>
                </div>
              </fieldset>
            ))}
            <Button
              size="sm"
              className="self-start"
              disabled={tpl.axes.length >= RADAR_AXES_MAX}
              title={T.axisRange}
              onClick={() => addRadarAxis(tpl.id)}
              data-testid="radar-axis-add"
            >
              {T.axisAdd}
            </Button>
          </div>
          <Field label={T.chartType}>
            <Select
              size="sm"
              value={kind}
              onValueChange={(v) =>
                set((t) => {
                  t.chart = v as ChartKind;
                })
              }
              options={CHART_KINDS.map((k) => ({ value: k, label: T.charts[k] }))}
              aria-label={T.chartType}
              data-testid="radar-kind"
            />
          </Field>
          {kind === 'radar' ? (
            <Field label={T.shape}>
              <Segmented
                size="sm"
                value={tpl.shape}
                onValueChange={(v) =>
                  set((t) => {
                    t.shape = v as RadarTpl['shape'];
                  })
                }
                options={[
                  { value: 'poly', label: T.poly },
                  { value: 'circle', label: T.circle },
                ]}
              />
            </Field>
          ) : null}
          {kind === 'pie' || kind === 'gauge' ? null : (
            <Field label={kind === 'radar' ? T.rings : T.gridLines}>
              <Select
                size="sm"
                value={String(tpl.rings)}
                onValueChange={(v) =>
                  set((t) => {
                    t.rings = Number(v);
                  })
                }
                options={Array.from({ length: 8 }, (_, i) => ({
                  value: String(i + 1),
                  label: String(i + 1),
                }))}
                aria-label={kind === 'radar' ? T.rings : T.gridLines}
              />
            </Field>
          )}
          <Field label={T.valMode}>
            <Segmented
              size="sm"
              value={tpl.valMode}
              onValueChange={(v) =>
                set((t) => {
                  t.valMode = v as RadarTpl['valMode'];
                })
              }
              options={[
                { value: 'raw', label: T.raw },
                { value: 'pct', label: T.pct },
                { value: 'none', label: T.none },
              ]}
            />
          </Field>
          <div>
            <Toggle
              checked={tpl.shared}
              onCheckedChange={(v) =>
                set((t) => {
                  t.shared = v;
                })
              }
              label={T.shared}
            />
            <p className="mt-1 text-xs text-muted">{T.sharedHint}</p>
          </div>
        </>
      ) : (
        <p className="text-xs text-muted">{T.noTpl}</p>
      )}
      <div className="flex flex-wrap gap-1 border-t border-border pt-3">
        <Button
          size="sm"
          onClick={() => setUi({ radarTpl: addRadarTpl() })}
          data-testid="radar-tpl-add"
        >
          {T.tplAdd}
        </Button>
        {tpl ? (
          <Button
            size="sm"
            variant="danger"
            onClick={async () => {
              const ok = await confirm({
                title: T.tplDel,
                description: T.tplDelConfirm(radarTplName(tpl)),
                danger: true,
              });
              if (ok) deleteRadarTpl(tpl.id);
            }}
            data-testid="radar-tpl-del"
          >
            {T.tplDel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function RadarTplDialog() {
  const open = useUi((u) => u.dialog === 'radarTpl');
  const back = useUi((u) => u.radarBack);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && setUi({ dialog: back, radarBack: null })}
      title={T.tplTitle}
      size="md"
    >
      {open ? <TplBody /> : null}
    </Dialog>
  );
}
