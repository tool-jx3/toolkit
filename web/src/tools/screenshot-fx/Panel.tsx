/**
 * 設定欄（規格 1.1～1.5）：三個分頁——圖片（截圖、畫面、背景、截圖的擺放、出處）、
 * 演出框（新畫的框的預設、框的清單與每個框的設定）、時間軸（四段秒數、依序／同時、APNG 的影格率）。
 */
import { Clapperboard, Highlighter, SquareDashed, ZoomIn } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  Button,
  Field,
  FxDocSlider,
  FxRangeSlider,
  fxFrameName,
  ImageFxCanvasSection,
  ImageFxCreditSection,
  ImageFxFramesSection,
  ImageFxImageSection,
  ImageFxShotSection,
  ImageFxTimingSection,
  ImageFxZoomControls,
  Section,
  Segmented,
  Select,
  Tabs,
} from '@/ui';
import {
  CAMERA_FOCUSES,
  CAMERA_MODES,
  type CameraFocus,
  type CameraMode,
  cameraTarget,
  DIRS,
  type Dir,
  EDGE_FXS,
  type EdgeFx,
  type Frame,
  type FrameDefaults,
  type FrameKind,
  type FxState,
  isCameraCandidate,
  isHighlight,
  kindIndex,
  MARKER_STYLES,
  type MarkerFrame,
  type MarkerStyle,
  RANGES,
  type RangeKey,
  REDACT_MODES,
  REDACT_STYLES,
  type RedactFrame,
  type RedactMode,
  type RedactStyle,
  timelineOf,
  ZOOM_STYLES,
  type ZoomFrame,
} from './model';
import { KIT } from './render';
import {
  docNow,
  edit,
  fx,
  gesture,
  type PanelTab,
  requestSeek,
  setDefaults,
  startCameraPreview,
  updateFrame,
  useDoc,
  useLive,
  usePrefs,
} from './store';
import { S } from './strings';

const KIND_ICON: Record<FrameKind, ReactNode> = {
  zoom: <ZoomIn />,
  marker: <Highlighter />,
  redact: <SquareDashed />,
};

type Setter<T> = (patch: Partial<T>, live?: boolean) => void;

function RangeSlider({
  k,
  value,
  onChange,
  onCommit,
  unit,
}: {
  k: RangeKey;
  value: number;
  onChange: (v: number) => void;
  onCommit: () => void;
  unit?: string;
}) {
  return (
    <FxRangeSlider
      range={RANGES[k]}
      value={value}
      onChange={onChange}
      onCommit={onCommit}
      unit={unit}
    />
  );
}

type MarkerProps = FrameDefaults['marker'];
function MarkerControls({ v, set }: { v: MarkerProps; set: Setter<MarkerProps> }) {
  return (
    <>
      <Field
        label={S.markerStyle}
        hint={isHighlight(v.style) ? S.markerStyleHints.highlight : S.markerStyleHints[v.style]}
      >
        <Select<MarkerStyle>
          value={v.style}
          onValueChange={(style) => set({ style })}
          options={[
            {
              label: S.markerGroups.highlight,
              options: MARKER_STYLES.filter(isHighlight).map((m) => ({
                value: m,
                label: S.markerStyles[m],
              })),
            },
            {
              label: S.markerGroups.pen,
              options: MARKER_STYLES.filter((m) => !isHighlight(m)).map((m) => ({
                value: m,
                label: S.markerStyles[m],
              })),
            },
          ]}
        />
      </Field>
      <Field label={S.dir} hint={S.dirHint}>
        <Segmented<Dir>
          value={v.dir}
          onValueChange={(dir) => set({ dir })}
          options={DIRS.map((d) => ({ value: d, label: S.dirs[d] }))}
          fullWidth
        />
      </Field>
    </>
  );
}

type RedactProps = FrameDefaults['redact'];
function RedactControls({
  v,
  set,
  commit,
}: {
  v: RedactProps;
  set: Setter<RedactProps>;
  commit: () => void;
}) {
  return (
    <>
      <Field label={S.redactStyle}>
        <Segmented<RedactStyle>
          value={v.style}
          onValueChange={(style) => set({ style })}
          options={REDACT_STYLES.map((r) => ({ value: r, label: S.redactStyles[r] }))}
          fullWidth
        />
      </Field>
      <Field label={S.redactMode} hint={S.redactModeHints[v.mode]}>
        <Select<RedactMode>
          value={v.mode}
          onValueChange={(mode) => set({ mode })}
          options={REDACT_MODES.map((m) => ({ value: m, label: S.redactModes[m] }))}
        />
      </Field>
      <Field label={S.dir} hint={S.dirHint} hidden={v.mode === 'static'}>
        <Segmented<Dir>
          value={v.dir}
          onValueChange={(dir) => set({ dir })}
          options={DIRS.map((d) => ({ value: d, label: S.dirs[d] }))}
          fullWidth
        />
      </Field>
      {v.style === 'mosaic' ? (
        <Field label={S.grain} hint={S.grainHint}>
          <RangeSlider
            k="grain"
            value={v.grain}
            unit=" px"
            onChange={(grain) => set({ grain }, true)}
            onCommit={commit}
          />
        </Field>
      ) : (
        <Field label={S.density} hint={S.densityHint}>
          <RangeSlider
            k="density"
            value={v.density}
            unit="%"
            onChange={(density) => set({ density }, true)}
            onCommit={commit}
          />
        </Field>
      )}
      <Field label={S.edge} hint={S.edgeHint} hidden={v.mode === 'static'}>
        <Segmented<EdgeFx>
          value={v.edge}
          onValueChange={(edge) => set({ edge })}
          options={EDGE_FXS.map((e) => ({ value: e, label: S.edges[e] }))}
          fullWidth
        />
      </Field>
      <Field label={S.glow} hidden={v.mode === 'static' || v.edge === 'none'}>
        <RangeSlider
          k="glow"
          value={v.glow}
          unit="%"
          onChange={(glow) => set({ glow }, true)}
          onCommit={commit}
        />
      </Field>
    </>
  );
}

/* ---------- 演出框 ---------- */

function DefaultsSection() {
  const tool = usePrefs((p) => p.data.tool);
  const d = usePrefs((p) => p.data.defaults);
  const noop = () => undefined;
  return (
    <Section
      title={S.sectionDefaults}
      persistKey="screenshot-fx:defaults"
      description={S.defaultsHint(S.kinds[tool])}
    >
      <div className="flex flex-col gap-3" data-testid="defaults" data-kind={tool}>
        {tool === 'zoom' ? (
          <ImageFxZoomControls
            v={d.zoom}
            set={(p) => setDefaults((x) => void Object.assign(x.zoom, p))}
            commit={noop}
            styles={ZOOM_STYLES}
            text={S}
          />
        ) : tool === 'marker' ? (
          <MarkerControls
            v={d.marker}
            set={(p) => setDefaults((x) => void Object.assign(x.marker, p))}
          />
        ) : (
          <RedactControls
            v={d.redact}
            set={(p) => setDefaults((x) => void Object.assign(x.redact, p))}
            commit={noop}
          />
        )}
      </div>
    </Section>
  );
}

/** 一個框的設定（一步復原；滑桿放開才記） */
function FrameEditor({ frame }: { frame: Frame }) {
  const set = <T,>(patch: Partial<T>, live?: boolean) => {
    const apply = () => updateFrame(frame.id, (f) => void Object.assign(f, patch));
    if (live) gesture.live(apply)();
    else apply();
    /* 邊界演出：預覽跳到這個框動作到一半的樣子（同原作） */
    if ('edge' in patch || 'glow' in patch) {
      const w = timelineOf(docNow()).windows[frame.id];
      if (w) requestSeek((w.start + w.end) / 2);
    }
  };
  return (
    <div
      className="flex flex-col gap-3 border-t border-border px-3 pt-3 pb-1"
      data-testid="frame-editor"
    >
      {frame.kind === 'zoom' ? (
        <ImageFxZoomControls
          v={frame}
          set={set}
          commit={gesture.commit}
          styles={ZOOM_STYLES}
          text={S}
        />
      ) : frame.kind === 'marker' ? (
        <MarkerControls v={frame} set={set} />
      ) : (
        <RedactControls v={frame} set={set} commit={gesture.commit} />
      )}
    </div>
  );
}

function frameSummary(f: Frame): string {
  if (f.kind === 'zoom') {
    const z = f as ZoomFrame;
    return `×${z.scale.toFixed(2)}・${S.zoomStyles[z.style]}`;
  }
  if (f.kind === 'marker') {
    const m = f as MarkerFrame;
    return `${S.markerNames[m.style]}・${S.dirs[m.dir]}`;
  }
  const r = f as RedactFrame;
  return r.mode === 'static'
    ? `${S.redactStyles[r.style]}・${S.redactModes[r.mode]}`
    : `${S.redactStyles[r.style]}・${S.redactModes[r.mode]}・${S.dirs[r.dir]}`;
}

function FramesSection() {
  return (
    <ImageFxFramesSection<Frame>
      fx={fx}
      text={S}
      frameName={(f, frames) => fxFrameName(S.kinds, f, frames)}
      icon={(f) => KIND_ICON[f.kind]}
      summary={frameSummary}
      editor={(f) => <FrameEditor frame={f} />}
      notes={[S.followNote, S.orderNote, S.privacyNote]}
    />
  );
}

/** 運鏡（第二批）：鏡頭的動作、對象、一開始看的位置、倍率、拉回的時間、從頭確認 */
function CameraSection() {
  const doc = useDoc((s) => s.data);
  const cam = doc.camera;
  const cands = doc.frames.filter(isCameraCandidate);
  const target = cameraTarget(doc.frames, cam);
  const tl = timelineOf(doc);
  const on = cam.mode === 'pullback';
  const status = !on
    ? S.cameraOff
    : !target || !tl.camera
      ? S.cameraNone
      : S.cameraStatus(
          S.frameName(target.kind, kindIndex(doc.frames, target.id)),
          tl.camera.start,
          tl.camera.end - tl.camera.start,
        );
  const setCam = (recipe: (c: FxState['camera']) => void) =>
    edit((d) => {
      recipe(d.camera);
    });
  return (
    <Section title={S.sectionCamera} persistKey="screenshot-fx:camera">
      <Field label={S.cameraMode} hint={S.cameraModeHint}>
        <Select<CameraMode>
          value={cam.mode}
          onValueChange={(v) =>
            setCam((c) => {
              c.mode = v;
            })
          }
          options={CAMERA_MODES.map((m) => ({ value: m, label: S.cameraModes[m] }))}
        />
      </Field>
      <div className="flex flex-col gap-3" data-testid="camera-controls" hidden={!on}>
        <Field label={S.cameraTarget} hint={S.cameraTargetHint}>
          <Select
            value={cands.some((f) => f.id === cam.target) ? cam.target : 'auto'}
            onValueChange={(v) =>
              setCam((c) => {
                c.target = v;
              })
            }
            options={[
              { value: 'auto', label: S.cameraAuto },
              ...cands.map((f) => ({
                value: f.id,
                label: `${doc.frames.indexOf(f) + 1}. ${S.frameName(f.kind, kindIndex(doc.frames, f.id))}`,
              })),
            ]}
          />
        </Field>
        <Field label={S.cameraFocus} hint={S.cameraFocusHint}>
          <Segmented<CameraFocus>
            value={cam.focus}
            onValueChange={(v) =>
              setCam((c) => {
                c.focus = v;
              })
            }
            options={CAMERA_FOCUSES.map((f) => ({ value: f, label: S.cameraFocuses[f] }))}
            fullWidth
          />
        </Field>
        <Field label={S.cameraZoom}>
          <FxDocSlider<FxState>
            fx={fx}
            k="camZoom"
            value={cam.zoom}
            unit=" 倍"
            set={(d, v) => {
              d.camera.zoom = v;
            }}
          />
        </Field>
        <Field label={S.cameraDuration}>
          <FxDocSlider<FxState>
            fx={fx}
            k="camDuration"
            value={cam.duration}
            unit=" 秒"
            set={(d, v) => {
              d.camera.duration = v;
            }}
          />
        </Field>
        <Button icon={<Clapperboard />} disabled={!tl.camera} onClick={startCameraPreview}>
          {S.cameraPreview}
        </Button>
        <p className="m-0 text-xs text-muted">{S.cameraNote}</p>
      </div>
      <p className="m-0 text-sm" role="status" data-testid="camera-status">
        {status}
      </p>
      <p className="m-0 text-xs text-muted">{S.cameraOutputNote}</p>
    </Section>
  );
}

/* ---------- 設定欄 ---------- */

export function Settings({
  onFiles,
  onSample,
}: {
  onFiles: (files: File[]) => void;
  onSample: (demo: boolean) => void;
}) {
  const tab = useLive((l) => l.tab);
  return (
    <Tabs<PanelTab>
      aria-label={S.tabsLabel}
      value={tab}
      onValueChange={(v) => useLive.setState({ tab: v })}
      keepMounted
      items={[
        {
          value: 'image',
          label: S.tabs.image,
          content: (
            <div className="flex flex-col gap-3">
              <ImageFxImageSection fx={fx} text={S} onFiles={onFiles} onSample={onSample} />
              <ImageFxCanvasSection fx={fx} text={S} />
              <ImageFxShotSection fx={fx} text={S} />
              <ImageFxCreditSection fx={fx} text={S} />
            </div>
          ),
        },
        {
          value: 'frames',
          label: S.tabs.frames,
          content: (
            <div className="flex flex-col gap-3">
              <DefaultsSection />
              <FramesSection />
            </div>
          ),
        },
        {
          value: 'timing',
          label: S.tabs.timing,
          content: (
            <div className="flex flex-col gap-3">
              <ImageFxTimingSection fx={fx} kit={KIT} text={S} />
              <CameraSection />
            </div>
          ),
        },
      ]}
    />
  );
}
