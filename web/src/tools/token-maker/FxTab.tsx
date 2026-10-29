/**
 * 「效果」分頁（eidolon-ui 的 FX）：總開關、色調、故障、RGB 分離、顆粒、暗角、掃描線、重設。所有棋子共用（存在外觀裡）。
 */
import { RotateCcw, Shuffle } from 'lucide-react';
import {
  Button,
  ColorField,
  Field,
  GestureScope,
  Section,
  Segmented,
  Show,
  Slider,
  Toggle,
} from '@/ui';
import { DEFAULT_FX, type Fx, RANGES, TONE_MODES, type ToneMode } from './model';
import { editLook, gesture, useDoc } from './store';
import { S } from './strings';

type NumKey = { [K in keyof Fx]: Fx[K] extends number ? K : never }[keyof Fx];
type BoolKey = 'glitch' | 'rgb' | 'grain' | 'vig' | 'scan';

function fxSlider(key: NumKey) {
  return {
    onChange: gesture.live((v: number) =>
      editLook((l) => {
        l.fx[key] = v;
      }),
    ),
    onCommit: gesture.commit,
  };
}

function setFx<K extends keyof Fx>(key: K, v: Fx[K]) {
  editLook((l) => {
    l.fx[key] = v;
    /* 打開任何一個效果時順便打開總開關 */
    if (key !== 'on' && v === true) l.fx.on = true;
  });
}

function FxToggle({ k, label }: { k: BoolKey; label: string }) {
  const on = useDoc((s) => s.data.look.fx[k]);
  return (
    <Field label={label} layout="inline">
      <Toggle checked={on} onCheckedChange={(v) => setFx(k, v)} />
    </Field>
  );
}

export function FxTab() {
  const fx = useDoc((s) => s.data.look.fx);
  const off = !fx.on;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Section title={S.fxSection} description={S.fxHint} persistKey="token-maker:fx">
        <Field label={S.fxOn} layout="inline">
          <Toggle checked={fx.on} onCheckedChange={(v) => setFx('on', v)} />
        </Field>
        <div className={off ? 'flex flex-col gap-3 opacity-60' : 'flex flex-col gap-3'}>
          <Field label={S.tone} hint={S.toneHint}>
            <Segmented<ToneMode>
              value={fx.tone}
              onValueChange={(v) =>
                editLook((l) => {
                  l.fx.tone = v;
                  if (v !== 'none') l.fx.on = true;
                })
              }
              options={TONE_MODES.map((v) => ({ value: v, label: S.tones[v] }))}
            />
          </Field>
          <Show when={fx.tone !== 'none'}>
            <Field label={S.toneMix}>
              <Slider
                value={fx.toneMix}
                {...fxSlider('toneMix')}
                min={RANGES.toneMix.min}
                max={RANGES.toneMix.max}
                unit="%"
              />
            </Field>
          </Show>

          <FxToggle k="glitch" label={S.glitch} />
          <Show when={fx.glitch}>
            <Field label={S.glitchAmt}>
              <Slider
                value={fx.glitchAmt}
                {...fxSlider('glitchAmt')}
                min={RANGES.glitchAmt.min}
                max={RANGES.glitchAmt.max}
                unit="%"
              />
            </Field>
            <div>
              <Button
                size="sm"
                variant="secondary"
                icon={<Shuffle />}
                onClick={() =>
                  editLook((l) => {
                    l.fx.glitchSeed = 1 + Math.floor(Math.random() * 9999);
                  })
                }
              >
                {S.glitchReseed}
              </Button>
            </div>
          </Show>

          <FxToggle k="rgb" label={S.rgb} />
          <Show when={fx.rgb}>
            <Field label={S.rgbAmt}>
              <Slider
                value={fx.rgbAmt}
                {...fxSlider('rgbAmt')}
                min={RANGES.rgbAmt.min}
                max={RANGES.rgbAmt.max}
                unit="px"
              />
            </Field>
          </Show>

          <FxToggle k="grain" label={S.grain} />
          <Show when={fx.grain}>
            <Field label={S.grainAmt}>
              <Slider
                value={fx.grainAmt}
                {...fxSlider('grainAmt')}
                min={RANGES.grainAmt.min}
                max={RANGES.grainAmt.max}
                unit="%"
              />
            </Field>
          </Show>

          <FxToggle k="vig" label={S.vig} />
          <Show when={fx.vig}>
            <Field label={S.vigColor}>
              <GestureScope gesture={gesture}>
                <ColorField
                  value={fx.vigColor}
                  onChange={(v) =>
                    editLook((l) => {
                      l.fx.vigColor = v.slice(0, 7).toLowerCase();
                    })
                  }
                />
              </GestureScope>
            </Field>
            <Field label={S.vigAmt}>
              <Slider
                value={fx.vigAmt}
                {...fxSlider('vigAmt')}
                min={RANGES.vigAmt.min}
                max={RANGES.vigAmt.max}
                unit="%"
              />
            </Field>
          </Show>

          <FxToggle k="scan" label={S.scan} />
          <Show when={fx.scan}>
            <Field label={S.scanAmt}>
              <Slider
                value={fx.scanAmt}
                {...fxSlider('scanAmt')}
                min={RANGES.scanAmt.min}
                max={RANGES.scanAmt.max}
                unit="%"
              />
            </Field>
            <Field label={S.scanGap}>
              <Slider
                value={fx.scanGap}
                {...fxSlider('scanGap')}
                min={RANGES.scanGap.min}
                max={RANGES.scanGap.max}
                unit="px"
              />
            </Field>
          </Show>
        </div>
        <div>
          <Button
            size="sm"
            variant="secondary"
            icon={<RotateCcw />}
            data-testid="fx-reset"
            onClick={() =>
              editLook((l) => {
                l.fx = { ...DEFAULT_FX };
              })
            }
          >
            {S.fxReset}
          </Button>
        </div>
      </Section>
    </div>
  );
}
