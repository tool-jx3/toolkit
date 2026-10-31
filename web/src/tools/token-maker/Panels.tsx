/**
 * 設定欄的分頁：圖片（讀圖、名單、擺放、色彩調整、背景、參考輪廓）、出框（選取、柔邊、陰影、邊距）、
 * 外框（預設外觀、樣式、自訂外框與遮罩、顏色、光照、質感、光暈）、匯出（尺寸、格式、嵌入設定、下載、複製、打包、實際大小）。
 * 「名字」與「效果」在 TextTab、FxTab。
 */
import {
  ArrowLeftRight,
  Copy,
  Download,
  FileArchive,
  FlipHorizontal2,
  ImageUp,
  RotateCcw,
  Shuffle,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { copyImage, downloadBlob, pickFiles } from '@/core/files';
import { getTool, hrefToTool } from '@/registry';
import {
  Button,
  ColorField,
  Field,
  GestureScope,
  ImageDrop,
  Notice,
  NumberInput,
  Section,
  Segmented,
  Select,
  Show,
  Slider,
  Toggle,
  useToast,
  useWebpSupport,
} from '@/ui';
import { EffectGrid, type EffectGridItem } from '@/ui/EffectGrid';
import {
  allZipName,
  autoPickColor,
  type BatchNotice,
  changeMask,
  loadCustomFrame,
  loadCustomMaskFile,
  loadMaskFile,
  loadRefImage,
  renderTokenBlob,
  runAuto,
  selectionText,
  setJobs,
  setZipName,
  tokenFileName,
  zipAllJobs,
  zipTokens,
} from './actions';
import { FRAMES, type FrameDef, frameDef, metalStops } from './frames';
import {
  type Adjust,
  type BgMode,
  CUSTOM_SIZE,
  defaultAdjust,
  FRAME_IDS,
  type FrameId,
  GLOW_MODES,
  type GlowMode,
  GRADIENTS,
  isDefaultAdjust,
  type Look,
  METALS,
  NEONS,
  RANGES,
  SIZE_PRESETS,
  sharpSize,
  TEXTURE_AMOUNT,
  TEXTURE_IDS,
  type TextureId,
  type TokenItem,
} from './model';
import { PresetSection } from './Presets';
import { RosterSection } from './Roster';
import { type Guides, REF_SHAPES, type RefKind } from './reference';
import { drawFrameThumb } from './render';
import { imageGradient, imagePalette, useCustomData, useTokenData } from './sources';
import {
  currentToken,
  docNow,
  editCurrent,
  editLook,
  exportSizeOf,
  flipCurrent,
  gesture,
  patchView,
  resetView,
  setCustomFrame,
  setCustomMask,
  setFrame,
  setPrefs,
  tokenPad,
  useDoc,
  usePrefs,
} from './store';
import { S } from './strings';
import { requestTexture } from './textures';
import { drawTokenThumb, useLoadedTokens } from './thumbs';

const useLook = () => useDoc((s) => s.data.look);
const useCurrent = () => useDoc((s) => currentToken(s.data));

/** 外觀的一個欄位（滑桿放開才記一步） */
function lookSlider<K extends keyof Look>(key: K) {
  return {
    onChange: gesture.live((v: number) =>
      editLook((l) => {
        (l[key] as number) = v;
      }),
    ),
    onCommit: gesture.commit,
  };
}

function useNotice() {
  const toast = useToast();
  return (n: BatchNotice | null) => {
    if (n) toast({ title: n.title, description: n.description, tone: n.tone, replace: true });
  };
}

/** 圖片的代表色（每個顏色欄旁的快速色票） */
function useImagePalette(): string[] {
  const token = useCurrent();
  const data = useTokenData(token?.image ?? null, null);
  return useMemo(() => (data.work ? imagePalette(data.work.work) : []), [data.work]);
}

/* ---------- 圖片 ---------- */

export function ImageTab({
  onFiles,
  onPick,
}: {
  onFiles: (files: File[]) => void;
  onPick: () => void;
}) {
  const token = useCurrent();
  const look = useLook();
  const autoDetect = usePrefs((s) => s.data.autoDetect);
  const hasTokens = useDoc((s) => s.data.tokens.length > 0);
  const pal = useImagePalette();
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <ImageDrop
        aria-label={S.dropArea}
        onFiles={onFiles}
        multiple
        label={S.dropLabel}
        buttonLabel={S.dropButton}
        hint={S.dropHint}
        compact={hasTokens}
        filterByAccept={false}
      />
      {token?.image ? (
        <p className="m-0 break-all text-xs text-muted" data-testid="image-info">
          {S.imageInfo(token.image.name || '—', token.image.width, token.image.height)}
        </p>
      ) : null}
      <Field label={S.autoDetectLabel} hint={S.autoDetectHint} layout="inline">
        <Toggle checked={autoDetect} onCheckedChange={(v) => setPrefs({ autoDetect: v })} />
      </Field>
      {hasTokens ? <RosterSection onAdd={onPick} /> : null}
      <Section title={S.placement} persistKey="token-maker:placement">
        <PlacementFields token={token} />
      </Section>
      <Section
        title={S.adjustSection}
        description={S.adjustHint}
        persistKey="token-maker:adjust"
        defaultOpen={false}
      >
        <AdjustFields token={token} />
      </Section>
      <Section title={S.background} persistKey="token-maker:background">
        <Field label={S.bgMode} hint={S.bgModeHint[look.bg]}>
          <Segmented<BgMode>
            value={look.bg}
            onValueChange={(v) =>
              editLook((l) => {
                l.bg = v;
              })
            }
            options={(['none', 'color', 'extend'] as BgMode[]).map((v) => ({
              value: v,
              label: S.bgModes[v],
            }))}
          />
        </Field>
        <Show when={look.bg === 'color'}>
          <Field label={S.bgColor}>
            <GestureScope gesture={gesture}>
              <ColorField
                value={look.bgColor}
                swatches={pal}
                onChange={(v) =>
                  editLook((l) => {
                    l.bgColor = v.slice(0, 7).toLowerCase();
                  })
                }
              />
            </GestureScope>
          </Field>
        </Show>
      </Section>
      <ReferenceSection />
    </div>
  );
}

const ADJUST_FIELDS: {
  key: keyof Adjust;
  label: string;
  min: number;
  max: number;
  unit: string;
}[] = [
  { key: 'bright', label: S.bright, min: RANGES.adjust.min, max: RANGES.adjust.max, unit: '%' },
  { key: 'contrast', label: S.contrast, min: RANGES.adjust.min, max: RANGES.adjust.max, unit: '%' },
  { key: 'sat', label: S.saturation, min: RANGES.adjust.min, max: RANGES.adjust.max, unit: '%' },
  { key: 'hue', label: S.hue, min: RANGES.hue.min, max: RANGES.hue.max, unit: '°' },
];

/** 色彩調整（每個棋子） */
function AdjustFields({ token }: { token: TokenItem | null }) {
  const disabled = !token?.image;
  const a = token?.adjust ?? defaultAdjust();
  return (
    <>
      {ADJUST_FIELDS.map((f) => (
        <Field key={f.key} label={f.label}>
          <Slider
            value={a[f.key]}
            min={f.min}
            max={f.max}
            unit={f.unit}
            disabled={disabled}
            onChange={gesture.live((v: number) =>
              editCurrent((t) => {
                t.adjust = { ...t.adjust, [f.key]: v };
              }),
            )}
            onCommit={gesture.commit}
          />
        </Field>
      ))}
      <div>
        <Button
          size="sm"
          variant="secondary"
          icon={<RotateCcw />}
          disabled={disabled || isDefaultAdjust(a)}
          onClick={() =>
            editCurrent((t) => {
              t.adjust = defaultAdjust();
            })
          }
        >
          {S.adjustReset}
        </Button>
      </div>
    </>
  );
}

/** 參考輪廓（只在預覽） */
function ReferenceSection() {
  const kind = usePrefs((s) => s.data.refKind);
  const opacity = usePrefs((s) => s.data.refOpacity);
  const guides = usePrefs((s) => s.data.guides);
  const refImage = usePrefs((s) => s.data.refImage);
  const notify = useNotice();
  const pickRef = async () => {
    const [f] = await pickFiles({ accept: 'image/*' });
    if (f) notify(await loadRefImage(f));
  };
  const kinds: RefKind[] = ['off', ...REF_SHAPES, 'custom'];
  return (
    <Section
      title={S.refSection}
      description={S.refHint}
      persistKey="token-maker:reference"
      defaultOpen={false}
    >
      <Field label={S.refKind}>
        <Select<RefKind>
          value={kind}
          data-testid="ref-kind"
          onValueChange={(v) => {
            if (v === 'custom' && !refImage) void pickRef();
            else setPrefs({ refKind: v });
          }}
          options={kinds.map((k) => ({ value: k, label: S.refKinds[k] }))}
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" icon={<ImageUp />} onClick={() => void pickRef()}>
          {S.refLoad}
        </Button>
        {refImage ? (
          <Button
            size="sm"
            variant="ghost"
            icon={<X />}
            onClick={() => setPrefs({ refImage: null, refKind: kind === 'custom' ? 'off' : kind })}
          >
            {S.refClear}
          </Button>
        ) : null}
      </div>
      <Field label={S.guides}>
        <Segmented<Guides>
          value={guides}
          onValueChange={(v) => setPrefs({ guides: v })}
          options={(['off', 'cross', 'grid'] as Guides[]).map((g) => ({
            value: g,
            label: S.guideModes[g],
          }))}
        />
      </Field>
      <Field label={S.refOpacity}>
        <Slider
          value={opacity}
          min={5}
          max={100}
          unit="%"
          disabled={kind === 'off' && guides === 'off'}
          onChange={(v) => setPrefs({ refOpacity: v })}
        />
      </Field>
    </Section>
  );
}

function PlacementFields({ token }: { token: TokenItem | null }) {
  const disabled = !token?.image;
  const v = token?.view;
  return (
    <>
      <Field label={S.zoom}>
        <Slider
          value={Math.round((v?.zoom ?? 1) * 100)}
          min={RANGES.zoom.min}
          max={RANGES.zoom.max}
          unit="%"
          disabled={disabled}
          onChange={gesture.live((z: number) => patchView({ zoom: z / 100 }))}
          onCommit={gesture.commit}
        />
      </Field>
      <Field label={S.rotate}>
        <Slider
          value={Math.round(v?.rotate ?? 0)}
          min={RANGES.rotate.min}
          max={RANGES.rotate.max}
          unit="°"
          disabled={disabled}
          onChange={gesture.live((r: number) => patchView({ rotate: r }))}
          onCommit={gesture.commit}
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          icon={<FlipHorizontal2 />}
          disabled={disabled}
          aria-pressed={!!v?.flip}
          onClick={flipCurrent}
        >
          {v?.flip ? S.flipOn : S.flip}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          icon={<RotateCcw />}
          disabled={disabled}
          onClick={resetView}
        >
          {S.resetView}
        </Button>
      </div>
      <p className="m-0 text-xs text-muted">{S.placementHint}</p>
    </>
  );
}

/* ---------- 出框 ---------- */

export function PopoutTab() {
  const token = useCurrent();
  const look = useLook();
  const toast = useToast();
  const data = useTokenData(token?.image ?? null, token?.mask ?? null);
  const disabled = !token?.image;
  const notify = (
    n: {
      title: string;
      description?: string;
      tone: 'success' | 'warning' | 'danger' | 'info';
    } | null,
  ) => {
    if (n) toast({ title: n.title, description: n.description, tone: n.tone, replace: true });
  };
  const bgRemover = getTool('bg-remover');
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Section title={S.popSection} persistKey="token-maker:pop">
        <p className="m-0 text-sm text-muted">{S.popIntro}</p>
        <p className="m-0 text-sm" data-testid="pop-selection">
          {selectionText(data.mask)}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={disabled}
            onClick={async () => notify(await runAuto())}
          >
            {S.auto}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={disabled}
            onClick={async () => notify(await changeMask('clear'))}
          >
            {S.clear}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon={<Upload />}
            disabled={disabled}
            onClick={async () => {
              const [f] = await pickFiles({ accept: 'image/*' });
              if (f) notify(await loadMaskFile(f));
            }}
          >
            {S.loadMask}
          </Button>
        </div>
        <Field label={S.popOn} layout="inline">
          <Toggle
            checked={!!token?.popOn}
            disabled={disabled}
            onCheckedChange={(v) =>
              editCurrent((t) => {
                t.popOn = v;
              })
            }
          />
        </Field>
        <Field label={S.feather}>
          <Slider
            value={look.feather}
            {...lookSlider('feather')}
            min={RANGES.feather.min}
            max={RANGES.feather.max}
            step={RANGES.feather.step}
            unit="px"
          />
        </Field>
        <Field label={S.shadow} hint={S.shadowHint}>
          <Slider
            value={look.shadow}
            {...lookSlider('shadow')}
            min={RANGES.shadow.min}
            max={RANGES.shadow.max}
            unit="%"
          />
        </Field>
        <Notice tone="info">
          {S.aiHint.split(S.aiLink)[0]}
          {bgRemover ? (
            <a className="text-accent underline" href={hrefToTool(bgRemover)}>
              {S.aiLink}
            </a>
          ) : (
            S.aiLink
          )}
          {S.aiHint.split(S.aiLink)[1]}
        </Notice>
      </Section>
      <Section title={S.marginSection} persistKey="token-maker:margin">
        <Field label={S.autoMargin} hint={S.autoMarginHint} layout="inline">
          <Toggle
            checked={look.autoMargin}
            onCheckedChange={(v) =>
              editLook((l) => {
                if (!v && l.autoMargin) {
                  /* 改成手動時從目前的邊距開始（畫面不跳） */
                  const t = currentToken();
                  l.margin = Math.round(tokenPad(l, t) * 200) / 2;
                }
                l.autoMargin = v;
              })
            }
          />
        </Field>
        <Show when={!look.autoMargin}>
          <Field label={S.margin} hint={S.marginHint}>
            <Slider
              value={look.margin}
              {...lookSlider('margin')}
              min={RANGES.margin.min}
              max={RANGES.margin.max}
              step={RANGES.margin.step}
              unit="%"
            />
          </Field>
        </Show>
      </Section>
    </div>
  );
}

/* ---------- 外框 ---------- */

const frameItems: EffectGridItem<FrameId>[] = FRAME_IDS.map((id) => ({
  value: id,
  label: S.frames[id],
  group: S.frameGroups[FRAMES[id].group as 'relief' | 'neon'],
}));
const customFrameItem: EffectGridItem<FrameId> = {
  value: 'custom',
  label: S.frames.custom,
  group: S.customSection,
};

/** 一排色票（點一下套用；目前的醒目） */
function Swatches({
  items,
  active,
  onPick,
  label,
}: {
  items: { key: string; name: string; background: string }[];
  active: string | null;
  onPick: (key: string) => void;
  label: string;
}) {
  return (
    <fieldset aria-label={label} className="m-0 flex min-w-0 flex-wrap gap-1.5 border-0 p-0">
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          title={it.name}
          aria-label={it.name}
          aria-pressed={active === it.key}
          data-swatch={it.key}
          onClick={() => onPick(it.key)}
          className="size-7 cursor-pointer rounded-md border border-border-strong outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-focus aria-pressed:ring-2 aria-pressed:ring-accent aria-pressed:ring-offset-1 aria-pressed:ring-offset-surface"
          style={{ background: it.background }}
        />
      ))}
    </fieldset>
  );
}

const metalCss = (hex: string) => `linear-gradient(135deg, ${metalStops(hex, 1).join(',')})`;

export function FrameTab() {
  const look = useLook();
  const pal = useImagePalette();
  const notify = useNotice();
  const custom = useDoc((s) => s.data.custom);
  const cdata = useCustomData(custom.frame?.id ?? null, custom.mask?.id ?? null);
  const def = frameDef(look.frame);
  const drawThumb = useCallback(
    (ctx: CanvasRenderingContext2D, id: FrameId) => {
      const k = Math.min(ctx.canvas.width, ctx.canvas.height);
      ctx.save();
      ctx.translate((ctx.canvas.width - k) / 2, (ctx.canvas.height - k) / 2);
      drawFrameThumb(
        ctx,
        { ...look, frame: id, ...(id === look.frame ? {} : paramDefaults(FRAMES[id])) },
        k,
        cdata.frame,
      );
      ctx.restore();
    },
    [look, cdata.frame],
  );
  const gridItems = useMemo(
    () => (custom.frame ? [...frameItems, customFrameItem] : frameItems),
    [custom.frame],
  );
  const imgGrad = useMemo(() => imageGradient(pal), [pal]);
  const colorName =
    look.colorMode === 'gradient'
      ? S.gradientName(S.colorNames[look.colorKey] ?? S.colorNames.custom)
      : (S.colorNames[look.colorKey] ?? S.colorNames.custom);
  const pickSolid = (key: string, hex: string) =>
    editLook((l) => {
      l.colorMode = 'solid';
      l.color = hex;
      l.colorKey = key;
    });
  const pickGradient = (key: string, from: string, to: string, angle: number) =>
    editLook((l) => {
      l.colorMode = 'gradient';
      l.g1 = from;
      l.g2 = to;
      l.gAngle = angle;
      l.colorKey = key;
    });
  const solidActive = look.colorMode === 'solid' ? look.colorKey : null;
  const gradActive = look.colorMode === 'gradient' ? look.colorKey : null;
  const showAccent = def.accent !== 'none';
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <PresetSection />
      <Section title={S.frameSection} persistKey="token-maker:frame">
        <EffectGrid<FrameId>
          aria-label={S.frameSection}
          items={gridItems}
          value={look.frame}
          onValueChange={(v) => v && setFrame(v)}
          draw={drawThumb}
          thumbWidth={96}
          thumbHeight={96}
          animate="none"
          minItemWidth={84}
        />
        {look.frame === 'custom' ? (
          <Field label={S.customInner} hint={S.customInnerHint}>
            <Slider
              value={look.customInner}
              {...lookSlider('customInner')}
              min={RANGES.customInner.min}
              max={RANGES.customInner.max}
              unit="%"
            />
          </Field>
        ) : (
          <Field label={S.frameWidth}>
            <Slider
              value={look.width}
              {...lookSlider('width')}
              min={RANGES.width.min}
              max={RANGES.width.max}
              unit="%"
            />
          </Field>
        )}
        {def.count ? (
          <Field label={S.param[def.count.label]}>
            <Slider
              value={look.count}
              {...lookSlider('count')}
              min={def.count.min}
              max={def.count.max}
            />
          </Field>
        ) : null}
        {def.depth ? (
          <Field label={S.param[def.depth.label]}>
            <Slider value={look.depth} {...lookSlider('depth')} min={0} max={100} unit="%" />
          </Field>
        ) : null}
        {def.lineW ? (
          <Field label={S.param[def.lineW.label]}>
            <Slider
              value={look.lineW}
              {...lookSlider('lineW')}
              min={def.lineW.min}
              max={def.lineW.max}
              step={0.5}
              unit="%"
            />
          </Field>
        ) : null}
      </Section>

      <Section
        title={S.customSection}
        description={S.customHint}
        persistKey="token-maker:custom"
        defaultOpen={false}
      >
        {custom.frame ? (
          <p className="m-0 break-all text-xs text-muted" data-testid="custom-frame-name">
            {S.customFrameName(custom.frame.name)}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            icon={<Upload />}
            data-testid="custom-frame-load"
            onClick={async () => {
              const [f] = await pickFiles({ accept: 'image/*' });
              if (f) notify(await loadCustomFrame(f));
            }}
          >
            {S.customFrameLoad}
          </Button>
          {custom.frame && look.frame !== 'custom' ? (
            <Button size="sm" variant="secondary" onClick={() => setFrame('custom')}>
              {S.customFrameUse}
            </Button>
          ) : null}
          {custom.frame ? (
            <Button
              size="sm"
              variant="ghost"
              icon={<X />}
              onClick={() => {
                setCustomFrame(null);
                notify({ title: S.customFrameCleared, tone: 'info' });
              }}
            >
              {S.customFrameClear}
            </Button>
          ) : null}
        </div>
        {custom.mask ? (
          <p className="m-0 break-all text-xs text-muted" data-testid="custom-mask-name">
            {S.customMaskName(custom.mask.name)}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            icon={<Upload />}
            data-testid="custom-mask-load"
            onClick={async () => {
              const [f] = await pickFiles({ accept: 'image/*' });
              if (f) notify(await loadCustomMaskFile(f));
            }}
          >
            {S.customMaskLoad}
          </Button>
          {custom.mask ? (
            <Button
              size="sm"
              variant="ghost"
              icon={<X />}
              onClick={() => {
                setCustomMask(null);
                notify({ title: S.customMaskCleared, tone: 'info' });
              }}
            >
              {S.customMaskClear}
            </Button>
          ) : null}
        </div>
      </Section>

      <Section
        title={S.colorSection}
        persistKey="token-maker:color"
        actions={
          <span className="text-xs text-muted" data-testid="color-name">
            {colorName}
          </span>
        }
      >
        <Field label={S.autoColor} hint={S.autoColorHint}>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              icon={<Sparkles />}
              data-testid="auto-color-frame"
              onClick={async () => notify(await autoPickColor('frame'))}
            >
              {S.autoColorFrame}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon={<Sparkles />}
              disabled={!showAccent}
              onClick={async () => notify(await autoPickColor('accent'))}
            >
              {S.autoColorAccent}
            </Button>
          </div>
        </Field>
        <Field label={S.colorGroupMetal}>
          <Swatches
            label={S.colorGroupMetal}
            active={solidActive}
            items={METALS.map((m) => ({
              key: m.key,
              name: S.colorNames[m.key],
              background: metalCss(m.hex),
            }))}
            onPick={(k) => pickSolid(k, METALS.find((m) => m.key === k)?.hex ?? look.color)}
          />
        </Field>
        <Field label={S.colorGroupNeon}>
          <Swatches
            label={S.colorGroupNeon}
            active={solidActive}
            items={NEONS.map((m) => ({ key: m.key, name: S.colorNames[m.key], background: m.hex }))}
            onPick={(k) => pickSolid(k, NEONS.find((m) => m.key === k)?.hex ?? look.color)}
          />
        </Field>
        <Field label={S.colorGroupGradient}>
          <Swatches
            label={S.colorGroupGradient}
            active={gradActive}
            items={[
              ...GRADIENTS.map((g) => ({
                key: g.key,
                name: S.gradientName(S.colorNames[g.key]),
                background: `linear-gradient(${g.angle + 90}deg, ${g.from}, ${g.to})`,
              })),
              ...(imgGrad
                ? [
                    {
                      key: 'image',
                      name: S.gradientName(S.colorNames.image),
                      background: `linear-gradient(135deg, ${imgGrad[0]}, ${imgGrad[1]})`,
                    },
                  ]
                : []),
            ]}
            onPick={(k) => {
              if (k === 'image' && imgGrad) pickGradient('image', imgGrad[0], imgGrad[1], 45);
              const g = GRADIENTS.find((x) => x.key === k);
              if (g) pickGradient(g.key, g.from, g.to, g.angle);
            }}
          />
        </Field>
        {look.colorMode === 'solid' ? (
          <Field label={S.customColor}>
            <GestureScope gesture={gesture}>
              <ColorField
                value={look.color}
                swatches={pal}
                onChange={(v) =>
                  editLook((l) => {
                    l.color = v.slice(0, 7).toLowerCase();
                    l.colorKey = 'custom';
                  })
                }
              />
            </GestureScope>
          </Field>
        ) : (
          <>
            <Field label={S.gradientFrom}>
              <GestureScope gesture={gesture}>
                <ColorField
                  value={look.g1}
                  swatches={pal}
                  onChange={(v) =>
                    editLook((l) => {
                      l.g1 = v.slice(0, 7).toLowerCase();
                      l.colorKey = 'custom';
                    })
                  }
                />
              </GestureScope>
            </Field>
            <Field label={S.gradientTo}>
              <GestureScope gesture={gesture}>
                <ColorField
                  value={look.g2}
                  swatches={pal}
                  onChange={(v) =>
                    editLook((l) => {
                      l.g2 = v.slice(0, 7).toLowerCase();
                      l.colorKey = 'custom';
                    })
                  }
                />
              </GestureScope>
            </Field>
            <Field label={S.gradientAngle} hint={S.gradientAngleHint}>
              <Slider value={look.gAngle} {...lookSlider('gAngle')} min={0} max={360} unit="°" />
            </Field>
          </>
        )}
        {showAccent ? (
          <>
            {def.accent === 'optional' ? (
              <Field label={S.accentOn} hint={S.accentOnHint} layout="inline">
                <Toggle
                  checked={look.accentOn}
                  onCheckedChange={(v) =>
                    editLook((l) => {
                      l.accentOn = v;
                    })
                  }
                />
              </Field>
            ) : null}
            <Field label={S.accentColor} hint={def.accent === 'always' ? S.accentHint : undefined}>
              <div className="flex min-w-0 items-center gap-2">
                <GestureScope gesture={gesture}>
                  <ColorField
                    value={look.accent}
                    swatches={pal}
                    disabled={def.accent === 'optional' && !look.accentOn}
                    onChange={(v) =>
                      editLook((l) => {
                        l.accent = v.slice(0, 7).toLowerCase();
                      })
                    }
                  />
                </GestureScope>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<ArrowLeftRight />}
                  title={S.swap}
                  aria-label={S.swap}
                  disabled={
                    look.colorMode !== 'solid' || (def.accent === 'optional' && !look.accentOn)
                  }
                  onClick={() =>
                    editLook((l) => {
                      const a = l.accent;
                      l.accent = l.color;
                      l.color = a;
                      l.colorKey = 'custom';
                    })
                  }
                />
              </div>
            </Field>
          </>
        ) : null}
      </Section>

      <Section title={S.lightSection} persistKey="token-maker:light">
        {look.frame === 'custom' ? (
          <p className="m-0 text-xs text-muted">{S.customNoLight}</p>
        ) : null}
        <Field label={S.lightAngle} hint={S.lightAngleHint}>
          <Slider
            value={look.lightAngle}
            {...lookSlider('lightAngle')}
            min={0}
            max={360}
            unit="°"
          />
        </Field>
        <Field label={S.lightStrength} hint={S.lightStrengthHint}>
          <Slider
            value={look.lightStrength}
            {...lookSlider('lightStrength')}
            min={0}
            max={150}
            unit="%"
          />
        </Field>
      </Section>

      <Section title={S.textureSection} persistKey="token-maker:texture">
        {look.frame === 'custom' ? (
          <p className="m-0 text-xs text-muted">{S.customNoLight}</p>
        ) : null}
        <Field label={S.textureLabel}>
          <Select<TextureId>
            value={look.texture}
            onValueChange={(v) =>
              editLook((l) => {
                l.texture = v;
                if (v !== 'none') l.texAmount = TEXTURE_AMOUNT[v];
              })
            }
            options={TEXTURE_IDS.map((t) => ({ value: t, label: S.textures[t] }))}
            data-testid="texture-select"
          />
        </Field>
        <Show when={look.texture !== 'none'}>
          <TextureStatus look={look} />
          <Field label={S.texAmount}>
            <Slider
              value={look.texAmount}
              {...lookSlider('texAmount')}
              min={RANGES.texAmount.min}
              max={RANGES.texAmount.max}
              unit="%"
            />
          </Field>
          <Field label={S.texScale} hint={S.texScaleHint}>
            <Slider
              value={look.texScale}
              {...lookSlider('texScale')}
              min={RANGES.texScale.min}
              max={RANGES.texScale.max}
              unit="%"
            />
          </Field>
          <Field label={S.texRotate}>
            <Slider
              value={look.texRotate}
              {...lookSlider('texRotate')}
              min={0}
              max={360}
              unit="°"
            />
          </Field>
          <Show when={look.texture === 'energy'}>
            <Field label={S.energyColor}>
              <GestureScope gesture={gesture}>
                <ColorField
                  value={look.energy}
                  onChange={(v) =>
                    editLook((l) => {
                      l.energy = v.slice(0, 7).toLowerCase();
                    })
                  }
                />
              </GestureScope>
            </Field>
          </Show>
          <div>
            <Button
              size="sm"
              variant="secondary"
              icon={<Shuffle />}
              onClick={() =>
                editLook((l) => {
                  l.texSeed = 1 + Math.floor(Math.random() * 9999);
                })
              }
            >
              {S.newPattern}
            </Button>
          </div>
        </Show>
      </Section>

      <Section title={S.glowSection} persistKey="token-maker:glow">
        <Field label={S.glow}>
          <Segmented<GlowMode>
            value={look.glow}
            onValueChange={(v) =>
              editLook((l) => {
                l.glow = v;
              })
            }
            options={GLOW_MODES.map((g) => ({ value: g, label: S.glowModes[g] }))}
          />
        </Field>
        <Field label={S.opacity}>
          <Slider value={look.opacity} {...lookSlider('opacity')} min={0} max={100} unit="%" />
        </Field>
      </Section>
    </div>
  );
}

function paramDefaults(def: FrameDef) {
  return { count: def.count?.def ?? 1, depth: def.depth?.def ?? 50, lineW: def.lineW?.def ?? 10 };
}

function TextureStatus({ look }: { look: Look }) {
  const [, setTick] = useState(0);
  const ready = !!requestTexture(look.texture, look.texSeed);
  useEffect(() => {
    if (ready) return;
    const id = setInterval(() => setTick((t) => t + 1), 200);
    return () => clearInterval(id);
  }, [ready]);
  return ready ? null : (
    <p role="status" className="m-0 text-xs text-muted">
      {S.textureLoading}
    </p>
  );
}

/* ---------- 匯出 ---------- */

export function ExportTab() {
  const token = useCurrent();
  const look = useLook();
  const prefs = usePrefs((s) => s.data);
  const toast = useToast();
  const webp = useWebpSupport();
  const [busy, setBusy] = useState(false);
  /* 圖片、遮罩讀好時重算邊距與清晰度 */
  useTokenData(token?.image ?? null, token?.mask ?? null);
  const N = exportSizeOf(prefs);
  const pad = tokenPad(look, token);
  const sharp = token?.image ? sharpSize(token.image, token.view.zoom, pad) : 0;
  const format = prefs.format === 'webp' && webp ? 'webp' : 'png';
  const fileName = token ? tokenFileName(token, N, format) : '';

  const embed = format === 'png' && prefs.embed;
  const download = async () => {
    if (!token?.image || busy) return;
    setBusy(true);
    try {
      const blob = await renderTokenBlob(token, look, N, format, { embed });
      downloadBlob(blob, fileName);
      toast({ title: S.downloaded(fileName), tone: 'success', replace: true });
    } catch {
      toast({ title: S.exportFailed, tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    if (!token?.image) return;
    const r = await copyImage(renderTokenBlob(token, look, N, 'png'));
    toast(
      r.ok
        ? { title: S.copied, tone: 'success', replace: true }
        : { title: S.copyFailed, tone: 'warning' },
    );
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Section title={S.sizeSection} persistKey="token-maker:size">
        <Field label={S.sizeLabel}>
          <Select<string>
            value={String(prefs.sizeChoice)}
            onValueChange={(v) => setPrefs({ sizeChoice: v === 'custom' ? 'custom' : Number(v) })}
            options={[
              ...SIZE_PRESETS.map((n) => ({
                value: String(n),
                label: `${S.sizeOption(n)}${sharp && n > sharp * 1.05 ? S.upscaled : ''}`,
              })),
              { value: 'custom', label: S.sizeCustom },
            ]}
            data-testid="size-select"
          />
        </Field>
        <Show when={prefs.sizeChoice === 'custom'}>
          <Field label={S.customSize}>
            <NumberInput
              value={prefs.customSize}
              min={CUSTOM_SIZE.min}
              max={CUSTOM_SIZE.max}
              unit="px"
              onChange={(v) => setPrefs({ customSize: Math.round(v) })}
            />
          </Field>
        </Show>
        {token?.image ? (
          <p className="m-0 text-xs text-muted" data-testid="sharp-note">
            {sharp >= 2048 ? S.sharpOk : S.sharpUpTo(sharp)}
          </p>
        ) : null}
        <Field label={S.formatLabel} hint={!webp ? S.webpUnsupported : undefined}>
          <Segmented
            value={format}
            onValueChange={(v) => setPrefs({ format: v })}
            options={[
              { value: 'png', label: S.formatPng },
              { value: 'webp', label: S.formatWebp, disabled: !webp },
            ]}
          />
        </Field>
        <Field label={S.embed} hint={S.embedHint} layout="inline">
          <Toggle
            checked={prefs.embed}
            disabled={format !== 'png'}
            onCheckedChange={(v) => setPrefs({ embed: v })}
          />
        </Field>
      </Section>
      {!token?.image ? <Notice tone="info">{S.noImageExport}</Notice> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          icon={<Download />}
          loading={busy}
          disabled={!token?.image}
          onClick={download}
        >
          {format === 'webp' ? S.downloadWebp : S.download}
        </Button>
        <Button variant="secondary" icon={<Copy />} disabled={!token?.image} onClick={copy}>
          {S.copy}
        </Button>
      </div>
      {token?.image ? (
        <p className="m-0 break-all text-xs text-muted" data-testid="file-name">
          {S.fileNameRule(fileName)}
        </p>
      ) : null}
      <BatchExport N={N} format={format} embed={embed} />
      {token?.image ? <TableSize token={token} /> : null}
    </div>
  );
}

/** 全部打包、編號組（ZIP） */
function BatchExport({ N, format, embed }: { N: number; format: 'png' | 'webp'; embed: boolean }) {
  const tokens = useDoc((s) => s.data.tokens);
  const token = useCurrent();
  const setCount = usePrefs((s) => s.data.setCount);
  const toast = useToast();
  const [progress, setProgress] = useState<{ kind: 'all' | 'set'; i: number; n: number } | null>(
    null,
  );
  const ready = tokens.filter((t) => t.image).length;
  const run = async (kind: 'all' | 'set') => {
    if (progress) return;
    const look = docNow().look;
    const list = docNow().tokens;
    const cur = currentToken();
    const jobs =
      kind === 'all'
        ? zipAllJobs(list, N, format)
        : cur?.image
          ? setJobs(cur, setCount, N, format)
          : [];
    if (!jobs.length) return;
    const name = kind === 'all' ? allZipName(N) : setZipName(cur as TokenItem, setCount, N);
    setProgress({ kind, i: 0, n: jobs.length });
    try {
      const blob = await zipTokens(jobs, look, N, format, embed, (i, n) =>
        setProgress({ kind, i, n }),
      );
      downloadBlob(blob, name);
      toast({ title: S.zipDone(name), tone: 'success', replace: true });
    } catch {
      toast({ title: S.exportFailed, tone: 'danger' });
    } finally {
      setProgress(null);
    }
  };
  return (
    <Section title={S.batchSection} persistKey="token-maker:batch">
      <p className="m-0 text-xs text-muted">{S.zipAllHint}</p>
      <div>
        <Button
          variant="secondary"
          icon={<FileArchive />}
          loading={progress?.kind === 'all'}
          disabled={!ready || (!!progress && progress.kind !== 'all')}
          data-testid="zip-all"
          onClick={() => void run('all')}
        >
          {progress?.kind === 'all' ? S.zipProgress(progress.i, progress.n) : S.zipAll(ready)}
        </Button>
      </div>
      <p className="m-0 text-xs text-muted">{S.zipSetHint}</p>
      <Field label={S.setCount}>
        <NumberInput
          value={setCount}
          min={RANGES.setCount.min}
          max={RANGES.setCount.max}
          onChange={(v) => setPrefs({ setCount: Math.round(v) })}
        />
      </Field>
      <div>
        <Button
          variant="secondary"
          icon={<FileArchive />}
          loading={progress?.kind === 'set'}
          disabled={!token?.image || (!!progress && progress.kind !== 'set')}
          data-testid="zip-set"
          onClick={() => void run('set')}
        >
          {progress?.kind === 'set' ? S.zipProgress(progress.i, progress.n) : S.zipSet(setCount)}
        </Button>
      </div>
    </Section>
  );
}

const TABLE_SIZES = [96, 64, 40] as const;

/** 實際大小的預覽（96、64、40 px） */
function TableSize({ token }: { token: TokenItem }) {
  const look = useLook();
  const data = useTokenData(token.image, token.mask);
  const custom = useDoc((s) => s.data.custom);
  const cdata = useCustomData(custom.frame?.id ?? null, custom.mask?.id ?? null);
  const refs = useRef<(HTMLCanvasElement | null)[]>([]);
  const loaded = useLoadedTokens(
    useMemo(() => [token], [token]),
    look.feather,
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: 小圖、遮罩讀好時（loaded）重畫
  useEffect(() => {
    if (!data.work) return;
    const N = 192;
    const big = document.createElement('canvas');
    big.width = big.height = N;
    const ctx = big.getContext('2d');
    if (!ctx) return;
    drawTokenThumb(ctx, token, look, N, {
      frame: cdata.frame,
      frameId: custom.frame?.id ?? null,
      mask: cdata.mask,
    });
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    refs.current.forEach((c, i) => {
      if (!c) return;
      const px = Math.round(TABLE_SIZES[i] * dpr);
      c.width = c.height = px;
      const x = c.getContext('2d');
      if (!x) return;
      x.imageSmoothingQuality = 'high';
      x.drawImage(big, 0, 0, px, px);
    });
  }, [data.work, loaded, look, token, cdata.frame, cdata.mask, custom.frame]);
  return (
    <Section title={S.tableSize} description={S.tableSizeHint} persistKey="token-maker:table">
      <div className="checker flex flex-wrap items-end gap-4 rounded-md p-3">
        {TABLE_SIZES.map((s, i) => (
          <figure key={s} className="m-0 flex flex-col items-center gap-1 text-xs text-muted">
            <canvas
              ref={(el) => {
                refs.current[i] = el;
              }}
              style={{ width: s, height: s }}
            />
            {S.tableSizes[s]}
          </figure>
        ))}
      </div>
    </Section>
  );
}
