/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 統計與尋路（F118；原作的 openStatsPanel）：右側的面板（本分頁）。
 * 中心度排行（前 10）、孤立角色（點一列＝選取那位角色，不移動視角）、最短關係鏈（來源、目標、尋找）、N 度聚焦（1～3 度）。
 * 尋路與 N 度聚焦的結果鎖定在畫布上（滑過不會搶走）；「清除聚焦」或關掉這個面板就解除。演算法在 logic/stats（和互動網頁同一套）。
 */
import { useEffect, useMemo, useState } from 'react';
import { Button, Field, Segmented, Select } from '@/ui';
import { displayName } from '../engine/geom';
import { degrees, isolated, nDegree, ranking, shortestChain, statEdges } from '../logic/stats';
import { setUi, useProject } from '../state/store';
import { S } from '../strings';
import { useSheet } from './hooks';

const T = S.stats;

export function StatsPanel() {
  const sheet = useSheet();
  const labels = useProject((s) => s.data.labels);
  const edges = useMemo(() => statEdges(sheet, labels), [sheet, labels]);
  const deg = useMemo(() => degrees(sheet, edges), [sheet, edges]);
  const ranked = ranking(sheet, deg);
  const iso = isolated(sheet, deg);
  const byId = new Map(sheet.chars.map((c) => [c.id, c]));
  const name = (id: number) => {
    const c = byId.get(id);
    return c ? displayName(c) : '?';
  };
  const [a, setA] = useState<number | null>(null);
  const [b, setB] = useState<number | null>(null);
  const [msg, setMsg] = useState('');
  const [fc, setFc] = useState<number | null>(null);
  const [n, setN] = useState(1);
  /* 關掉面板（或換成別的面板）＝解除鎖定的聚焦 */
  useEffect(() => () => setUi({ statsFocus: null }), []);
  const opts = sheet.chars.map((c) => ({ value: String(c.id), label: displayName(c) }));
  const has = (id: number | null) => id !== null && byId.has(id);
  const select = (id: number) => setUi({ sel: [id] });
  const row = (id: number, rank: number | null, count: number | null) => (
    <button
      key={id}
      type="button"
      title={T.clickHint}
      className="flex w-full items-baseline gap-2 rounded-sm px-1.5 py-0.5 text-left text-sm hover:bg-surface-2"
      onClick={() => select(id)}
      data-testid="stats-row"
    >
      {rank !== null ? <span className="w-6 shrink-0 text-muted tabular-nums">{rank}.</span> : null}
      <span className="min-w-0 flex-1 truncate">{name(id)}</span>
      {count !== null ? <span className="shrink-0 tabular-nums text-muted">{count}</span> : null}
    </button>
  );
  return (
    <div className="flex flex-col gap-3" data-testid="stats-panel">
      <section className="flex flex-col gap-1" data-testid="stats-rank">
        <h3 className="text-xs font-semibold text-muted">{T.centrality}</h3>
        {ranked.length ? (
          ranked.map((r, i) => row(r.id, i + 1, r.n))
        ) : (
          <p className="text-xs text-muted">{T.noRels}</p>
        )}
      </section>
      <section className="flex flex-col gap-1" data-testid="stats-iso">
        <h3 className="text-xs font-semibold text-muted">
          {iso.length ? T.isolatedN(iso.length) : T.isolated}
        </h3>
        {iso.length ? (
          iso.map((id) => row(id, null, null))
        ) : (
          <p className="text-xs text-muted">{T.noIsolated}</p>
        )}
        <p className="text-xs text-muted">{T.clickHint}</p>
      </section>
      <section className="flex flex-col gap-2 border-t border-border pt-3">
        <h3 className="text-xs font-semibold text-muted">{T.path}</h3>
        <Field label={T.from}>
          <Select
            size="sm"
            value={has(a) ? String(a) : ''}
            placeholder={T.pick}
            onValueChange={(v) => setA(Number(v))}
            options={opts}
            data-testid="stats-from"
          />
        </Field>
        <Field label={T.to}>
          <Select
            size="sm"
            value={has(b) ? String(b) : ''}
            placeholder={T.pick}
            onValueChange={(v) => setB(Number(v))}
            options={opts}
            data-testid="stats-to"
          />
        </Field>
        <Button
          size="sm"
          className="self-start"
          onClick={() => {
            if (!has(a) || !has(b)) return;
            if (a === b) {
              setMsg(T.samePerson);
              setUi({ statsFocus: null });
              return;
            }
            const chain = shortestChain(sheet, edges, a as number, b as number);
            if (!chain) {
              setMsg(T.noPath);
              setUi({ statsFocus: null });
              return;
            }
            setMsg(T.chain(chain.chars.map(name), chain.rels.length));
            setUi({
              statsFocus: {
                nodes: chain.chars,
                edges: chain.rels.filter((r): r is number => r !== null),
              },
              focus: null,
              hover: null,
            });
          }}
          data-testid="stats-find"
        >
          {T.find}
        </Button>
        {msg ? (
          <p className="text-sm" data-testid="stats-path-msg">
            {msg}
          </p>
        ) : null}
      </section>
      <section className="flex flex-col gap-2 border-t border-border pt-3">
        <h3 className="text-xs font-semibold text-muted">{T.focusN}</h3>
        <Field label={T.focusChar}>
          <Select
            size="sm"
            value={has(fc) ? String(fc) : ''}
            placeholder={T.pick}
            onValueChange={(v) => setFc(Number(v))}
            options={opts}
            data-testid="stats-focus-char"
          />
        </Field>
        <Field label={T.degRow}>
          <Segmented
            size="sm"
            value={String(n)}
            onValueChange={(v) => setN(Number(v))}
            options={[1, 2, 3].map((k) => ({ value: String(k), label: T.deg(k) }))}
            aria-label={T.degRow}
          />
        </Field>
        <div className="flex flex-wrap gap-1">
          <Button
            size="sm"
            onClick={() => {
              if (!has(fc)) return;
              const r = nDegree(sheet, edges, fc as number, n);
              setUi({ statsFocus: r, focus: null, hover: null });
            }}
            data-testid="stats-focus-go"
          >
            {T.focusGo}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setUi({ statsFocus: null })}
            data-testid="stats-focus-clear"
          >
            {T.focusClear}
          </Button>
        </div>
      </section>
    </div>
  );
}
