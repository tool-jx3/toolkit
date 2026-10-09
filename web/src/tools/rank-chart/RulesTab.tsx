/**
 * 分頁 03「規則與外觀」（規格 1.4、1.5）：名次格數、抽選演出時間、再確認、自動抽下一位、不要快速切換；
 * 圖片比例、配色（三套＋自訂）、自訂配色的 11 個顏色。
 */
import {
  ColorField,
  cn,
  Field,
  FieldRow,
  GestureScope,
  Notice,
  Section,
  Select,
  Slider,
  Toggle,
} from '@/ui';
import { set } from './actions';
import {
  FORMAT_IDS,
  type FormatId,
  SPIN_CHOICES,
  type SpinMs,
  THEME_IDS,
  THEME_KEYS,
  THEMES,
  type ThemeId,
} from './model';
import { gesture, useConfig, useGame } from './store';
import { S } from './strings';

function ThemeButtons({ value, disabled }: { value: ThemeId; disabled: boolean }) {
  const custom = useConfig((s) => s.data.customTheme);
  return (
    // biome-ignore lint/a11y/useSemanticElements: 一組切換按鈕（aria-pressed）
    <div role="group" aria-label={S.theme} className="grid grid-cols-4 gap-1.5">
      {THEME_IDS.map((id) => {
        const t = id === 'custom' ? custom : THEMES[id];
        const pressed = value === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={pressed}
            disabled={disabled}
            data-theme-id={id}
            onClick={() =>
              set((d) => {
                d.theme = id;
              })
            }
            className={cn(
              'focus-visible:focus-ring flex min-w-0 flex-col gap-1 rounded-md border bg-surface p-1.5 text-xs transition-colors disabled:opacity-50',
              pressed
                ? 'border-accent outline-2 outline-accent'
                : 'border-border hover:bg-surface-3',
            )}
          >
            <span
              aria-hidden
              className="relative block h-8 overflow-hidden rounded-sm border border-border"
              style={{ background: t.bg }}
            >
              <span
                className="absolute top-1.5 right-2 size-4 rotate-12 rounded-sm"
                style={{ background: t.accent }}
              />
            </span>
            <span className="truncate">{S.themes[id]}</span>
          </button>
        );
      })}
    </div>
  );
}

export function RulesTab() {
  const c = useConfig((s) => s.data);
  const locked = useGame((s) => s.data.run !== null);
  const n = c.characters.length;
  return (
    <div className="flex flex-col gap-3">
      <Section title={S.rulesTitle} description={S.rulesLead} fixed>
        <Field label={S.slots} hint={S.slotsHint}>
          <div data-field="slots">
            <Slider
              value={c.slots}
              min={1}
              max={20}
              step={1}
              disabled={locked}
              onChange={gesture.live((v) =>
                set((d) => {
                  d.slots = Math.round(v);
                }),
              )}
              onCommit={gesture.commit}
            />
          </div>
        </Field>
        <Notice tone={n >= c.slots ? 'info' : 'danger'}>
          <span data-testid="selection-info">{S.selection(n, c.slots)}</span>
        </Notice>
        <Field label={S.spinMs}>
          <Select<string>
            value={String(c.spinMs)}
            disabled={locked}
            onValueChange={(v) =>
              set((d) => {
                d.spinMs = Number(v) as SpinMs;
              })
            }
            options={SPIN_CHOICES.map((ms) => ({ value: String(ms), label: S.spinLabels[ms] }))}
          />
        </Field>
        <Field label={S.confirmRank} hint={S.confirmRankHint} layout="inline">
          <Toggle
            checked={c.confirmRank}
            disabled={locked}
            onCheckedChange={(v) =>
              set((d) => {
                d.confirmRank = v;
              })
            }
          />
        </Field>
        <Field label={S.autoNext} layout="inline">
          <Toggle
            checked={c.autoNext}
            disabled={locked}
            onCheckedChange={(v) =>
              set((d) => {
                d.autoNext = v;
              })
            }
          />
        </Field>
        <Field label={S.reducedMotion} hint={S.reducedMotionHint} layout="inline">
          <Toggle
            checked={c.reducedMotion}
            disabled={locked}
            onCheckedChange={(v) =>
              set((d) => {
                d.reducedMotion = v;
              })
            }
          />
        </Field>
      </Section>
      <Section title={S.designTitle} fixed>
        <Field label={S.format} hint={S.ratioNote}>
          <Select<FormatId>
            value={c.format}
            disabled={locked}
            onValueChange={(v) =>
              set((d) => {
                d.format = v;
              })
            }
            options={FORMAT_IDS.map((f) => ({ value: f, label: S.formats[f] }))}
          />
        </Field>
        <Field label={S.theme}>
          <ThemeButtons value={c.theme} disabled={locked} />
        </Field>
      </Section>
      <Section
        title={S.colorsTitle}
        description={S.colorsHint}
        defaultOpen={false}
        persistKey="rank-chart:colors"
      >
        <FieldRow columns={2}>
          {THEME_KEYS.map((k) => (
            <Field key={k} label={S.colorLabels[k]}>
              <GestureScope gesture={gesture}>
                <ColorField
                  value={c.customTheme[k]}
                  disabled={locked}
                  onChange={(v) =>
                    set((d) => {
                      d.customTheme[k] = v.slice(0, 7).toLowerCase();
                      d.theme = 'custom';
                    })
                  }
                />
              </GestureScope>
            </Field>
          ))}
        </FieldRow>
      </Section>
    </div>
  );
}
