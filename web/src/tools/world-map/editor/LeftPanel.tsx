/**
 * 左側的四個分頁：地形（筆刷、畫法、地形、自動產生）、國與路線（畫線的工具、國的清單）、
 * 配置（素材的搜尋與分類、地名・備註）、完成（主題、字型、顯示、格線、比例尺、匯出）。
 */
import {
  BrickWall,
  Brush,
  Fence,
  Hand,
  MountainSnow,
  MousePointer2,
  Paintbrush,
  Pentagon,
  Route,
  Ship,
  Sparkles,
  Spline,
  Type,
  Waves,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { historyGesture } from '@/core/storage';
import {
  Button,
  Chips,
  cn,
  Field,
  NumberInput,
  Segmented,
  Slider,
  Tabs,
  TextInput,
  Toggle,
} from '@/ui';
import { assetIconUrl, docThumbUrl, terrainThumbUrl } from '../draw/thumbs';
import { ASSET_CATEGORIES, searchAssets } from '../model/assets';
import { FONT_STYLES, type MapSettings, PAINTS, RANGES, THEME_IDS } from '../model/types';
import { S } from '../strings';
import * as act from './actions';
import { editor } from './controller';
import { setEditor, type ToolId, useDoc, useEditor, usePrefs } from './store';

const g = historyGesture(useDoc);

function ToolButton({ tool, icon, keyHint }: { tool: ToolId; icon: ReactNode; keyHint?: string }) {
  const active = useEditor((s) => s.tool === tool);
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => act.setTool(tool)}
      data-tool={tool}
      className={cn(
        'flex min-w-0 items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none',
        active ? 'border-accent bg-accent-soft' : 'border-border bg-surface hover:bg-surface-2',
      )}
    >
      <span className="inline-flex shrink-0 [&_svg]:size-4" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{S.tools[tool]}</span>
      {keyHint ? <kbd className="text-[10px] text-muted">{keyHint}</kbd> : null}
    </button>
  );
}

function Tip({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 rounded-md bg-surface-2 px-2.5 py-2 text-xs leading-relaxed text-muted">
      {children}
    </p>
  );
}

/* ---------- 地形 ---------- */

function LandTab() {
  const mode = useDoc((s) => s.data.drawMode);
  const theme = useDoc((s) => s.data.theme);
  const brush = usePrefs((s) => s.data.brush);
  const paint = usePrefs((s) => s.data.paint);
  const tool = useEditor((s) => s.tool);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-1.5">
        <ToolButton tool="brush" icon={<Paintbrush />} keyHint="B" />
        <ToolButton tool="erase" icon={<Waves />} keyHint="E" />
        <ToolButton tool="select" icon={<MousePointer2 />} keyHint="V" />
        <ToolButton tool="hand" icon={<Hand />} keyHint="H" />
      </div>
      <Field label={S.land.mode} hint={mode === 'grid' ? S.land.modeGridHint : S.land.modeFreeHint}>
        <Segmented
          size="sm"
          fullWidth
          value={mode}
          onValueChange={(v) => {
            useDoc.getState().update((d) => {
              d.drawMode = v;
            });
            act.setTool('brush');
            act.notify(S.msg.modeChanged, 'info', { duration: 2000 });
          }}
          options={[
            { value: 'grid', label: S.land.modeGrid },
            { value: 'free', label: S.land.modeFree },
          ]}
        />
      </Field>
      <Field label={S.land.brush}>
        <Slider
          value={brush}
          min={RANGES.brush.min}
          max={RANGES.brush.max}
          onChange={(v) => usePrefs.getState().patch({ brush: v })}
        />
      </Field>
      <fieldset className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
        <legend className="mb-1.5 p-0 text-sm font-medium">{S.land.paint}</legend>
        <div className="grid grid-cols-3 gap-1.5">
          {PAINTS.map((p) => {
            const active = tool === 'brush' && paint === p;
            return (
              <button
                key={p}
                type="button"
                aria-pressed={active}
                aria-label={S.land.paintLabel(S.paints[p])}
                data-paint={p}
                onClick={() => {
                  usePrefs.getState().patch({ paint: p });
                  act.setTool('brush');
                }}
                className={cn(
                  'flex flex-col overflow-hidden rounded-md border text-xs focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none',
                  active
                    ? 'border-accent ring-1 ring-accent'
                    : 'border-border hover:border-border-strong',
                )}
              >
                <img
                  src={terrainThumbUrl(p, theme)}
                  alt=""
                  className="aspect-[180/112] w-full object-cover"
                />
                <span className={cn('px-1 py-0.5', active ? 'bg-accent-soft' : 'bg-surface')}>
                  {S.paints[p]}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>
      <ToolButton tool="relief" icon={<Brush />} />
      <Tip>{S.land.tip}</Tip>
      <div className="flex flex-col gap-1.5 rounded-md border border-border p-2.5">
        <Button
          variant="primary"
          icon={<Sparkles />}
          onClick={() => act.generate()}
          data-testid="generate"
        >
          {S.land.generate}
        </Button>
        <p className="m-0 text-xs text-muted">{S.land.generateHint}</p>
      </div>
    </div>
  );
}

/* ---------- 國與路線 ---------- */

function RoutesTab() {
  const regions = useDoc((s) => s.data.regions);
  const sel = useEditor((s) => s.sel);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-1.5">
        <ToolButton tool="region" icon={<Pentagon />} />
        <ToolButton tool="wall" icon={<BrickWall />} />
        <ToolButton tool="river" icon={<Spline />} />
        <ToolButton tool="road" icon={<Route />} />
        <ToolButton tool="sea" icon={<Ship />} />
        <ToolButton tool="border" icon={<Fence />} />
        <ToolButton tool="select" icon={<MousePointer2 />} keyHint="V" />
      </div>
      <Tip>{S.routes.tip}</Tip>
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">{S.routes.regions}</span>
        {regions.length ? (
          <div className="flex flex-col gap-1" data-testid="region-list">
            {regions.map((r) => (
              <button
                key={r.id}
                type="button"
                aria-pressed={sel?.id === r.id}
                onClick={() => {
                  if (useEditor.getState().audience === 'player') {
                    act.notify(S.msg.playerLocked, 'warning');
                    return;
                  }
                  editor.cancelDraft();
                  setEditor({ sel: { kind: 'region', id: r.id }, tool: 'select' });
                }}
                className={cn(
                  'flex min-w-0 items-center gap-2 rounded-md border px-2 py-1 text-left text-sm',
                  sel?.id === r.id
                    ? 'border-accent bg-accent-soft'
                    : 'border-border bg-surface hover:bg-surface-2',
                )}
              >
                <i
                  className="size-3 shrink-0 rounded-full"
                  style={{ background: r.color }}
                  aria-hidden
                />
                <span className="min-w-0 truncate">{r.name || S.routes.unnamed}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="m-0 text-xs text-muted">{S.routes.regionsEmpty}</p>
        )}
        <p className="m-0 text-xs text-muted">{S.routes.regionsHint}</p>
      </div>
    </div>
  );
}

/* ---------- 配置 ---------- */

function AssetsTab() {
  const theme = useDoc((s) => s.data.theme);
  const category = usePrefs((s) => s.data.category);
  const query = useEditor((s) => s.query);
  const tool = useEditor((s) => s.tool);
  const armed = useEditor((s) => s.asset);
  const list = searchAssets(query, category);
  return (
    <div className="flex flex-col gap-3">
      <TextInput
        type="search"
        value={query}
        placeholder={S.assets.searchPlaceholder}
        aria-label={S.assets.search}
        onChange={(e) => setEditor({ query: e.target.value })}
      />
      <Chips
        size="sm"
        aria-label={S.assets.categories.all}
        value={category}
        onPick={(v) => usePrefs.getState().patch({ category: v as typeof category })}
        items={(['all', ...ASSET_CATEGORIES] as const).map((c) => ({
          value: c,
          label: S.assets.categories[c],
        }))}
      />
      {list.length ? (
        <div
          className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-3"
          data-testid="asset-grid"
        >
          {list.map((a) => {
            const active = tool === 'asset' && armed === a.kind;
            return (
              <button
                key={a.kind}
                type="button"
                aria-pressed={active}
                data-asset={a.kind}
                onClick={() => act.armAsset(a.kind)}
                className={cn(
                  'flex min-w-0 flex-col items-center gap-0.5 rounded-md border p-1 text-[11px] leading-tight focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none',
                  active
                    ? 'border-accent bg-accent-soft'
                    : 'border-border bg-surface hover:bg-surface-2',
                )}
              >
                <img
                  src={assetIconUrl(a.kind, theme)}
                  alt=""
                  className="h-10 w-10 object-contain"
                />
                <span className="w-full truncate text-center">{a.name}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="m-0 text-xs text-muted">{S.assets.empty}</p>
      )}
      <ToolButton tool="note" icon={<Type />} keyHint="T" />
      <p className="m-0 text-xs text-muted">{S.assets.hint}</p>
    </div>
  );
}

/* ---------- 完成 ---------- */

function setSetting<K extends keyof MapSettings>(k: K, v: MapSettings[K]) {
  useDoc.getState().update((d) => {
    d.settings[k] = v;
  });
}

function ThemeCards() {
  const doc = useDoc((s) => s.data);
  const terrainKey = `${doc.terrain.length}:${hashStr(doc.terrain)}:${hashStr(doc.ground)}:${doc.drawMode}:${doc.seed}`;
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
      <legend className="mb-1.5 p-0 text-sm font-medium">{S.finish.theme}</legend>
      {THEME_IDS.map((t) => {
        const active = doc.theme === t;
        const preview = {
          ...doc,
          theme: t,
          regions: [],
          objects: [],
          paths: [],
          notes: [],
          settings: { ...doc.settings, frame: false, grid: false },
        };
        return (
          <button
            key={t}
            type="button"
            aria-pressed={active}
            data-theme-id={t}
            onClick={() =>
              useDoc.getState().update((d) => {
                d.theme = t;
              })
            }
            className={cn(
              'flex min-w-0 items-center gap-2 rounded-md border p-1.5 text-left focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none',
              active
                ? 'border-accent bg-accent-soft'
                : 'border-border bg-surface hover:bg-surface-2',
            )}
          >
            <img
              src={docThumbUrl(preview, 160, `theme:${t}:${terrainKey}`)}
              alt=""
              className="aspect-[1536/960] w-24 shrink-0 rounded-sm bg-surface-2 object-contain"
            />
            <span className="flex min-w-0 flex-col">
              <b className="text-sm">{S.finish.themes[t].name}</b>
              <small className="text-xs text-muted">{S.finish.themes[t].desc}</small>
            </span>
          </button>
        );
      })}
    </fieldset>
  );
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function FinishTab() {
  const st = useDoc((s) => s.data.settings);
  return (
    <div className="flex flex-col gap-3">
      <ThemeCards />
      <Field label={S.finish.font}>
        <Segmented
          size="sm"
          fullWidth
          value={st.font}
          onValueChange={(v) => setSetting('font', v)}
          options={FONT_STYLES.map((f) => ({ value: f, label: S.finish.fonts[f] }))}
        />
      </Field>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{S.finish.show}</span>
        {(['frame', 'names', 'details', 'borders', 'grid'] as const).map((k) => (
          <Field key={k} label={S.finish[k]} layout="inline">
            <Toggle checked={st[k]} onCheckedChange={(v) => setSetting(k, v)} />
          </Field>
        ))}
        <Segmented
          size="sm"
          fullWidth
          value={st.gridType}
          onValueChange={(v) =>
            useDoc.getState().update((d) => {
              d.settings.gridType = v;
              d.settings.grid = true;
            })
          }
          options={[
            { value: 'square', label: S.finish.gridSquare },
            { value: 'hex', label: S.finish.gridHex },
          ]}
        />
        <p className="m-0 text-xs text-muted">{S.finish.gridHint}</p>
      </div>
      <Field label={S.finish.subtitle}>
        <TextInput
          value={st.subtitle}
          maxLength={60}
          onFocus={g.begin}
          onBlur={g.commit}
          onChange={(e) =>
            useDoc.getState().update((d) => {
              d.settings.subtitle = e.target.value;
            })
          }
        />
      </Field>
      <Field label={S.finish.scale} hint={S.finish.scaleHint}>
        <NumberInput
          value={st.kmPer100}
          min={RANGES.kmPer100.min}
          max={RANGES.kmPer100.max}
          step={1}
          precision={2}
          unit="km"
          onChange={(v) => setSetting('kmPer100', act.clampKm(v))}
        />
      </Field>
      <p className="m-0 text-xs text-muted">{S.finish.exportTip}</p>
      <Button
        variant="primary"
        onClick={() => setEditor({ exportOpen: true })}
        data-testid="export-side"
      >
        {S.bar.export}
      </Button>
    </div>
  );
}

export function LeftPanel() {
  const tab = usePrefs((s) => s.data.tab);
  return (
    <div className="flex min-h-0 min-w-0 flex-col rounded-md border border-border bg-surface p-2 lg:overflow-y-auto">
      <Tabs
        value={tab}
        onValueChange={(v) => {
          if (editor.draftPoints.length) {
            editor.cancelDraft();
            act.notify(S.msg.draftCancelled, 'info', { duration: 2000 });
          }
          usePrefs.getState().patch({ tab: v });
          const tool = useEditor.getState().tool;
          if (v === 'finish') act.setTool('select');
          else if (tool !== 'select' && tool !== 'hand')
            act.setTool(v === 'land' ? 'brush' : 'select');
        }}
        items={[
          { value: 'land', label: S.tabs.land, icon: <MountainSnow />, content: <LandTab /> },
          { value: 'routes', label: S.tabs.routes, icon: <Route />, content: <RoutesTab /> },
          { value: 'assets', label: S.tabs.assets, icon: <Pentagon />, content: <AssetsTab /> },
          { value: 'finish', label: S.tabs.finish, icon: <Sparkles />, content: <FinishTab /> },
        ]}
      />
    </div>
  );
}
