/**
 * 設定欄 2026-11-10 加的區塊（規格 1.11～1.17）：樣子（一鍵套用）、映像管（螢光粉遮罩、光暈）、數位攝影、NTSC 訊號、Screen Loop。
 * 預設全關；每一個開關、選項改一次算一步復原，滑桿放開才算一步。
 */
import {
  AdvancedToggle,
  Button,
  Field,
  Section,
  Segmented,
  Select,
  Slider,
  Toggle,
  useAdvancedMode,
} from '@/ui';
import {
  CRT_RANGES,
  DIGITAL_CODECS,
  DIGITAL_FORMATS,
  DIGITAL_PRESETS,
  DIGITAL_RANGES,
  type DigitalCodec,
  type DigitalFormat,
  LOOP_RANGES,
  MASK_KINDS,
  type MaskKind,
  NTSC_RANGES,
  TAPE_SPEEDS,
} from './look';
import { fieldScanRows } from './model';
import type { TapeSpeed } from './ntsc';
import { applyLookPreset, LOOK_PRESET_IDS, matchingPreset } from './presets';
import { edit, gesture, TOOL_ID, useDoc } from './store';
import { S } from './strings';

type Range = { readonly min: number; readonly max: number };

/** 整數的滑桿（拖曳中即時套用、放開才記一步）；scale：顯示的值＝存的值 ÷ scale */
function NumSlider({
  label,
  hint,
  value,
  range,
  unit,
  scale = 1,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  range: Range;
  unit?: string;
  scale?: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <Field label={label} hint={hint}>
      <Slider
        value={value / scale}
        min={range.min / scale}
        max={range.max / scale}
        step={1 / scale}
        precision={scale > 1 ? Math.round(Math.log10(scale)) : 0}
        unit={unit}
        disabled={disabled}
        onChange={gesture.live((v: number) => onChange(Math.round(v * scale)))}
        onCommit={gesture.commit}
      />
    </Field>
  );
}

function Switch({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Field label={label} layout="inline" hint={hint}>
      <Toggle checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </Field>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
      <legend className="mb-1 p-0 text-sm font-medium text-fg">{title}</legend>
      {children}
    </fieldset>
  );
}

/* ---------- 樣子 ---------- */

export function LooksSection() {
  const s = useDoc((st) => st.data);
  const active = matchingPreset(s);
  return (
    <Section title={S.sectionLooks} description={S.looksHint} persistKey="vhs-frame:looks">
      <div className="grid grid-cols-2 gap-2" data-testid="look-presets">
        {LOOK_PRESET_IDS.map((id) => (
          <Button
            key={id}
            variant={active === id ? 'primary' : 'secondary'}
            aria-pressed={active === id}
            title={S.lookDesc[id]}
            onClick={() => edit((d) => applyLookPreset(d, id))}
            className="h-auto min-h-8 min-w-0 justify-start whitespace-normal py-1 text-left"
          >
            {S.lookNames[id]}
          </Button>
        ))}
      </div>
    </Section>
  );
}

/* ---------- 映像管 ---------- */

export function CrtSection() {
  const crt = useDoc((st) => st.data.crt);
  const set = (recipe: (c: typeof crt) => void) => edit((d) => recipe(d.crt));
  const on = crt.mask !== 'none';
  return (
    <Section title={S.sectionCrt} persistKey="vhs-frame:crt" defaultOpen={false}>
      <Field label={S.mask} hint={S.maskHint}>
        <Segmented<MaskKind>
          value={crt.mask}
          onValueChange={(v) =>
            set((c) => {
              c.mask = v;
            })
          }
          options={MASK_KINDS.map((k) => ({
            value: k,
            label: S.maskKinds[k],
            ariaLabel: S.maskAria[k],
          }))}
          fullWidth
        />
      </Field>
      {on ? (
        <>
          <NumSlider
            label={S.maskStrength}
            value={crt.maskStrength}
            range={CRT_RANGES.maskStrength}
            unit="%"
            onChange={(v) =>
              set((c) => {
                c.maskStrength = v;
              })
            }
          />
          <NumSlider
            label={S.maskSize}
            hint={S.maskSizeHint}
            value={crt.maskSize}
            range={CRT_RANGES.maskSize}
            unit="px"
            onChange={(v) =>
              set((c) => {
                c.maskSize = v;
              })
            }
          />
          <Switch
            label={S.maskBoost}
            hint={S.maskBoostHint}
            checked={crt.maskBoost}
            onChange={(v) =>
              set((c) => {
                c.maskBoost = v;
              })
            }
          />
        </>
      ) : null}
      <NumSlider
        label={S.glow}
        hint={S.glowHint}
        value={crt.glow}
        range={CRT_RANGES.glow}
        unit="%"
        onChange={(v) =>
          set((c) => {
            c.glow = v;
          })
        }
      />
      {crt.glow > 0 ? (
        <NumSlider
          label={S.glowSize}
          value={crt.glowSize}
          range={CRT_RANGES.glowSize}
          unit="%"
          onChange={(v) =>
            set((c) => {
              c.glowSize = v;
            })
          }
        />
      ) : null}
    </Section>
  );
}

/* ---------- 數位攝影 ---------- */

export function DigitalSection() {
  const dg = useDoc((st) => st.data.digital);
  const aspect = useDoc((st) => st.data.aspect);
  const [more] = useAdvancedMode(TOOL_ID);
  /* 方塊色沒有色彩取樣、柔化方塊的邊與 datamosh（藏起來；存的值不改） */
  const dct = dg.codec === 'dct';
  const set = (recipe: (c: typeof dg) => void) => edit((d) => recipe(d.digital));
  const slider = (
    key: keyof typeof DIGITAL_RANGES,
    label: string,
    opts: { hint?: string; unit?: string; scale?: number } = {},
  ) => (
    <NumSlider
      label={label}
      hint={opts.hint}
      value={dg[key] as number}
      range={DIGITAL_RANGES[key]}
      unit={opts.unit ?? '%'}
      scale={opts.scale}
      onChange={(v) =>
        set((c) => {
          (c[key] as number) = v;
        })
      }
    />
  );
  return (
    <Section title={S.sectionDigital} persistKey="vhs-frame:digital" defaultOpen={false}>
      <Switch
        label={S.digitalOn}
        hint={S.digitalHint}
        checked={dg.on}
        onChange={(v) =>
          set((c) => {
            c.on = v;
          })
        }
      />
      {dg.on ? (
        <>
          <Field label={S.digitalFormat} hint={S.digitalFormatDesc[dg.format]}>
            <Segmented<DigitalFormat>
              value={dg.format}
              onValueChange={(v) =>
                set((c) => {
                  Object.assign(c, DIGITAL_PRESETS[v]);
                  c.format = v;
                })
              }
              options={DIGITAL_FORMATS.map((f) => ({ value: f, label: S.digitalFormats[f] }))}
              columns={3}
            />
          </Field>
          {/* 2026-11-12：壓縮優先（NTSCRT 的順序：壓縮、擷取、相機） */}
          <Group title={S.digitalCompress}>
            <Field label={S.digitalCodec} hint={S.digitalCodecDesc[dg.codec]}>
              <Segmented<DigitalCodec>
                value={dg.codec}
                onValueChange={(v) =>
                  set((c) => {
                    c.codec = v;
                  })
                }
                options={DIGITAL_CODECS.map((k) => ({ value: k, label: S.digitalCodecs[k] }))}
                fullWidth
              />
            </Field>
            {slider('quality', S.quality, { hint: dct ? S.qualityHint : S.qualityHintVideo1 })}
            {slider('keyframe', S.keyframe, {
              hint: `${dct ? S.keyframeHint : S.keyframeHintVideo1}${S.keyframeSlow}`,
              unit: S.keyframeUnit,
              scale: 10,
            })}
            {slider('loss', S.loss, { hint: S.lossHint })}
            {dct ? slider('mosh', S.mosh, { hint: S.moshHint }) : null}
          </Group>
          <Group title={S.digitalCapture}>
            <Switch
              label={S.interlace}
              hint={S.interlaceHint}
              checked={dg.interlace}
              onChange={(v) =>
                set((c) => {
                  c.interlace = v;
                })
              }
            />
            {dg.interlace ? (
              <Switch
                label={S.fieldScan}
                hint={S.fieldScanHint(fieldScanRows({ digital: dg, aspect }))}
                checked={dg.fieldScan}
                onChange={(v) =>
                  set((c) => {
                    c.fieldScan = v;
                  })
                }
              />
            ) : null}
            {slider('alias', S.alias, { hint: S.aliasHint })}
            {slider('rainbow', S.rainbow, { hint: S.rainbowHint })}
            {slider('noise', S.sensorNoise)}
            {slider('lowLight', S.lowLight, { hint: S.lowLightHint })}
          </Group>
          <Group title={S.digitalCamera}>
            {slider('ccd', S.ccd, { hint: S.ccdHint })}
            {slider('exposure', S.exposure, { unit: S.exposureUnit, scale: 100 })}
            {slider('warmth', S.warmth, { hint: S.warmthHint })}
            {slider('saturation', S.digitalSaturation)}
            {slider('black', S.black, { hint: S.blackHint })}
            {slider('sharpen', S.sharpen)}
            {dg.sharpen > 0 ? slider('halo', S.halo, { hint: S.haloHint, unit: 'px' }) : null}
          </Group>
          <AdvancedToggle toolId={TOOL_ID} label={S.advanced} />
          {more ? (
            <>
              {slider('width', S.captureWidth, { unit: 'px' })}
              {slider('fps', S.fps, { unit: '' })}
              {dct ? (
                <Field label={S.chromaSub}>
                  <Select
                    value={String(dg.chroma)}
                    onValueChange={(v) =>
                      set((c) => {
                        c.chroma = Number(v);
                      })
                    }
                    options={S.chromaSubs.map((label, i) => ({ value: String(i), label }))}
                  />
                </Field>
              ) : null}
              {slider('lens', S.lens)}
              {slider('denoise', S.denoise)}
              {slider('tint', S.tint, { hint: S.tintHint })}
              {dct ? slider('blockSmooth', S.blockSmooth) : null}
            </>
          ) : null}
        </>
      ) : null}
    </Section>
  );
}

/* ---------- NTSC 訊號 ---------- */

export function NtscSection() {
  const n = useDoc((st) => st.data.ntsc);
  const set = (recipe: (c: typeof n) => void) => edit((d) => recipe(d.ntsc));
  const slider = (key: keyof typeof NTSC_RANGES, label: string, hint?: string, unit = '%') => (
    <NumSlider
      label={label}
      hint={hint}
      value={n[key]}
      range={NTSC_RANGES[key]}
      unit={unit}
      onChange={(v) =>
        set((c) => {
          c[key] = v;
        })
      }
    />
  );
  const sw = (key: 'headSwitch' | 'tracking' | 'ringing', label: string) => (
    <Switch
      label={label}
      checked={n[key]}
      onChange={(v) =>
        set((c) => {
          c[key] = v;
        })
      }
    />
  );
  return (
    <Section title={S.sectionNtsc} persistKey="vhs-frame:ntsc" defaultOpen={false}>
      <Switch
        label={S.ntscOn}
        hint={S.ntscHint}
        checked={n.on}
        onChange={(v) =>
          set((c) => {
            c.on = v;
          })
        }
      />
      {n.on ? (
        <>
          <Field label={S.tape} hint={S.tapeHint}>
            <Segmented<TapeSpeed>
              value={n.tape}
              onValueChange={(v) =>
                set((c) => {
                  c.tape = v;
                })
              }
              options={TAPE_SPEEDS.map((t) => ({ value: t, label: S.tapes[t] }))}
              columns={2}
            />
          </Field>
          {slider('smear', S.smear)}
          {slider('bleed', S.bleed, S.bleedHint, '')}
          {slider('noise', S.signalNoise)}
          {slider('snow', S.snow)}
          {slider('wave', S.wave)}
          {slider('loss', S.chromaLoss, S.chromaLossHint)}
          {sw('headSwitch', S.headSwitch)}
          {sw('tracking', S.tracking)}
          {sw('ringing', S.ringing)}
        </>
      ) : null}
    </Section>
  );
}

/* ---------- Screen Loop ---------- */

export function LoopSection() {
  const l = useDoc((st) => st.data.loop);
  const hasPhoto = useDoc((st) => !!st.data.photo);
  const set = (recipe: (c: typeof l) => void) => edit((d) => recipe(d.loop));
  const slider = (
    key: keyof typeof LOOP_RANGES,
    label: string,
    opts: { hint?: string; unit?: string } = {},
  ) => (
    <NumSlider
      label={label}
      hint={opts.hint}
      value={l[key]}
      range={LOOP_RANGES[key]}
      unit={opts.unit ?? '%'}
      onChange={(v) =>
        set((c) => {
          c[key] = v;
        })
      }
    />
  );
  return (
    <Section title={S.sectionLoop} persistKey="vhs-frame:loop" defaultOpen={false}>
      <Switch
        label={S.loopOn}
        hint={hasPhoto ? S.loopOnHint : `${S.loopOnHint}${S.loopNeedsPhoto}`}
        checked={l.on}
        onChange={(v) =>
          set((c) => {
            c.on = v;
          })
        }
      />
      {l.on ? (
        <>
          {slider('depth', S.depth, { hint: S.loopCost(l.depth), unit: '' })}
          {slider('zoom', S.loopZoom)}
          <Field label={S.vanish} hint={S.vanishText(l.cx, l.cy)}>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={l.cx === 0 && l.cy === 0}
                onClick={() =>
                  set((c) => {
                    c.cx = 0;
                    c.cy = 0;
                  })
                }
              >
                {S.vanishReset}
              </Button>
            </div>
          </Field>
          {slider('roll', S.roll, { hint: S.rollHint, unit: S.degree })}
          {slider('shake', S.shake)}
          {slider('push', S.push, { hint: S.pushHint })}
          {slider('spin', S.spin, { hint: S.spinHint, unit: S.degree })}
          {slider('soft', S.soft)}
          {slider('color', S.loopColor, { hint: S.loopColorHint })}
          {slider('gain', S.gain, { hint: S.gainHint })}
          {slider('key', S.key, { hint: S.keyHint })}
          {l.key > 0 ? (
            <Switch
              label={S.keyInvert}
              hint={S.keyInvertHint}
              checked={l.keyInvert}
              onChange={(v) =>
                set((c) => {
                  c.keyInvert = v;
                })
              }
            />
          ) : null}
          <Switch
            label={S.seamless}
            hint={S.seamlessHint}
            checked={l.seamless}
            onChange={(v) =>
              set((c) => {
                c.seamless = v;
              })
            }
          />
        </>
      ) : null}
    </Section>
  );
}
