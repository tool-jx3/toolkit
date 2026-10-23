/**
 * 設定欄（規格 1.1～1.7）：三個分頁——圖片（背景圖、構圖、像素化、色調、畫面效果）、
 * 台詞（台詞、說話者、頭像、選項、演出文字、地點）、樣式（視窗主題、訊息視窗、文字、打字機）。
 */
import {
  ImageIcon,
  ImagePlus,
  LocateFixed,
  Lock,
  LockOpen,
  Sparkles,
  Trash2,
  UserRound,
} from 'lucide-react';
import { type ReactNode, useCallback, useMemo, useRef } from 'react';
import { useAssetImage } from '@/core/assets';
import { pixelateImage } from '@/core/image';
import {
  Button,
  ColorField,
  Field,
  ImageDrop,
  Notice,
  Section,
  Segmented,
  Select,
  Slider,
  Tabs,
  TextArea,
  TextInput,
  ThumbChoice,
  Toggle,
  useToast,
} from '@/ui';
import { fontBytes, fontGridPx } from './fonts';
import type { BatchNotice } from './media';
import {
  DEFAULT_NAME_COLOR,
  FACE_SIDES,
  type FaceSide,
  FONT_IDS,
  type FontId,
  LIMITS,
  LIST_MAX,
  listLineCount,
  NAME_STYLES,
  type NameStyle,
  POPUP_POSITIONS,
  POPUP_WHENS,
  type PopupPos,
  type PopupWhen,
  pageAtCaret,
  RANGES,
  RATIOS,
  type Ratio,
  RETRO_TONES,
  type RetroTone,
  type RpgState,
  screenSize,
  TEXT_FXS,
  type TextFx,
  viewCrop,
  WIN_POSITIONS,
  type WinPos,
  zoomView,
} from './model';
import {
  assets,
  clearBackground,
  clearFace,
  docNow,
  edit,
  gesture,
  goPage,
  setPrefs,
  setRatio,
  setView,
  useDoc,
  useLive,
  useMissing,
  usePrefs,
} from './store';
import { S } from './strings';
import { THEME_IDS, THEMES, type ThemeId } from './themes';

/* ---------- 共用 ---------- */

type Key = {
  [K in keyof RpgState]: RpgState[K] extends number | boolean | string | null ? K : never;
}[keyof RpgState];

/** 一個欄位的變更（一步復原） */
function set<K extends Key>(key: K, value: RpgState[K]): void {
  edit((d) => {
    (d as Record<K, RpgState[K]>)[key] = value;
  });
}

/** 滑桿：拖曳中即時套用，放開才記一步 */
function NumSlider({
  k,
  unit,
  step,
  disabled,
  valueText,
}: {
  k:
    | 'pixelSize'
    | 'levels'
    | 'brightness'
    | 'contrast'
    | 'saturation'
    | 'boxOpacity'
    | 'fontSize'
    | 'typeSpeed';
  unit?: string;
  step?: number;
  disabled?: boolean;
  valueText?: (v: number) => string;
}) {
  const v = useDoc((s) => s.data[k]);
  const r = RANGES[k];
  return (
    <Slider
      value={v}
      min={r.min}
      max={r.max}
      step={step ?? 1}
      unit={unit}
      disabled={disabled}
      valueText={valueText}
      onChange={gesture.live((n: number) => set(k, n))}
      onCommit={gesture.commit}
    />
  );
}

/** 開關（一步復原） */
function DocToggle({
  k,
}: {
  k: 'dither' | 'scanline' | 'vignette' | 'popupAll' | 'showWindow' | 'showArrow';
}) {
  const v = useDoc((s) => s.data[k]);
  return <Toggle checked={v} onCheckedChange={(on) => set(k, on)} />;
}

/** 文字欄：從聚焦到離開算一步 */
function DocTextArea({
  k,
  rows,
  max,
  placeholder,
  onCaret,
}: {
  k: 'dialogue' | 'choices' | 'popups';
  rows: number;
  max: number;
  placeholder: string;
  onCaret?: (el: HTMLTextAreaElement) => void;
}) {
  const v = useDoc((s) => s.data[k]);
  return (
    <TextArea
      rows={rows}
      value={v}
      placeholder={placeholder}
      spellCheck={false}
      onFocus={gesture.begin}
      onBlur={gesture.commit}
      onChange={(e) => {
        const next = Array.from(e.target.value).slice(0, max).join('');
        set(k, next);
        onCaret?.(e.target);
      }}
      onClick={onCaret ? (e) => onCaret(e.currentTarget) : undefined}
      onKeyUp={onCaret ? (e) => onCaret(e.currentTarget) : undefined}
    />
  );
}

function DocTextInput({
  k,
  max,
  placeholder,
}: {
  k: 'speaker' | 'location';
  max: number;
  placeholder: string;
}) {
  const v = useDoc((s) => s.data[k]);
  return (
    <TextInput
      value={v}
      placeholder={placeholder}
      autoComplete="off"
      onFocus={gesture.begin}
      onBlur={gesture.commit}
      onChange={(e) => {
        const next = Array.from(e.target.value.replace(/\r?\n|\r/g, ' '))
          .slice(0, max)
          .join('');
        set(k, next);
      }}
    />
  );
}

function useNotify() {
  const toast = useToast();
  return useCallback(
    (n: BatchNotice | null) => {
      if (n) toast({ title: n.title, description: n.description, tone: n.tone });
    },
    [toast],
  );
}

/** 圖片載入區（背景圖、頭像共用） */
function ImageSlot({
  name,
  area,
  dropLabel,
  hint,
  current,
  choose,
  change,
  paste,
  onFiles,
  testId,
}: {
  name: string | null;
  area: string;
  dropLabel: string;
  hint: string;
  current: string;
  choose: string;
  change: string;
  paste: 'document' | 'off';
  onFiles: (files: File[]) => void;
  testId: string;
}) {
  return (
    <div data-testid={testId} data-state={name !== null ? 'loaded' : 'empty'}>
      <ImageDrop
        aria-label={area}
        paste={paste}
        filterByAccept={false}
        compact={name !== null}
        icon={name !== null ? <ImageIcon /> : <ImagePlus />}
        label={
          name !== null ? (
            <span className="flex min-w-0" data-testid={`${testId}-name`}>
              <span className="shrink-0">{current}</span>
              <span className="truncate" title={name}>
                {name || '—'}
              </span>
            </span>
          ) : (
            dropLabel
          )
        }
        hint={hint}
        buttonLabel={name !== null ? change : choose}
        onFiles={onFiles}
      />
    </div>
  );
}

/* ---------- 圖片 ---------- */

/** 色調縮圖的來源：沒有背景圖時的示意漸層 */
let fallbackThumb: HTMLCanvasElement | null = null;
function fallbackSource(): HTMLCanvasElement {
  if (fallbackThumb) return fallbackThumb;
  const c = document.createElement('canvas');
  c.width = 160;
  c.height = 120;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const lg = g.createLinearGradient(0, 0, 0, 120);
  lg.addColorStop(0, '#3b4fa8');
  lg.addColorStop(0.55, '#e48a7a');
  lg.addColorStop(1, '#f6d58c');
  g.fillStyle = lg;
  g.fillRect(0, 0, 160, 120);
  g.fillStyle = '#2a7a4a';
  g.beginPath();
  g.moveTo(0, 120);
  g.lineTo(0, 80);
  g.lineTo(50, 55);
  g.lineTo(95, 85);
  g.lineTo(130, 62);
  g.lineTo(160, 78);
  g.lineTo(160, 120);
  g.fill();
  g.fillStyle = '#fff4c8';
  g.beginPath();
  g.arc(118, 32, 14, 0, Math.PI * 2);
  g.fill();
  fallbackThumb = c;
  return c;
}

const THUMB_W = 96;
const THUMB_H = 72;

function ToneChoice() {
  const s = useDoc((st) => st.data);
  const bmp = useAssetImage(assets, s.bg?.id).bitmap;
  const { pixelSize, levels, dither, brightness, contrast, saturation, ratio, view, bg } = s;
  /* 縮圖：同樣的範圍、像素大小依縮圖比例換算；只有 8 張、設定改了才重算 */
  const cache = useRef(new Map<string, ImageData>());
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, tone: RetroTone) => {
      const key = tone;
      let img = cache.current.get(key);
      if (!img) {
        const out = screenSize(ratio);
        const src = bmp && bg ? bmp : fallbackSource();
        const crop = bmp && bg ? viewCrop(bmp, out, view) : null;
        const c = pixelateImage(src, THUMB_W, THUMB_H, {
          crop,
          pixelSize: Math.max(1, Math.round((pixelSize * THUMB_W) / out.width)),
          levels,
          dither,
          tone,
          brightness,
          contrast,
          saturation,
        });
        const g = c.getContext('2d') as CanvasRenderingContext2D;
        img = g.getImageData(0, 0, THUMB_W, THUMB_H);
        cache.current.set(key, img);
      }
      ctx.putImageData(img, 0, 0);
    },
    [bmp, bg, ratio, view, pixelSize, levels, dither, brightness, contrast, saturation],
  );
  /* draw 換了（設定改了）→ 清快取 */
  const lastDraw = useRef(draw);
  if (lastDraw.current !== draw) {
    lastDraw.current = draw;
    cache.current.clear();
  }
  return (
    <ThumbChoice<RetroTone>
      aria-label={S.tone}
      options={RETRO_TONES.map((t) => ({
        value: t,
        label: S.tones[t],
        description: S.toneAria[t],
      }))}
      value={s.tone}
      onValueChange={(v) => set('tone', v)}
      draw={draw}
      thumbWidth={THUMB_W}
      thumbHeight={THUMB_H}
      minItemWidth={76}
    />
  );
}

export function ImagePanel({
  onBgFiles,
  onSample,
}: {
  onBgFiles: (files: File[]) => void;
  onSample: () => void;
}) {
  const bg = useDoc((s) => s.data.bg);
  const view = useDoc((s) => s.data.view);
  const ratio = useDoc((s) => s.data.ratio);
  const locked = usePrefs((p) => p.data.locked);
  const missing = useMissing((m) => m.bg);
  const toast = useToast();
  const movable = !!bg && !locked;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Section title={S.sectionBg} persistKey="rpg-screenshot:bg">
        <ImageSlot
          name={bg ? bg.name : null}
          area={S.dropArea}
          dropLabel={S.drop}
          hint={S.dropHint}
          current={S.currentBg}
          choose={S.chooseBg}
          change={S.changeBg}
          paste="document"
          onFiles={onBgFiles}
          testId="bg-load"
        />
        {missing !== null ? <Notice tone="warning">{S.bgMissing}</Notice> : null}
        <div className="flex flex-wrap items-center gap-2">
          {bg ? (
            <Button icon={<Trash2 />} onClick={() => clearBackground()}>
              {S.removeBg}
            </Button>
          ) : (
            <Button icon={<Sparkles />} onClick={onSample}>
              {S.useSample}
            </Button>
          )}
        </div>
        <p className="m-0 text-xs text-muted">{S.privacy}</p>
      </Section>
      <Section title={S.sectionLayout} persistKey="rpg-screenshot:layout">
        <Field label={S.ratio}>
          <Segmented<Ratio>
            value={ratio}
            onValueChange={(v) => setRatio(v)}
            options={RATIOS.map((r) => ({
              value: r,
              label: S.ratios[r],
              ariaLabel: S.ratioAria[r],
            }))}
            fullWidth
          />
        </Field>
        <Field label={S.zoom} hint={S.zoomHint}>
          <Slider
            value={Math.round(view.zoom * 100)}
            min={RANGES.zoom.min * 100}
            max={RANGES.zoom.max * 100}
            step={5}
            unit="%"
            disabled={!movable}
            onChange={gesture.live((v: number) => {
              const s = docNow();
              if (s.bg) setView(zoomView(s.view, v / 100), false);
            })}
            onCommit={gesture.commit}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            icon={<LocateFixed />}
            disabled={!movable}
            onClick={() => setView({ zoom: 1, x: 0, y: 0 })}
          >
            {S.resetView}
          </Button>
          <Button
            icon={locked ? <LockOpen /> : <Lock />}
            variant={locked ? 'primary' : 'secondary'}
            aria-pressed={locked}
            disabled={!bg}
            onClick={() => {
              setPrefs({ locked: !locked });
              toast({ title: locked ? S.unlocked : S.locked, replace: true });
            }}
            data-testid="lock-button"
          >
            {locked ? S.unlock : S.lock}
          </Button>
        </div>
      </Section>
      <Section title={S.sectionPixel} persistKey="rpg-screenshot:pixel">
        <Field label={S.pixelSize} hint={S.pixelSizeHint}>
          <NumSlider k="pixelSize" unit="px" />
        </Field>
        <Field label={S.levels} hint={S.levelsHint}>
          <NumSlider k="levels" />
        </Field>
        <Field label={S.dither} hint={S.ditherHint} layout="inline">
          <DocToggle k="dither" />
        </Field>
      </Section>
      <Section title={S.sectionTone} persistKey="rpg-screenshot:tone">
        <Field label={S.tone}>
          <ToneChoice />
        </Field>
        <Field label={S.brightness}>
          <NumSlider k="brightness" valueText={S.signed} />
        </Field>
        <Field label={S.contrast}>
          <NumSlider k="contrast" valueText={S.signed} />
        </Field>
        <Field label={S.saturation}>
          <NumSlider k="saturation" valueText={S.signed} />
        </Field>
      </Section>
      <Section title={S.sectionScreen} persistKey="rpg-screenshot:screen">
        <Field label={S.scanline} layout="inline">
          <DocToggle k="scanline" />
        </Field>
        <Field label={S.vignette} layout="inline">
          <DocToggle k="vignette" />
        </Field>
      </Section>
    </div>
  );
}

/* ---------- 台詞 ---------- */

function Syntax() {
  return (
    <dl
      className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted"
      data-testid="syntax"
    >
      {S.syntax.map(([code, text]) => (
        <div key={code} className="contents">
          <dt>
            <code className="rounded-sm bg-surface-2 px-1 font-mono text-fg">{code}</code>
          </dt>
          <dd className="m-0">{text}</dd>
        </div>
      ))}
    </dl>
  );
}

function DialogueField() {
  const overflow = useLive((l) => l.overflow);
  const onCaret = useCallback((el: HTMLTextAreaElement) => {
    const p = pageAtCaret(el.value, el.selectionStart ?? 0);
    if (p !== useLive.getState().page) goPage(p);
  }, []);
  return (
    <Field
      label={S.dialogue}
      hint={
        <span className="flex flex-col gap-1.5">
          <span>{S.caretHint}</span>
          {overflow.length ? (
            <span className="text-warning" data-testid="overflow-warning">
              {S.overflow(overflow)}
            </span>
          ) : null}
        </span>
      }
    >
      <DocTextArea
        k="dialogue"
        rows={7}
        max={LIMITS.dialogue}
        placeholder={S.dialoguePlaceholder}
        onCaret={onCaret}
      />
    </Field>
  );
}

function NameColorField() {
  const nameColor = useDoc((s) => s.data.nameColor);
  const follow = nameColor === null;
  return (
    <Field label={S.nameColor} hint={S.nameColorHint}>
      <div className="flex flex-wrap items-center gap-3">
        <Toggle
          label={S.nameColorFollow}
          checked={follow}
          onCheckedChange={(on) => set('nameColor', on ? null : DEFAULT_NAME_COLOR)}
        />
        {follow ? null : (
          <ColorField
            aria-label={S.nameColor}
            value={nameColor}
            onChange={(hex) => set('nameColor', hex.slice(0, 7).toLowerCase())}
          />
        )}
      </div>
    </Field>
  );
}

function ListWarning({ k }: { k: 'choices' | 'popups' }) {
  const v = useDoc((s) => s.data[k]);
  const n = listLineCount(v);
  return n > LIST_MAX ? (
    <p className="m-0 text-xs text-warning" data-testid={`${k}-too-many`}>
      {S.tooMany(n)}
    </p>
  ) : null;
}

function PopupPresets() {
  const popups = useDoc((s) => s.data.popups);
  const full = listLineCount(popups) >= LIST_MAX;
  return (
    // biome-ignore lint/a11y/useSemanticElements: 一組按鈕（不是表單欄位）
    <div role="group" aria-label={S.popupPresets} className="flex flex-wrap gap-1.5">
      {S.popupPresetList.map((p) => (
        <Button
          key={p}
          size="sm"
          variant="secondary"
          aria-label={S.popupPresetAria(p)}
          disabled={full}
          onClick={() => {
            const cur = docNow().popups.replace(/\s+$/, '');
            const next = cur ? `${cur}\n${p}` : p;
            set('popups', Array.from(next).slice(0, LIMITS.list).join(''));
          }}
        >
          {p}
        </Button>
      ))}
    </div>
  );
}

function FaceSection({ onFaceFiles }: { onFaceFiles: (files: File[]) => void }) {
  const face = useDoc((s) => s.data.face);
  const side = useDoc((s) => s.data.faceSide);
  const missing = useMissing((m) => m.face);
  return (
    <Section title={S.sectionFace} persistKey="rpg-screenshot:face">
      <ImageSlot
        name={face ? face.name : null}
        area={S.faceArea}
        dropLabel={S.faceDrop}
        hint={S.faceHint}
        current={S.currentFace}
        choose={S.chooseFace}
        change={S.changeFace}
        paste="off"
        onFiles={onFaceFiles}
        testId="face-load"
      />
      {missing !== null ? <Notice tone="warning">{S.faceMissing}</Notice> : null}
      <Field label={S.faceSide}>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<FaceSide>
            value={side}
            onValueChange={(v) => set('faceSide', v)}
            options={FACE_SIDES.map((f) => ({ value: f, label: S.faceSides[f] }))}
          />
          <Button icon={<UserRound />} disabled={!face} onClick={() => clearFace()}>
            {S.removeFace}
          </Button>
        </div>
      </Field>
    </Section>
  );
}

export function TextPanel({ onFaceFiles }: { onFaceFiles: (files: File[]) => void }) {
  const popupPos = useDoc((s) => s.data.popupPos);
  const popupWhen = useDoc((s) => s.data.popupWhen);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Section title={S.sectionDialogue} persistKey="rpg-screenshot:dialogue">
        <DialogueField />
        <details className="text-xs" data-testid="syntax-help" open>
          <summary className="cursor-pointer text-muted">{S.syntaxTitle}</summary>
          <div className="pt-2">
            <Syntax />
          </div>
        </details>
        <Field label={S.speaker} hint={S.speakerHint}>
          <DocTextInput k="speaker" max={LIMITS.speaker} placeholder={S.speakerPlaceholder} />
        </Field>
        <NameColorField />
      </Section>
      <FaceSection onFaceFiles={onFaceFiles} />
      <Section title={S.sectionChoices} persistKey="rpg-screenshot:choices">
        <Field label={S.choices} hint={S.choicesHint}>
          <DocTextArea k="choices" rows={3} max={LIMITS.list} placeholder={S.choicesPlaceholder} />
        </Field>
        <ListWarning k="choices" />
      </Section>
      <Section title={S.sectionPopups} persistKey="rpg-screenshot:popups">
        <Field label={S.popups} hint={S.popupsHint}>
          <DocTextArea k="popups" rows={3} max={LIMITS.list} placeholder={S.popupsPlaceholder} />
        </Field>
        <ListWarning k="popups" />
        <PopupPresets />
        <Field label={S.popupPos}>
          <Segmented<PopupPos>
            value={popupPos}
            onValueChange={(v) => set('popupPos', v)}
            options={POPUP_POSITIONS.map((p) => ({ value: p, label: S.popupPositions[p] }))}
            fullWidth
          />
        </Field>
        <Field label={S.popupWhen}>
          <Segmented<PopupWhen>
            value={popupWhen}
            onValueChange={(v) => set('popupWhen', v)}
            options={POPUP_WHENS.map((p) => ({ value: p, label: S.popupWhens[p] }))}
            fullWidth
          />
        </Field>
        <Field label={S.popupAll} hint={S.popupAllHint} layout="inline">
          <DocToggle k="popupAll" />
        </Field>
      </Section>
      <Section title={S.sectionLocation} persistKey="rpg-screenshot:location">
        <Field label={S.location} hint={S.locationHint}>
          <DocTextInput k="location" max={LIMITS.location} placeholder={S.locationPlaceholder} />
        </Field>
      </Section>
    </div>
  );
}

/* ---------- 樣式 ---------- */

/** 主題的縮圖：小小的訊息視窗（底色漸層、框、內線、名字、兩行字、▼） */
function drawThemeThumb(ctx: CanvasRenderingContext2D, id: ThemeId): void {
  const { width: W, height: H } = ctx.canvas;
  const t = THEMES[id];
  ctx.clearRect(0, 0, W, H);
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#3d4a6b');
  bg.addColorStop(1, '#1f2638');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const x = 8;
  const y = H * 0.42;
  const w = W - 16;
  const h = H * 0.5;
  const r = 8;
  const path = (px: number, py: number, pw: number, ph: number, pr: number) => {
    ctx.beginPath();
    ctx.roundRect(px, py, pw, ph, pr);
  };
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, t.fill[0]);
  g.addColorStop(1, t.fill[1]);
  path(x, y, w, h, r);
  ctx.fillStyle = g;
  ctx.globalAlpha = 0.95;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 3;
  ctx.strokeStyle = t.border;
  path(x + 1.5, y + 1.5, w - 3, h - 3, r - 1.5);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = t.inner;
  path(x + 7.5, y + 7.5, w - 15, h - 15, 3);
  ctx.stroke();
  ctx.globalAlpha = 1;
  /* 名字 */
  path(x + 12, y - 12, 54, 22, 11);
  ctx.fillStyle = t.nameBox;
  ctx.fill();
  ctx.fillStyle = t.accent;
  ctx.fillRect(x + 24, y - 3, 30, 5);
  /* 兩行字 */
  ctx.fillStyle = t.text;
  ctx.fillRect(x + 16, y + h * 0.38, w * 0.62, 6);
  ctx.fillRect(x + 16, y + h * 0.62, w * 0.4, 6);
  /* ▼ */
  ctx.fillStyle = t.border;
  ctx.beginPath();
  const cx = x + w / 2;
  const ay = y + h - 14;
  ctx.moveTo(cx - 6, ay);
  ctx.lineTo(cx + 6, ay);
  ctx.lineTo(cx, ay + 6);
  ctx.closePath();
  ctx.fill();
}

function FontField() {
  const font = useDoc((s) => s.data.font);
  const fontState = useLive((l) => l.fontState);
  return (
    <Field
      label={S.font}
      hint={
        <span className="flex flex-col gap-1">
          <span>{S.fontDesc[font]}</span>
          {fontState === 'loading' ? <span role="status">{S.fontLoading}</span> : null}
          {fontState === 'failed' ? <span className="text-warning">{S.fontFailed}</span> : null}
        </span>
      }
    >
      <Select
        value={font}
        onValueChange={(v) => set('font', v as FontId)}
        options={FONT_IDS.map((f) => ({
          value: f,
          label: S.fonts[f],
          description: fontBytes(f)
            ? `${Math.round((fontBytes(f) as number) / 1024)} KB`
            : undefined,
        }))}
      />
    </Field>
  );
}

export function StylePanel() {
  const theme = useDoc((s) => s.data.theme);
  const winPos = useDoc((s) => s.data.winPos);
  const font = useDoc((s) => s.data.font);
  const nameStyle = useDoc((s) => s.data.nameStyle);
  const textFx = useDoc((s) => s.data.textFx);
  const sound = usePrefs((p) => p.data.sound);
  const pitch = usePrefs((p) => p.data.pitch);
  const themeOptions = useMemo(() => THEME_IDS.map((t) => ({ value: t, label: S.themes[t] })), []);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Section title={S.sectionTheme} persistKey="rpg-screenshot:theme">
        <ThumbChoice<ThemeId>
          aria-label={S.theme}
          options={themeOptions}
          value={theme}
          onValueChange={(v) => set('theme', v)}
          draw={drawThemeThumb}
          thumbWidth={128}
          thumbHeight={88}
          minItemWidth={84}
        />
      </Section>
      <Section title={S.sectionWindow} persistKey="rpg-screenshot:window">
        <Field label={S.showWindow} hint={S.showWindowHint} layout="inline">
          <DocToggle k="showWindow" />
        </Field>
        <Field label={S.winPos}>
          <Segmented<WinPos>
            value={winPos}
            onValueChange={(v) => set('winPos', v)}
            options={WIN_POSITIONS.map((p) => ({ value: p, label: S.winPositions[p] }))}
            fullWidth
          />
        </Field>
        <Field label={S.boxOpacity}>
          <NumSlider k="boxOpacity" unit="%" />
        </Field>
        <Field label={S.showArrow} layout="inline">
          <DocToggle k="showArrow" />
        </Field>
      </Section>
      <Section title={S.sectionText} persistKey="rpg-screenshot:text">
        <FontField />
        <Field label={S.fontSize} hint={S.fontSizeHint(fontGridPx(font))}>
          <NumSlider k="fontSize" unit="px" />
        </Field>
        <Field label={S.nameStyle}>
          <Segmented<NameStyle>
            value={nameStyle}
            onValueChange={(v) => set('nameStyle', v)}
            options={NAME_STYLES.map((n) => ({
              value: n,
              label: S.nameStyles[n],
              ariaLabel: S.nameStyleAria[n],
            }))}
            fullWidth
          />
        </Field>
        <Field label={S.textFx}>
          <Segmented<TextFx>
            value={textFx}
            onValueChange={(v) => set('textFx', v)}
            options={TEXT_FXS.map((f) => ({ value: f, label: S.textFxs[f] }))}
            fullWidth
          />
        </Field>
      </Section>
      <Section title={S.sectionType} persistKey="rpg-screenshot:type">
        <Field label={S.typeSpeed}>
          <NumSlider k="typeSpeed" unit="ms" step={RANGES.typeSpeed.step} />
        </Field>
        <Field label={S.sound} hint={S.soundHint} layout="inline">
          <Toggle checked={sound} onCheckedChange={(on) => setPrefs({ sound: on })} />
        </Field>
        <Field label={S.pitch}>
          <Slider
            value={pitch}
            min={RANGES.pitch.min}
            max={RANGES.pitch.max}
            step={RANGES.pitch.step}
            unit="Hz"
            disabled={!sound}
            onChange={(v) => setPrefs({ pitch: v })}
          />
        </Field>
      </Section>
    </div>
  );
}

/* ---------- 整個設定欄 ---------- */

export function Settings({
  onBgFiles,
  onFaceFiles,
  onSample,
}: {
  onBgFiles: (files: File[]) => void;
  onFaceFiles: (files: File[]) => void;
  onSample: () => void;
}) {
  const items: { value: 'image' | 'text' | 'style'; label: string; content: ReactNode }[] = [
    {
      value: 'image',
      label: S.tabs.image,
      content: <ImagePanel onBgFiles={onBgFiles} onSample={onSample} />,
    },
    { value: 'text', label: S.tabs.text, content: <TextPanel onFaceFiles={onFaceFiles} /> },
    { value: 'style', label: S.tabs.style, content: <StylePanel /> },
  ];
  return <Tabs aria-label={S.tabsLabel} items={items} keepMounted />;
}

export { useNotify };
