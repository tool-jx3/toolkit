import { Download, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { encodePngAsync } from '@/core/encode';
import { downloadBytes } from '@/core/files';
import { createToolStore } from '@/core/storage';
import {
  Button,
  Field,
  Kbd,
  Notice,
  type NoticeTone,
  Section,
  Segmented,
  type Shortcut,
  Stage,
  Toggle,
  ToolShell,
  UsageSection,
} from '@/ui';
import { LayoutPanel } from './LayoutPanel';
import { hasRooms, parseSeedParam, randomSeed } from './layout';
import type { RenderedMap } from './mapRenderer';
import { mapFileName, TERRAIN_IDS, type TerrainId } from './render';
import { DEFAULT_SETTINGS, type LayoutSettings, maxCellsFor, normalizeSettings } from './settings';
import { S } from './strings';
import { useRenderedMap } from './useRenderedMap';

const TERRAIN_OPTIONS = TERRAIN_IDS.map((id) => ({ value: id, label: S.terrains[id] }));

/**
 * 格局設定（生成法、參數、尺寸、每格 px）記在 localStorage `trpg-toolkit:battlemap`（版本 1）；
 * 地形、格線、火光、種子不記（規格 F26）。讀出來的值一律經過 normalizeSettings。
 */
const useLayoutSettings = createToolStore<LayoutSettings>('battlemap', DEFAULT_SETTINGS, {
  version: 1,
});

interface MapState {
  terrain: TerrainId;
  seed: number;
}

/** 開頁的地圖：預設石砌地城；網址有 ?seed=<整數> 時用那個種子（只供測試，介面上沒有入口） */
function initialMap(): MapState {
  const fixed = typeof location !== 'undefined' ? parseSeedParam(location.search) : null;
  return { terrain: 'dungeon', seed: fixed ?? randomSeed() };
}

function Usage() {
  return (
    <ul>
      {S.usage.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

function MapInfo({ map }: { map: RenderedMap | null }) {
  const r = map?.request;
  return (
    <dl
      aria-label={S.infoLabel}
      data-testid="map-info"
      className="m-0 flex min-w-64 flex-1 flex-wrap gap-x-4 gap-y-1 text-sm [&>div]:flex [&>div]:gap-1.5 [&>div]:whitespace-nowrap"
    >
      <div>
        <dt className="text-muted">{S.infoSeed}</dt>
        <dd className="m-0 font-mono tabular-nums" data-testid="map-seed">
          {r ? r.seed : ''}
        </dd>
      </div>
      <div>
        <dt className="text-muted">{S.infoGenerator}</dt>
        <dd className="m-0" data-testid="map-generator">
          {r ? S.generators[r.settings.generator] : ''}
        </dd>
      </div>
      <div>
        <dt className="text-muted">{S.infoRooms}</dt>
        <dd className="m-0 tabular-nums" data-testid="map-rooms">
          {map && r
            ? hasRooms(r.settings.generator)
              ? S.roomsUnit(map.layout.rooms.length)
              : S.noRooms
            : ''}
        </dd>
      </div>
      <div>
        <dt className="text-muted">{S.infoTerrain}</dt>
        <dd className="m-0" data-testid="map-terrain">
          {r ? S.terrains[r.terrain] : ''}
        </dd>
      </div>
      <div>
        <dt className="text-muted">{S.infoSize}</dt>
        <dd className="m-0 tabular-nums" data-testid="map-size">
          {r ? S.sizeCells(r.settings.cols, r.settings.rows) : ''}
        </dd>
      </div>
    </dl>
  );
}

export function App() {
  const [map, setMap] = useState<MapState>(initialMap);
  const [grid, setGrid] = useState(true);
  const [light, setLight] = useState(true);
  /** 狀態列：匯出的結果，或欄列數被夾小的通知（clamp：下一次改格局設定時清掉） */
  const [status, setStatus] = useState<{
    tone: NoticeTone;
    text: string;
    kind: 'export' | 'clamp';
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  /** 大地圖還在畫的時候按了匯出：畫好後自動匯出（D12） */
  const [exportQueued, setExportQueued] = useState(false);

  const stored = useLayoutSettings((st) => st.data);
  const settings = useMemo(() => normalizeSettings(stored), [stored]);
  const request = useMemo(
    () => ({ seed: map.seed, terrain: map.terrain, settings, grid, light }),
    [map, settings, grid, light],
  );
  const { map: shown, pending, error } = useRenderedMap(request);
  const width = shown?.width ?? settings.cols * settings.cellPx;
  const height = shown?.height ?? settings.rows * settings.cellPx;

  const canvas = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (ctx && shown)
      ctx.putImageData(new ImageData(shown.pixels, shown.width, shown.height), 0, 0);
  }, [shown]);

  const regenerate = useCallback((terrain?: TerrainId) => {
    setMap((m) => ({ terrain: terrain ?? m.terrain, seed: randomSeed() }));
  }, []);

  const changeSettings = useCallback(
    (patch: Partial<LayoutSettings>) => {
      const next = normalizeSettings({ ...settings, ...patch });
      useLayoutSettings.getState().replace(next);
      /* 換成較大的每格 px 時，超過每邊 4096 px 的欄列數會被夾小；上一次夾小的通知在下一次改設定時清掉 */
      if (patch.cellPx !== undefined && (next.cols < settings.cols || next.rows < settings.rows)) {
        setStatus({
          kind: 'clamp',
          tone: 'info',
          text: S.clamped(next.cellPx, maxCellsFor(next.cellPx), next.cols, next.rows),
        });
      } else setStatus((st) => (st?.kind === 'clamp' ? null : st));
    },
    [settings],
  );

  const latest = useRef({ shown, pending });
  latest.current = { shown, pending };
  const exportPng = useCallback(async () => {
    const { shown: m, pending: waiting } = latest.current;
    if (busyRef.current) return;
    if (waiting || !m) {
      /* 大地圖還在畫：畫好後自動匯出畫好的那一張 */
      setExportQueued(true);
      setStatus({ kind: 'export', tone: 'progress', text: S.exportQueued });
      return;
    }
    busyRef.current = true;
    setBusy(true);
    const r = m.request;
    const name = mapFileName(r.terrain, r.seed, r.settings);
    setStatus({ kind: 'export', tone: 'progress', text: S.exporting });
    try {
      /* 傳複本進 Worker（原本的像素還要給畫面用） */
      const bytes = await encodePngAsync(m.pixels.slice(), m.width, m.height);
      downloadBytes(bytes, name, 'image/png');
      setStatus({ kind: 'export', tone: 'success', text: S.exported(name) });
    } catch (e) {
      setStatus({
        kind: 'export',
        tone: 'danger',
        text: S.exportFailed(e instanceof Error ? e.message : String(e)),
      });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  /* 等著匯出的：地圖畫好就匯出；畫不出來就取消 */
  useEffect(() => {
    if (!exportQueued || pending) return;
    setExportQueued(false);
    if (error || !shown) {
      setStatus({ kind: 'export', tone: 'danger', text: S.exportCanceled });
      return;
    }
    void exportPng();
  }, [exportQueued, pending, error, shown, exportPng]);

  const shortcuts = useMemo<Shortcut[]>(
    () => [
      {
        keys: ['g', 'shift+g'],
        label: S.regenerate,
        group: S.shortcutGroup,
        handler: () => regenerate(),
      },
      {
        keys: ['d', 'shift+d'],
        label: S.exportPng,
        group: S.shortcutGroup,
        handler: () => void exportPng(),
      },
    ],
    [regenerate, exportPng],
  );

  const sizeSource = shown?.request.settings ?? settings;
  return (
    <ToolShell
      toolId="battlemap"
      shortcuts={shortcuts}
      usage={<Usage />}
      settings={
        <>
          <UsageSection>
            <Usage />
          </UsageSection>
          <Section title={S.sectionMap} fixed>
            <Field label={S.terrain} hint={S.terrainHint}>
              <Segmented
                fullWidth
                value={map.terrain}
                onValueChange={(t) => regenerate(t)}
                onReselect={(t) => regenerate(t)}
                options={TERRAIN_OPTIONS}
              />
            </Field>
            <Field label={S.grid} hint={S.gridHint(settings.cellPx)} layout="inline">
              <Toggle checked={grid} onCheckedChange={setGrid} />
            </Field>
            <Field label={S.light} hint={S.lightHint} layout="inline">
              <Toggle checked={light} onCheckedChange={setLight} />
            </Field>
          </Section>
          <LayoutPanel
            settings={settings}
            onChange={changeSettings}
            onReset={() => useLayoutSettings.getState().replace(DEFAULT_SETTINGS)}
          />
        </>
      }
      preview={
        <>
          <Stage width={width} height={height} toolbar={false} aria-label={S.previewLabel}>
            <canvas
              ref={canvas}
              width={width}
              height={height}
              className="block size-full"
              data-testid="battlemap-canvas"
              data-pending={pending ? 'true' : undefined}
              aria-busy={pending || undefined}
            />
          </Stage>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-surface px-3 py-2">
            <MapInfo map={shown} />
            <div className="flex flex-wrap gap-2">
              <Button icon={<RefreshCw />} aria-keyshortcuts="G" onClick={() => regenerate()}>
                {S.regenerate}
                <span aria-hidden className="hidden lg:inline-flex">
                  <Kbd>G</Kbd>
                </span>
              </Button>
              <Button
                variant="primary"
                icon={<Download />}
                loading={busy || exportQueued}
                disabled={!shown && !pending}
                aria-keyshortcuts="D"
                onClick={() => void exportPng()}
              >
                {S.exportPng}
                <span aria-hidden className="hidden lg:inline-flex">
                  <Kbd>D</Kbd>
                </span>
              </Button>
            </div>
          </div>
          <p className="m-0 text-xs text-muted" data-testid="map-size-note">
            {S.sizeNote(
              sizeSource.cols * sizeSource.cellPx,
              sizeSource.rows * sizeSource.cellPx,
              sizeSource.cols,
              sizeSource.rows,
              sizeSource.cellPx,
            )}
          </p>
          {pending ? (
            <div data-testid="map-pending">
              <Notice tone="progress">{S.rendering(settings.cols, settings.rows)}</Notice>
            </div>
          ) : null}
          {error ? <Notice tone="danger">{S.renderFailed(error)}</Notice> : null}
          {status ? <Notice tone={status.tone}>{status.text}</Notice> : null}
        </>
      }
    />
  );
}
