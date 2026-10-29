/**
 * 設定欄的四個分頁：圖片（讀圖、名稱、擺放、背景）、出框（選取、柔邊、陰影、邊距）、
 * 外框（樣式、顏色、光照、質感、光暈）、匯出（尺寸、格式、下載、複製、實際大小）。
 */
import {
  ArrowLeftRight,
  Copy,
  Download,
  FlipHorizontal2,
  RotateCcw,
  Shuffle,
  Upload,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { copyImage, downloadBlob, pickFiles } from '@/core/files';
import { getTool, hrefToTool } from '@/registry';
import {
  Button,
  ColorField,
  EffectGrid,
  type EffectGridItem,
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
  TextInput,
  Toggle,
  useToast,
  useWebpSupport,
} from '@/ui';
import {
  changeMask,
  loadMaskFile,
  renderTokenBlob,
  runAuto,
  selectionText,
  tokenFileName,
} from './actions';
import { FRAMES, type FrameDef, frameDef, metalStops } from './frames';
import {
  type BgMode,
  CUSTOM_SIZE,
  FRAME_IDS,
  type FrameId,
  GLOW_MODES,
  type GlowMode,
  GRADIENTS,
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
import { drawFrameThumb, renderToken } from './render';
import { imageGradient, imagePalette, peekMask, softMaskCanvas, useTokenData } from './sources';
import {
  currentToken,
  editCurrent,
  editLook,
  exportSizeOf,
  flipCurrent,
  gesture,
  patchView,
  resetView,
  setFrame,
  setPrefs,
  tokenPad,
  useDoc,
  usePrefs,
} from './store';
import { S } from './strings';
import { requestTexture } from './textures';

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

/** 圖片的代表色（每個顏色欄旁的快速色票） */
function useImagePalette(): string[] {
  const token = useCurrent();
  const data = useTokenData(token?.image ?? null, null);
  return useMemo(() => (data.work ? imagePalette(data.work.work) : []), [data.work]);
}

/* ---------- 圖片 ---------- */

export function ImageTab({ onFiles }: { onFiles: (files: File[]) => void }) {
  const token = useCurrent();
  const look = useLook();
  const autoDetect = usePrefs((s) => s.data.autoDetect);
  const pal = useImagePalette();
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <ImageDrop
        aria-label={S.dropArea}
        onFiles={onFiles}
        label={S.dropLabel}
        buttonLabel={S.dropButton}
        hint={S.dropHint}
        compact={!!token?.image}
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
      {token ? <NameField token={token} /> : null}
      <Section title={S.placement} persistKey="token-maker:placement">
        <PlacementFields token={token} />
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
    </div>
  );
}

function NameField({ token }: { token: TokenItem }) {
  return (
    <Field label={S.nameLabel} hint={S.nameHint}>
      <TextInput
        value={token.name}
        maxLength={40}
        placeholder={S.namePlaceholder}
        data-testid="token-name"
        onFocus={gesture.begin}
        onBlur={gesture.commit}
        onChange={(e) => {
          const v = e.target.value;
          editCurrent((t) => {
            t.name = v;
          });
        }}
      />
    </Field>
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
                  l.margin =
                    Math.round(
                      tokenPad(l, t, t?.mask ? (peekMask(t.mask.id) ?? null) : null) * 200,
                    ) / 2;
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
  group: S.frameGroups[FRAMES[id].group],
}));

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
      );
      ctx.restore();
    },
    [look],
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
      <Section title={S.frameSection} persistKey="token-maker:frame">
        <EffectGrid<FrameId>
          aria-label={S.frameSection}
          items={frameItems}
          value={look.frame}
          onValueChange={(v) => v && setFrame(v)}
          draw={drawThumb}
          thumbWidth={96}
          thumbHeight={96}
          animate="none"
          minItemWidth={84}
        />
        <Field label={S.frameWidth}>
          <Slider
            value={look.width}
            {...lookSlider('width')}
            min={RANGES.width.min}
            max={RANGES.width.max}
            unit="%"
          />
        </Field>
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
        title={S.colorSection}
        persistKey="token-maker:color"
        actions={
          <span className="text-xs text-muted" data-testid="color-name">
            {colorName}
          </span>
        }
      >
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
  const data = useTokenData(token?.image ?? null, token?.mask ?? null);
  const N = exportSizeOf(prefs);
  const pad = tokenPad(look, token, data.mask);
  const sharp = token?.image ? sharpSize(token.image, token.view.zoom, pad) : 0;
  const format = prefs.format === 'webp' && webp ? 'webp' : 'png';
  const fileName = token ? tokenFileName(token, N, format) : '';

  const download = async () => {
    if (!token?.image || busy) return;
    setBusy(true);
    try {
      const blob = await renderTokenBlob(token, look, N, format);
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
      {token?.image ? <TableSize token={token} /> : null}
    </div>
  );
}

const TABLE_SIZES = [96, 64, 40] as const;

/** 實際大小的預覽（96、64、40 px） */
function TableSize({ token }: { token: TokenItem }) {
  const look = useLook();
  const data = useTokenData(token.image, token.mask);
  const refs = useRef<(HTMLCanvasElement | null)[]>([]);
  useEffect(() => {
    if (!data.work) return;
    const N = 192;
    const big = document.createElement('canvas');
    big.width = big.height = N;
    const ctx = big.getContext('2d');
    if (!ctx) return;
    renderToken(
      ctx,
      { N, pad: tokenPad(look, token, data.mask), look, token, cacheFrame: false },
      {
        image: data.work.bitmap,
        size: token.image,
        popMask: data.mask && token.popOn ? softMaskCanvas(data.mask, look.feather) : null,
        texture: requestTexture(look.texture, look.texSeed),
      },
    );
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
  }, [data.work, data.mask, look, token]);
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
