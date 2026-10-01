/** 「樣式」分頁：文字風格、字型、副文字、塗色、外框、陰影、光暈 */
import { gradientToCss } from '@/core/gradient';
import {
  availableWeights,
  Field,
  FontPicker,
  GradientField,
  Section,
  Select,
  Toggle,
  WEIGHT_LABELS,
} from '@/ui';
import {
  ColorPathField,
  NumField,
  OptionalColorField,
  SegField,
  ToggleField,
  useCfg,
} from '../controls';
import { GRADIENT_KITS, STYLE_KITS } from '../library';
import { deepClone, deepMerge, evenStops, type Settings } from '../settings';
import { updateCfg } from '../store';
import { S } from '../strings';

function kitSwatch(patch: Record<string, unknown>) {
  const fill = patch.fill as Settings['fill'];
  const stroke = patch.stroke as Settings['stroke'];
  const glow = patch.glow as Settings['glow'];
  const background =
    fill.mode === 'gradient'
      ? gradientToCss({ kind: 'linear', angle: 180, stops: fill.stops })
      : fill.color;
  return {
    background,
    opacity: fill.opacity === 0 ? 0.15 : 1,
    outline: `2px solid ${stroke.on ? stroke.color : 'transparent'}`,
    boxShadow: glow.on ? `0 0 8px ${glow.color}` : undefined,
  };
}

function SwatchButton({
  label,
  style,
  onClick,
  title,
}: {
  label: string;
  style: React.CSSProperties;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-surface-2 px-2 py-1.5 text-left text-sm text-fg hover:border-accent"
    >
      <i aria-hidden className="block size-4 shrink-0 rounded-sm" style={style} />
      <span className="truncate">{label}</span>
    </button>
  );
}

export function StylePanel() {
  const c = useCfg();
  const isLong = c.mode === 'long';
  const hasSub = !!c.sub.trim();
  const sameSubFont = !c.subFont;
  const subBase = c.subFont ?? c.font;

  return (
    <div className="flex flex-col gap-3">
      <Section title={S.style.kits} persistKey="text-fx:kits">
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {STYLE_KITS.map((k) => (
            <SwatchButton
              key={k.id}
              label={k.name}
              title={`套用「${k.name}」：塗色、外框、陰影、光暈`}
              style={kitSwatch(k.patch)}
              onClick={() => updateCfg((s) => deepMerge(s, deepClone(k.patch)))}
            />
          ))}
        </div>
      </Section>

      <Section title="字型" persistKey="text-fx:font" description={S.style.fontNote}>
        <Field label="字型">
          <FontPicker
            value={{ source: c.font.source, family: c.font.family, weight: c.weight }}
            onChange={(v) =>
              updateCfg((s) => {
                s.font = { source: v.source, family: v.family };
                s.weight = v.weight;
              })
            }
            previewText={
              c.text
                .split('\n')
                .find((l) => l.trim())
                ?.slice(0, 12) || undefined
            }
          />
        </Field>
        <ToggleField label="斜體" path="italic" hint="中文字型沒有斜體時用傾斜代替。" />
        <NumField label="字級" path="size" min={12} max={400} step={1} unit="px" />
        <NumField label="字距" path="tracking" min={-20} max={120} step={1} scale={100} unit="%" />
        <NumField
          label="行距"
          path="leading"
          min={0.9}
          max={3.2}
          step={0.05}
          unit="倍"
          digits={2}
        />
      </Section>

      {!isLong && hasSub ? (
        <Section title="副文字" persistKey="text-fx:sub-style">
          <Field label="字型">
            <div className="flex flex-col gap-2">
              <Toggle
                label="同主文字"
                aria-label="副文字字型同主文字"
                checked={sameSubFont}
                onCheckedChange={(same) =>
                  updateCfg((s) => {
                    s.subFont = same ? null : { ...s.font };
                  })
                }
              />
              {sameSubFont ? (
                <Select
                  aria-label="副文字粗細"
                  value={String(c.subWeight)}
                  onValueChange={(w) =>
                    updateCfg((s) => {
                      s.subWeight = Number(w);
                    })
                  }
                  options={[...new Set([...availableWeights({ ...subBase }), c.subWeight])]
                    .sort((a, b) => a - b)
                    .map((w) => ({ value: String(w), label: WEIGHT_LABELS[w] ?? String(w) }))}
                />
              ) : (
                <FontPicker
                  aria-label="副文字字型"
                  value={{ source: subBase.source, family: subBase.family, weight: c.subWeight }}
                  onChange={(v) =>
                    updateCfg((s) => {
                      s.subFont = { source: v.source, family: v.family };
                      s.subWeight = v.weight;
                    })
                  }
                />
              )}
            </div>
          </Field>
          <ToggleField label="斜體" path="subItalic" />
          <NumField
            label="大小"
            path="subScale"
            min={10}
            max={90}
            step={1}
            scale={100}
            unit="%"
            hint="主文字字級的百分比"
          />
          <NumField
            label="字距"
            path="subTracking"
            min={-20}
            max={150}
            step={1}
            scale={100}
            unit="%"
          />
          <NumField
            label="與主文字間距"
            path="subGap"
            min={0}
            max={1.5}
            step={0.01}
            unit="× 字級"
            digits={2}
          />
          <OptionalColorField
            label="顏色"
            path="subColor"
            sameLabel="同主文字"
            fallback={c.fill.color}
            hint={c.subColor ? undefined : S.style.subSameColor}
          />
        </Section>
      ) : null}

      <Section title="塗色" persistKey="text-fx:fill">
        <SegField
          label="方式"
          path="fill.mode"
          options={[
            ['solid', '單色'],
            ['gradient', '漸層'],
          ]}
        />
        {c.fill.mode !== 'gradient' ? (
          <ColorPathField label="顏色" path="fill.color" />
        ) : (
          <>
            <Field label="漸層">
              <GradientField
                aria-label="塗色漸層"
                value={{ kind: 'linear', angle: 90, stops: c.fill.stops }}
                onChange={(g) =>
                  updateCfg((s) => {
                    s.fill.stops = g.stops;
                  })
                }
                allowRadial={false}
                showAngle={false}
              />
            </Field>
            <SegField
              label="方向"
              path="fill.dir"
              options={[
                ['v', '縱向（每行）'],
                ['h', '橫向（整段）'],
                ['d', '斜向（整段）'],
              ]}
            />
            <Field label="漸層配色">
              <div className="grid grid-cols-4 gap-1.5">
                {GRADIENT_KITS.map(([name, cols]) => (
                  <SwatchButton
                    key={name}
                    label={name}
                    style={{ background: `linear-gradient(${cols.join(',')})` }}
                    onClick={() =>
                      updateCfg((s) => {
                        s.fill.mode = 'gradient';
                        s.fill.stops = evenStops(cols);
                      })
                    }
                  />
                ))}
              </div>
            </Field>
          </>
        )}
        <NumField
          label="塗色不透明度"
          path="fill.opacity"
          min={0}
          max={100}
          step={1}
          scale={100}
          unit="%"
          hint={S.style.fillOpacityHint}
        />
      </Section>

      <Section title="外框" persistKey="text-fx:stroke">
        <ToggleField label="外框" path="stroke.on" />
        {c.stroke.on ? (
          <>
            <NumField
              label="粗細"
              path="stroke.width"
              min={0.5}
              max={30}
              step={0.5}
              unit="px"
              digits={1}
            />
            <ColorPathField label="顏色" path="stroke.color" />
          </>
        ) : null}
        <ToggleField label="外側外框" path="outer.on" hint="在外框更外面再描一圈。" />
        {c.outer.on ? (
          <>
            <NumField
              label="粗細"
              path="outer.width"
              min={0.5}
              max={40}
              step={0.5}
              unit="px"
              digits={1}
            />
            <ColorPathField label="顏色" path="outer.color" />
          </>
        ) : null}
      </Section>

      <Section title="陰影" persistKey="text-fx:shadow">
        <ToggleField label="陰影" path="shadow.on" />
        {c.shadow.on ? (
          <>
            <ColorPathField label="顏色" path="shadow.color" />
            <NumField
              label="不透明度"
              path="shadow.opacity"
              min={0}
              max={100}
              step={1}
              scale={100}
              unit="%"
            />
            <NumField label="模糊" path="shadow.blur" min={0} max={80} step={1} unit="px" />
            <NumField label="水平位移" path="shadow.x" min={-60} max={60} step={1} unit="px" />
            <NumField label="垂直位移" path="shadow.y" min={-60} max={60} step={1} unit="px" />
          </>
        ) : null}
      </Section>

      <Section title="光暈" persistKey="text-fx:glow">
        <ToggleField label="光暈" path="glow.on" hint="只在字的外側。" />
        {c.glow.on ? (
          <>
            <ColorPathField label="顏色" path="glow.color" />
            <NumField label="擴散" path="glow.spread" min={2} max={150} step={1} unit="px" />
            <NumField
              label="強度"
              path="glow.strength"
              min={0.2}
              max={3}
              step={0.05}
              unit="倍"
              digits={2}
            />
          </>
        ) : null}
      </Section>
    </div>
  );
}
