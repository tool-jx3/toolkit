import { Download, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { type Hsv, parseColor, rgbToHsv } from '@/core/color';
import { downloadBytes } from '@/core/files';
import {
  Button,
  Field,
  FieldRow,
  HsvPanel,
  hsvToHex,
  Notice,
  type NoticeTone,
  Section,
  Segmented,
  Slider,
  Stage,
  TextInput,
  ToolShell,
  UsageSection,
} from '@/ui';
import { S } from './strings';
import {
  ANGLES,
  alphaFrame,
  cycleMs,
  DEFAULT_SETTINGS,
  DURATIONS,
  encodeTransition,
  exportSize,
  formatKb,
  type PlayCount,
  parseHexColor,
  previewScale,
  previewSize,
  type SizeKind,
  scaleLabel,
  type TransitionSpec,
  toRgba,
  totalMs,
  type WipeDirection,
  WipeField,
  type WipeMode,
  type WipeSettings,
} from './wipe';

/** 面板標記與色相的初始位置（規格 F08、F09）；初始色碼另外給定（#28212f） */
const INITIAL_HSV: Hsv = { h: 268, s: 0.3, v: 0.18 };

const SIZE_OPTIONS = (['square', 'portrait', 'landscape', 'free'] as const).map((value) => ({
  value,
  label: S.sizeKinds[value],
}));
const MODE_OPTIONS = (['normal', 'wipe'] as const).map((value) => ({
  value,
  label: S.modes[value],
}));
const DIRECTION_OPTIONS = (['cover', 'reveal'] as const).map((value) => ({
  value,
  label: S.directions[value],
}));
const PLAY_OPTIONS = (['once', 'loop'] as const).map((value) => ({
  value,
  label: S.playCounts[value],
}));
type PreviewBg = 'light' | 'dark';
const BG_OPTIONS = (['light', 'dark'] as const).map((value) => ({
  value,
  label: S.backgrounds[value],
}));

const angleText = (deg: number) => S.angleText(deg, S.angleDirections[ANGLES.indexOf(deg as 0)]);

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  !!window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function Usage() {
  return (
    <ul>
      {S.usage.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

/** HSV → 色碼，或色碼 → HSV（灰色、黑色時保留原本的色相與彩度） */
function hsvFromHex(hex: string, prev: Hsv): Hsv {
  const c = parseColor(hex);
  if (!c) return prev;
  const n = rgbToHsv(c);
  if (n.v === 0) return { h: prev.h, s: prev.s, v: 0 };
  if (n.s === 0) return { h: prev.h, s: 0, v: n.v };
  return n;
}

/** 色碼欄：只接受 # 加 6 位 16 進位；Enter 或離開欄位時套用，不合法就還原 */
function HexInput({ value, onCommit }: { value: string; onCommit: (hex: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const v = parseHexColor(draft);
    if (v) onCommit(v);
    setDraft(null);
  };
  return (
    <TextInput
      value={draft ?? value}
      spellCheck={false}
      autoComplete="off"
      maxLength={16}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape' && draft !== null) {
          e.preventDefault();
          setDraft(null);
        }
      }}
      className="w-32 font-mono"
    />
  );
}

/** 預覽：連續時間的動畫（不是 30 格取樣），單次播完停在最後狀態，循環時一直重播 */
function Preview({
  settings,
  background,
  replay,
}: {
  settings: WipeSettings;
  background: PreviewBg;
  replay: number;
}) {
  const size = previewSize(settings);
  const scale = previewScale(size.width, size.height);
  const shrunk = scale < 1;
  /* 縮小時直接以縮小後的解析度計算；放大時畫原尺寸、交給瀏覽器平滑放大 */
  const width = shrunk ? Math.max(1, Math.round(size.width * scale)) : size.width;
  const height = shrunk ? Math.max(1, Math.round(size.height * scale)) : size.height;
  const { mode, angle, duration, direction, color, plays } = settings;
  const spec = useMemo<TransitionSpec>(
    () => ({ width, height, mode, angle, duration, direction }),
    [width, height, mode, angle, duration, direction],
  );
  const field = useMemo(
    () => (spec.mode === 'wipe' ? new WipeField(spec.width, spec.height, spec.angle) : null),
    [spec],
  );

  const canvas = useRef<HTMLCanvasElement>(null);
  const firstRun = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: settings 與 replay 只用來讓預覽從頭播放（改任何設定都重播）
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    const image = new ImageData(spec.width, spec.height);
    const alpha = new Uint8Array(spec.width * spec.height);
    const draw = (t: number) => {
      alphaFrame(spec, t, field, alpha);
      toRgba(alpha, color, image.data);
      ctx.putImageData(image, 0, 0);
    };
    /* 使用者設定「減少動態效果」時，開頁不自動播放，直接顯示最後的狀態 */
    const still = firstRun.current && prefersReducedMotion();
    firstRun.current = false;
    if (still) {
      draw(1);
      return;
    }
    const total = totalMs(spec.duration);
    const cycle = cycleMs(spec.mode, spec.duration);
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      let elapsed = Math.max(0, now - start);
      if (elapsed >= cycle) {
        if (plays === 'once') {
          draw(1);
          return;
        }
        elapsed %= cycle;
      }
      draw(Math.min(1, elapsed / total));
      raf = requestAnimationFrame(tick);
    };
    tick(start);
    return () => cancelAnimationFrame(raf);
  }, [spec, field, color, plays, replay, settings]);

  return (
    <Stage
      width={width}
      height={height}
      zoom={shrunk ? 1 : scale}
      toolbar={false}
      background={{ kind: background }}
      aria-label={S.previewLabel}
      viewportClassName="h-64"
    >
      <canvas
        ref={canvas}
        width={width}
        height={height}
        className="block size-full"
        data-testid="wipe-canvas"
      />
    </Stage>
  );
}

export function App() {
  const [settings, setSettings] = useState<WipeSettings>(DEFAULT_SETTINGS);
  const [hsv, setHsv] = useState<Hsv>(INITIAL_HSV);
  const [background, setBackground] = useState<PreviewBg>('light');
  const [replay, setReplay] = useState(0);
  const [status, setStatus] = useState<{ tone: NoticeTone; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const set = <K extends keyof WipeSettings>(key: K, value: WipeSettings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }));

  const size = previewSize(settings);
  const scale = previewScale(size.width, size.height);
  const label = scaleLabel(scale);
  const durationIndex = Math.max(0, DURATIONS.indexOf(settings.duration as 1));

  const exportApng = async () => {
    if (busyRef.current) return;
    if (!exportSize(settings)) {
      setStatus({ tone: 'danger', text: S.sizeError });
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setStatus({ tone: 'progress', text: S.exporting });
    try {
      const file = await encodeTransition(settings);
      downloadBytes(file.bytes, file.fileName, 'image/png');
      setStatus({
        tone: 'success',
        text: S.exported(file.fileName, file.frames, formatKb(file.bytes.length)),
      });
    } catch (e) {
      setStatus({
        tone: 'danger',
        text: S.exportFailed(e instanceof Error ? e.message : String(e)),
      });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <ToolShell
      toolId="apng-wipe"
      usage={<Usage />}
      settings={
        <>
          <UsageSection>
            <Usage />
          </UsageSection>
          <Section title={S.sectionSize} fixed>
            <Field label={S.sizeKind} hint={S.sizeHint}>
              <Segmented<SizeKind>
                fullWidth
                value={settings.sizeKind}
                onValueChange={(v) => set('sizeKind', v)}
                options={SIZE_OPTIONS}
              />
            </Field>
            {settings.sizeKind === 'free' ? (
              <FieldRow>
                <Field label={S.width} hint={S.customHint}>
                  <TextInput
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={1200}
                    step={1}
                    value={settings.customWidth}
                    onChange={(e) => set('customWidth', e.target.value)}
                  />
                </Field>
                <Field label={S.height}>
                  <TextInput
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={1200}
                    step={1}
                    value={settings.customHeight}
                    onChange={(e) => set('customHeight', e.target.value)}
                  />
                </Field>
              </FieldRow>
            ) : null}
          </Section>
          <Section title={S.sectionTransition} fixed>
            <Field label={S.mode} hint={S.modeHint}>
              <Segmented<WipeMode>
                fullWidth
                value={settings.mode}
                onValueChange={(v) => set('mode', v)}
                options={MODE_OPTIONS}
              />
            </Field>
            {settings.mode === 'wipe' ? (
              <Field label={S.angle} labelSuffix={angleText(settings.angle)}>
                <Slider
                  value={settings.angle}
                  onChange={(v) => set('angle', v)}
                  min={0}
                  max={315}
                  step={45}
                  showInput={false}
                  valueText={angleText}
                />
              </Field>
            ) : null}
            <Field label={S.duration} labelSuffix={S.seconds(settings.duration)}>
              <Slider
                value={durationIndex}
                onChange={(i) => set('duration', DURATIONS[i] ?? 1)}
                min={0}
                max={DURATIONS.length - 1}
                step={1}
                showInput={false}
                valueText={(i) => S.seconds(DURATIONS[i] ?? 1)}
              />
            </Field>
            <Field label={S.direction} hint={S.directionHint}>
              <Segmented<WipeDirection>
                fullWidth
                value={settings.direction}
                onValueChange={(v) => set('direction', v)}
                options={DIRECTION_OPTIONS}
              />
            </Field>
            <Field label={S.plays}>
              <Segmented<PlayCount>
                fullWidth
                value={settings.plays}
                onValueChange={(v) => set('plays', v)}
                options={PLAY_OPTIONS}
              />
            </Field>
          </Section>
          <Section title={S.sectionColor} fixed>
            <Field label={S.colorPanel} hint={S.colorPanelHint}>
              <HsvPanel
                value={hsv}
                onChange={(next) => {
                  setHsv(next);
                  set('color', hsvToHex(next));
                }}
              />
            </Field>
            <Field label={S.hex} hint={S.hexHint}>
              <div className="flex items-center gap-2">
                <span
                  role="img"
                  aria-label={S.swatch(settings.color)}
                  data-testid="color-swatch"
                  className="size-8 shrink-0 rounded-md border border-border-strong"
                  style={{ background: settings.color }}
                />
                <HexInput
                  value={settings.color}
                  onCommit={(hex) => {
                    set('color', hex);
                    setHsv((prev) => hsvFromHex(hex, prev));
                  }}
                />
              </div>
            </Field>
          </Section>
        </>
      }
      preview={
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented<PreviewBg>
              aria-label={S.previewBackground}
              size="sm"
              value={background}
              onValueChange={setBackground}
              options={BG_OPTIONS}
            />
            <Button size="sm" icon={<RotateCcw />} onClick={() => setReplay((n) => n + 1)}>
              {S.replay}
            </Button>
            <p className="m-0 ml-auto text-xs text-muted" data-testid="preview-scale">
              {S.sizeText(size.width, size.height)}・{label ? S.scaleText(label) : S.shrunkText}
            </p>
          </div>
          <Preview settings={settings} background={background} replay={replay} />
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
            <Button
              variant="primary"
              icon={<Download />}
              loading={busy}
              onClick={() => void exportApng()}
              className="self-start"
            >
              {S.exportApng}
            </Button>
            {status ? (
              <Notice tone={status.tone}>
                <span data-testid="export-status">{status.text}</span>
              </Notice>
            ) : null}
          </div>
        </>
      }
    />
  );
}
