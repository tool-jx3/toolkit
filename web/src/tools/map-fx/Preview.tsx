/**
 * 預覽欄（規格 1.3、1.7～1.9）：共用的圖片演出預覽欄（@/ui/imagefx 的 ImageFxPreview）＋地圖演出自己的畫框工具列
 * （區域放大、路線・地點、房間遮罩、編輯輔助線、點選建立路線）、點選路線的編輯層與匯出區（多了 X 用 MP4、房間遮罩 ZIP）。
 */
import { Check, CornerUpLeft, Spline, X as XIcon } from 'lucide-react';
import type { Ref } from 'react';
import { computeLayout, type ImageSource, type Placement } from '@/core/imagefx';
import { Button, type ExportPanelHandle, Field, NumberInput, Segmented, Toggle } from '@/ui';
import {
  type FxPlayerHandle,
  fxFrameName,
  ImageFxExportArea,
  type ImageFxExtraFormat,
  ImageFxPreview,
  useFxVideoMode,
} from '@/ui/imagefx';
import { exporter, exportRooms, exportXVideo, finalPng, roomsOf } from './exporter';
import {
  canFinishPoints,
  type Frame,
  type FrameKind,
  isPathStyle,
  type MapState,
  RANGES,
  X_FPS,
  xVideoSize,
} from './model';
import { KIND_ICON } from './Panel';
import { PointRouteLayer } from './PointRoute';
import { KIT } from './render';
import {
  APNG_COLORS,
  deletePoint,
  docNow,
  endPointMode,
  finishPointRoute,
  fx,
  setPrefs,
  startEditPoints,
  startPointRoute,
  undoDraftPoint,
  useDoc,
  useLive,
  usePoints,
  usePrefs,
} from './store';
import { S } from './strings';

export type PlayerHandle = FxPlayerHandle;

/** 輔助線的顏色（只在預覽） */
const GUIDE_COLOR: Record<FrameKind, string> = {
  zoom: '#38bdf8',
  route: '#facc15',
  redact: '#fb7185',
};

/* ---------- 工具列 ---------- */

function PointBar() {
  const draft = usePoints((p) => p.draft);
  const selected = useLive((l) => l.selected);
  const sel = useDoc((s) => s.data.frames.find((f) => f.id === selected));
  const hasImage = useDoc((s) => !!s.data.image);
  const editable = sel?.kind === 'route' && (sel.shape === 'points' || isPathStyle(sel.style));
  if (draft?.mode === 'create')
    return (
      <div
        role="toolbar"
        aria-label={S.pointBar}
        className="flex flex-col gap-1.5 rounded-md border border-accent bg-accent-soft p-2"
        data-testid="point-bar"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium tabular-nums" data-testid="point-count">
            {S.pointCount(draft.points.length)}
          </span>
          <Button
            size="sm"
            variant="primary"
            icon={<Check />}
            disabled={!canFinishPoints(draft.points)}
            onClick={() => finishPointRoute()}
          >
            {`${S.pointFinish}（Enter）`}
          </Button>
          <Button
            size="sm"
            icon={<CornerUpLeft />}
            disabled={!draft.points.length}
            onClick={undoDraftPoint}
          >
            {S.pointBack}
          </Button>
          <Button size="sm" variant="ghost" icon={<XIcon />} onClick={endPointMode}>
            {`${S.pointCancel}（Esc）`}
          </Button>
        </div>
        <p className="m-0 text-xs text-muted">{S.pointCreateHint}</p>
      </div>
    );
  if (draft?.mode === 'edit')
    return (
      <div
        role="toolbar"
        aria-label={S.pointBar}
        className="flex flex-col gap-1.5 rounded-md border border-accent bg-accent-soft p-2"
        data-testid="point-bar"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={draft.active === null}
            onClick={() => {
              const d = usePoints.getState().draft;
              if (d?.mode === 'edit' && d.active !== null) deletePoint(d.id, d.active);
            }}
          >
            {S.pointDelete}
          </Button>
          <Button size="sm" variant="primary" icon={<Check />} onClick={endPointMode}>
            {S.pointDone}
          </Button>
        </div>
        <p className="m-0 text-xs text-muted">{S.pointEditHint}</p>
      </div>
    );
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" icon={<Spline />} disabled={!hasImage} onClick={startPointRoute}>
        {S.pointStart}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={!editable}
        onClick={() => selected && startEditPoints(selected)}
      >
        {S.pointEdit}
      </Button>
    </div>
  );
}

function ToolBar() {
  const tool = usePrefs((p) => p.data.tool);
  const guides = usePrefs((p) => p.data.guides);
  const hasImage = useDoc((s) => !!s.data.image);
  const drafting = usePoints((p) => !!p.draft);
  return (
    <div className="flex flex-col gap-1.5" data-testid="tool-bar">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Segmented<FrameKind>
          aria-label={S.toolLabel}
          value={tool}
          onValueChange={(v) => setPrefs({ tool: v })}
          options={(['zoom', 'route', 'redact'] as const).map((k) => ({
            value: k,
            label: S.kinds[k],
            icon: KIND_ICON[k],
          }))}
          disabled={!hasImage || drafting}
        />
        <Toggle
          label={S.guides}
          checked={guides}
          onCheckedChange={(on) => setPrefs({ guides: on })}
        />
      </div>
      <p className="m-0 text-xs text-muted">
        {S.kindHints[tool]}。{tool === 'route' ? S.routeToolHint : S.toolHint}
      </p>
      {tool === 'route' || drafting ? <PointBar /> : null}
    </div>
  );
}

/** 輔助線上的點選路線：經過的點連成細線 */
function guideExtra(f: Frame, shot: Placement, k: number) {
  if (f.kind !== 'route' || f.shape !== 'points') return null;
  const pts = f.points.map((p) => `${shot.x + p.x * shot.f},${shot.y + p.y * shot.f}`).join(' ');
  return (
    <polyline
      points={pts}
      fill="none"
      stroke="#facc15"
      strokeOpacity={0.8}
      strokeWidth={1.4 * k}
      strokeDasharray={`${3 * k} ${3 * k}`}
    />
  );
}

/* ---------- 匯出 ---------- */

function ExportArea({
  s,
  image,
  exportRef,
}: {
  s: MapState;
  image: ImageSource | null;
  exportRef: Ref<ExportPanelHandle>;
}) {
  const settings = usePrefs((p) => p.data.export);
  const grid = usePrefs((p) => p.data.grid);
  const layout = computeLayout(s, image ? { width: image.width, height: image.height } : null);
  const xSize = xVideoSize(layout.canvas);
  const xMode = useFxVideoMode(xSize, X_FPS, false, ['avc1', 'vp09']);
  const rooms = roomsOf(s).length;
  const xReason = !image
    ? S.needImage
    : !xMode
      ? S.videoChecking
      : xMode.kind === 'none'
        ? S.videoUnsupported
        : undefined;
  const extra: ImageFxExtraFormat<MapState>[] = [
    {
      option: {
        id: 'xmp4',
        label: S.formats.xmp4,
        description: S.formatDesc.xmp4,
        animated: true,
        disabled: !!xReason,
        disabledReason: xReason,
      },
      fixedFps: X_FPS,
      fixedFpsHint: S.formatDesc.xmp4,
      size: xSize,
      run: (cur, img, _set, ctx) =>
        exportXVideo(cur, img, xMode ?? { kind: 'none', alpha: false }, ctx),
    },
    {
      option: {
        id: 'rooms',
        label: S.formats.rooms,
        description: S.roomsDesc(rooms, grid),
        disabled: !image || !rooms,
        disabledReason: !image ? S.needImage : !rooms ? S.roomsNone : undefined,
      },
      noEstimate: true,
      panel: (
        <Field label={S.gridLabel} hint={S.gridHint}>
          <NumberInput
            value={grid}
            min={RANGES.grid.min}
            max={RANGES.grid.max}
            step={RANGES.grid.step}
            unit="px"
            onChange={(v) => setPrefs({ grid: Math.round(v) })}
          />
        </Field>
      ),
      run: (cur, img, _set, ctx) => exportRooms(cur, img, grid, ctx),
    },
  ];
  return (
    <ImageFxExportArea<Frame, MapState>
      s={s}
      image={image}
      kit={KIT}
      exporter={exporter}
      settings={settings}
      onSettingsChange={(next) => setPrefs({ export: next })}
      exportRef={exportRef}
      text={S}
      colorOptions={APNG_COLORS}
      extra={extra}
      current={docNow}
    />
  );
}

/* ---------- 預覽欄 ---------- */

export function Preview({
  playerRef,
  exportRef,
  onSample,
}: {
  playerRef: Ref<PlayerHandle>;
  exportRef: Ref<ExportPanelHandle>;
  onSample: (demo: boolean) => void;
}) {
  const draft = usePoints((p) => p.draft);
  return (
    <ImageFxPreview<Frame, MapState>
      fx={fx}
      kit={KIT}
      text={S}
      playerRef={playerRef}
      onSample={onSample}
      toolbar={<ToolBar />}
      frameName={(f, frames) => fxFrameName(S.kinds, f, frames)}
      guideColor={(f) => GUIDE_COLOR[f.kind]}
      guideExtra={guideExtra}
      stageOverlay={
        draft
          ? ({ layout, image, viewport }) => (
              <PointRouteLayer layout={layout} image={image} viewport={viewport} draft={draft} />
            )
          : undefined
      }
      finalPng={finalPng}
      exportArea={({ s, image }) => <ExportArea s={s} image={image} exportRef={exportRef} />}
    />
  );
}
