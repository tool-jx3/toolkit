import { Download, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { encodePngAsync } from '@/core/encode';
import { downloadBytes } from '@/core/files';
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
import { generateLayout, MAP_HEIGHT, MAP_WIDTH, parseSeedParam, randomSeed } from './layout';
import { applyOverlays, mapFileName, renderBase, TERRAIN_IDS, type TerrainId } from './render';
import { S } from './strings';

const TERRAIN_OPTIONS = TERRAIN_IDS.map((id) => ({ value: id, label: S.terrains[id] }));

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

export function App() {
  const [map, setMap] = useState<MapState>(initialMap);
  const [grid, setGrid] = useState(true);
  const [light, setLight] = useState(true);
  const [status, setStatus] = useState<{ tone: NoticeTone; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const layout = useMemo(() => generateLayout(map.seed), [map.seed]);
  /* 底圖只看種子與地形；格線、火光疊在複本上，切換時底圖不重畫 */
  const base = useMemo(() => renderBase(layout, map.terrain), [layout, map.terrain]);
  const pixels = useMemo(
    () => applyOverlays(base, layout, { grid, light }),
    [base, layout, grid, light],
  );

  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (ctx) ctx.putImageData(new ImageData(pixels, MAP_WIDTH, MAP_HEIGHT), 0, 0);
  }, [pixels]);

  const regenerate = useCallback((terrain?: TerrainId) => {
    setMap((m) => ({ terrain: terrain ?? m.terrain, seed: randomSeed() }));
  }, []);

  const latest = useRef({ map, pixels });
  latest.current = { map, pixels };
  const exportPng = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const { map: m, pixels: px } = latest.current;
    const name = mapFileName(m.terrain, m.seed);
    setStatus({ tone: 'progress', text: S.exporting });
    try {
      /* 傳複本進 Worker（原本的像素還要給畫面用） */
      const bytes = await encodePngAsync(px.slice(), MAP_WIDTH, MAP_HEIGHT);
      downloadBytes(bytes, name, 'image/png');
      setStatus({ tone: 'success', text: S.exported(name) });
    } catch (e) {
      setStatus({
        tone: 'danger',
        text: S.exportFailed(e instanceof Error ? e.message : String(e)),
      });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

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
            <Field label={S.grid} hint={S.gridHint} layout="inline">
              <Toggle checked={grid} onCheckedChange={setGrid} />
            </Field>
            <Field label={S.light} hint={S.lightHint} layout="inline">
              <Toggle checked={light} onCheckedChange={setLight} />
            </Field>
          </Section>
        </>
      }
      preview={
        <>
          <Stage width={MAP_WIDTH} height={MAP_HEIGHT} toolbar={false} aria-label={S.previewLabel}>
            <canvas
              ref={canvas}
              width={MAP_WIDTH}
              height={MAP_HEIGHT}
              className="block size-full"
              data-testid="battlemap-canvas"
            />
          </Stage>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-surface px-3 py-2">
            <dl
              aria-label={S.infoLabel}
              data-testid="map-info"
              className="m-0 flex min-w-0 flex-1 flex-wrap gap-x-4 gap-y-1 text-sm"
            >
              <div className="flex gap-1.5">
                <dt className="text-muted">{S.infoSeed}</dt>
                <dd className="m-0 font-mono tabular-nums" data-testid="map-seed">
                  {map.seed}
                </dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-muted">{S.infoRooms}</dt>
                <dd className="m-0 tabular-nums" data-testid="map-rooms">
                  {S.roomsUnit(layout.rooms.length)}
                </dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-muted">{S.infoTerrain}</dt>
                <dd className="m-0" data-testid="map-terrain">
                  {S.terrains[map.terrain]}
                </dd>
              </div>
            </dl>
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
                loading={busy}
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
          <p className="m-0 text-xs text-muted">{S.sizeNote}</p>
          {status ? <Notice tone={status.tone}>{status.text}</Notice> : null}
        </>
      }
    />
  );
}
