/**
 * 設定欄（規格 1.1～1.7、1.11）：四個分頁——地圖（載入、畫面、背景、地圖的擺放、出處）、
 * 演出框（新畫的框的預設、框的清單與每個框的設定）、時間軸（四段秒數、依序／同時、APNG 的影格率）、
 * 進階 3D（WalkPanel.tsx）。
 * 共用的區塊在 @/ui/imagefx；這裡是地圖演出的三種框的設定。
 */
import { MapPinned, Spline, SquareDashed, ZoomIn } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button, Field, Section, Segmented, Select, Tabs, TextInput } from '@/ui';
import {
  FxRangeSlider,
  fxFrameName,
  ImageFxCanvasSection,
  ImageFxCreditSection,
  ImageFxFramesSection,
  ImageFxImageSection,
  ImageFxShotSection,
  ImageFxTimingSection,
  ImageFxZoomControls,
} from '@/ui/imagefx';
import {
  defaultCut,
  EDGE_FXS,
  type EdgeFx,
  type Frame,
  type FrameDefaults,
  type FrameKind,
  isPathStyle,
  MAP_LIMITS,
  MASK_CORNERS,
  type MaskCorner,
  PATH_STYLES,
  RANGES,
  type RangeKey,
  REDACT_MODES,
  REDACT_STYLES,
  REVEAL_FXS,
  type RedactFrame,
  type RedactMode,
  type RedactStyle,
  type RevealFx,
  ROUTE_SHAPES,
  ROUTE_STYLES,
  type RouteFrame,
  type RouteShape,
  type RouteStyle,
  timelineOf,
  ZOOM_STYLES,
  type ZoomFrame,
} from './model';
import { KIT } from './render';
import {
  docNow,
  fx,
  gesture,
  type PanelTab,
  requestSeek,
  setDefaults,
  startEditPoints,
  updateFrame,
  useLive,
  usePrefs,
} from './store';
import { S } from './strings';
import { WalkPanel } from './WalkPanel';

export const KIND_ICON: Record<FrameKind, ReactNode> = {
  zoom: <ZoomIn />,
  route: <Spline />,
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

/** 單行文字欄（標籤、房名）：打字中即時套用，離開才記一步 */
function LabelInput({
  value,
  placeholder,
  onBegin,
  onChange,
  onCommit,
}: {
  value: string;
  placeholder: string;
  onBegin: () => void;
  onChange: (v: string) => void;
  onCommit: () => void;
}) {
  return (
    <TextInput
      value={value}
      maxLength={MAP_LIMITS.label}
      placeholder={placeholder}
      onFocus={onBegin}
      onBlur={onCommit}
      onChange={(e) =>
        onChange(
          Array.from(e.target.value.replace(/\r?\n|\r/g, ' '))
            .slice(0, MAP_LIMITS.label)
            .join(''),
        )
      }
    />
  );
}

/* ---------- 路線・地點 ---------- */

type RouteProps = Pick<RouteFrame, 'style' | 'label'> & { shape: RouteShape | 'points' };

function RouteControls({
  v,
  set,
  begin,
  commit,
  points,
  onEditPoints,
}: {
  v: RouteProps;
  set: Setter<RouteProps>;
  begin: () => void;
  commit: () => void;
  /** 點選建立的路線：點的個數 */
  points?: number;
  onEditPoints?: () => void;
}) {
  const pointRoute = v.shape === 'points';
  const spotStyles = ROUTE_STYLES.filter((s) => !isPathStyle(s));
  return (
    <>
      <Field label={S.routeStyle} hint={S.routeStyleHints[v.style]}>
        <Select<RouteStyle>
          value={v.style}
          onValueChange={(style) => set({ style })}
          options={[
            {
              label: S.routeGroups.path,
              options: PATH_STYLES.map((s) => ({ value: s, label: S.routeStyles[s] })),
            },
            ...(pointRoute
              ? []
              : [
                  {
                    label: S.routeGroups.spot,
                    options: spotStyles.map((s) => ({ value: s, label: S.routeStyles[s] })),
                  },
                ]),
          ]}
        />
      </Field>
      {pointRoute ? (
        <Field label={S.routeShape} hint={S.pointShapeHint(points ?? 0)}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm">{S.pointShape}</span>
            {onEditPoints ? (
              <Button size="sm" icon={<Spline />} onClick={onEditPoints}>
                {S.pointEditThis}
              </Button>
            ) : null}
          </div>
        </Field>
      ) : (
        <Field label={S.routeShape} hint={S.routeShapeHint} hidden={!isPathStyle(v.style)}>
          <Select<RouteShape>
            value={v.shape as RouteShape}
            onValueChange={(shape) => set({ shape })}
            options={ROUTE_SHAPES.map((s) => ({ value: s, label: S.routeShapes[s] }))}
          />
        </Field>
      )}
      {!pointRoute && isPathStyle(v.style) && onEditPoints ? (
        <Button size="sm" variant="ghost" icon={<Spline />} onClick={onEditPoints}>
          {S.pointEditThis}
        </Button>
      ) : null}
      <Field label={S.routeLabel} hint={S.routeLabelHint}>
        <LabelInput
          value={v.label}
          placeholder={S.routeLabelPlaceholder}
          onBegin={begin}
          onChange={(label) => set({ label }, true)}
          onCommit={commit}
        />
      </Field>
    </>
  );
}

/* ---------- 房間遮罩 ---------- */

type RedactProps = FrameDefaults['redact'];
function RedactControls({
  v,
  set,
  begin,
  commit,
}: {
  v: RedactProps;
  set: Setter<RedactProps>;
  begin: () => void;
  commit: () => void;
}) {
  const scan = v.mode !== 'static' && v.dir !== 'fade';
  return (
    <>
      <Field label={S.redactStyle} hint={S.redactStyleHints[v.style]}>
        <Select<RedactStyle>
          value={v.style}
          onValueChange={(style) => set({ style })}
          options={REDACT_STYLES.map((r) => ({ value: r, label: S.redactStyles[r] }))}
        />
      </Field>
      <Field label={S.redactMode} hint={S.redactModeHints[v.mode]}>
        <Select<RedactMode>
          value={v.mode}
          onValueChange={(mode) => set({ mode })}
          options={REDACT_MODES.map((m) => ({ value: m, label: S.redactModes[m] }))}
        />
      </Field>
      <Field label={S.revealFx} hint={S.revealFxHint} hidden={v.mode === 'static'}>
        <Select<RevealFx>
          value={v.dir}
          onValueChange={(dir) => set({ dir })}
          options={REVEAL_FXS.map((d) => ({ value: d, label: S.revealFxs[d] }))}
        />
      </Field>
      <Field label={S.roomName} hint={S.roomNameHint}>
        <LabelInput
          value={v.label}
          placeholder={S.roomNamePlaceholder}
          onBegin={begin}
          onChange={(label) => set({ label }, true)}
          onCommit={commit}
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
      <Field label={S.edge} hint={S.edgeHint} hidden={!scan}>
        <Segmented<EdgeFx>
          value={v.edge}
          onValueChange={(edge) => set({ edge })}
          options={EDGE_FXS.map((e) => ({ value: e, label: S.edges[e] }))}
          fullWidth
        />
      </Field>
      <Field label={S.glow} hidden={!scan || v.edge === 'none'}>
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

/**
 * 房間遮罩的形狀（2026-10-29，F86）：長方形／L 形（缺哪個角）、缺角的寬與深（外框的 %）。
 * 只在框的設定裡（新畫的框一律是長方形）；平面圖產生器送來的 L 形房間是 L 形。
 */
type MaskShape = 'rect' | MaskCorner;
function MaskShapeControls({ frame, commit }: { frame: RedactFrame; commit: () => void }) {
  const cut = frame.cut;
  const setShape = (v: MaskShape) =>
    updateFrame(frame.id, (f) => {
      if (f.kind !== 'redact') return;
      if (v === 'rect') delete f.cut;
      else f.cut = f.cut ? { ...f.cut, c: v } : defaultCut(v);
    });
  /* 缺角的比例 → 滑桿的 %（5～95） */
  const pct = (ratio: number) =>
    Math.min(RANGES.cut.max, Math.max(RANGES.cut.min, Math.round(ratio * 100)));
  const setSize = (key: 'w' | 'h', v: number) =>
    gesture.live(() =>
      updateFrame(frame.id, (f) => {
        if (f.kind !== 'redact' || !f.cut) return;
        f.cut = { ...f.cut, [key]: pct(v / 100) / 100 };
      }),
    )();
  return (
    <>
      <Field label={S.maskShape} hint={S.maskShapeHint}>
        <Select<MaskShape>
          value={cut ? cut.c : 'rect'}
          onValueChange={setShape}
          options={[
            { value: 'rect', label: S.maskShapes.rect },
            ...MASK_CORNERS.map((c) => ({ value: c, label: S.maskShapes[c] })),
          ]}
        />
      </Field>
      {cut ? (
        <>
          <Field label={S.maskCutW}>
            <FxRangeSlider
              range={RANGES.cut}
              value={pct(cut.w)}
              onChange={(v) => setSize('w', v)}
              onCommit={commit}
              unit="%"
            />
          </Field>
          <Field label={S.maskCutH}>
            <FxRangeSlider
              range={RANGES.cut}
              value={pct(cut.h)}
              onChange={(v) => setSize('h', v)}
              onCommit={commit}
              unit="%"
            />
          </Field>
        </>
      ) : null}
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
      persistKey="map-fx:defaults"
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
        ) : tool === 'route' ? (
          <RouteControls
            v={d.route}
            set={(p) => setDefaults((x) => void Object.assign(x.route, p))}
            begin={noop}
            commit={noop}
          />
        ) : (
          <RedactControls
            v={d.redact}
            set={(p) => setDefaults((x) => void Object.assign(x.redact, p))}
            begin={noop}
            commit={noop}
          />
        )}
      </div>
    </Section>
  );
}

/** 一個框的設定（一步復原；滑桿放開、文字欄離開才記） */
function FrameEditor({ frame }: { frame: Frame }) {
  const set = <T,>(patch: Partial<T>, live?: boolean) => {
    const apply = () => updateFrame(frame.id, (f) => void Object.assign(f, patch));
    if (live) gesture.live(apply)();
    else apply();
    /* 邊界演出：預覽跳到這個框動作到一半的樣子 */
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
      ) : frame.kind === 'route' ? (
        <RouteControls
          v={frame}
          set={set}
          begin={gesture.begin}
          commit={gesture.commit}
          points={frame.points.length}
          onEditPoints={
            frame.shape === 'points' || isPathStyle(frame.style)
              ? () => startEditPoints(frame.id)
              : undefined
          }
        />
      ) : (
        <>
          <RedactControls v={frame} set={set} begin={gesture.begin} commit={gesture.commit} />
          <MaskShapeControls frame={frame} commit={gesture.commit} />
        </>
      )}
    </div>
  );
}

function frameSummary(f: Frame): string {
  if (f.kind === 'zoom') {
    const z = f as ZoomFrame;
    return `×${z.scale.toFixed(2)}・${S.zoomStyles[z.style]}`;
  }
  if (f.kind === 'route') {
    const r = f as RouteFrame;
    const parts: string[] = [S.routeStyles[r.style]];
    if (r.shape === 'points') parts.push(`${S.pointShape} ${r.points.length} 點`);
    else if (isPathStyle(r.style)) parts.push(S.routeShapes[r.shape]);
    if (r.label.trim()) parts.push(r.label.trim());
    return parts.join('・');
  }
  const r = f as RedactFrame;
  const parts: string[] = [S.redactStyles[r.style], S.redactModes[r.mode]];
  if (r.mode !== 'static') parts.push(S.revealFxs[r.dir]);
  if (r.cut) parts.push(S.maskL);
  if (r.label.trim()) parts.push(r.label.trim());
  return parts.join('・');
}

function FramesSection() {
  return (
    <ImageFxFramesSection<Frame>
      fx={fx}
      text={S}
      frameName={(f, frames) => fxFrameName(S.kinds, f, frames)}
      icon={(f) =>
        f.kind === 'route' && !isPathStyle(f.style) ? <MapPinned /> : KIND_ICON[f.kind]
      }
      summary={frameSummary}
      editor={(f) => <FrameEditor frame={f} />}
      notes={[S.followNote, S.orderNote, S.privacyNote]}
    />
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
            </div>
          ),
        },
        { value: 'walk', label: S.tabs.walk, content: <WalkPanel /> },
      ]}
    />
  );
}
