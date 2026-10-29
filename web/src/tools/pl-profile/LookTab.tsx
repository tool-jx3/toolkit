/**
 * 「外觀」分頁（規格 F31～F35）：要哪幾張圖、配色、主色、地雷表的列法、包含補充、圖片大小。
 */
import { ColorField, cn, Field, GestureScope, Section, Segmented, Toggle } from '@/ui';
import { setLook } from './actions';
import {
  ACCENT_SWATCHES,
  GROUP_MODES,
  type GroupMode,
  IMAGES_MODES,
  type ImagesMode,
  THEMES,
  type ThemeId,
} from './model';
import { THEME_BASES } from './render';
import { gesture, useProfile } from './store';
import { S } from './strings';

function ThemePicker({ value }: { value: ThemeId }) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: 一組相關的按鈕，不是表單分組
    <div role="group" aria-label={S.look.theme} className="grid grid-cols-3 gap-2">
      {THEMES.map((t) => {
        const base = THEME_BASES[t];
        const on = value === t;
        return (
          <button
            key={t}
            type="button"
            aria-pressed={on}
            data-theme-id={t}
            onClick={() => setLook('theme', t)}
            className={cn(
              'flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus',
              on
                ? 'border-accent bg-accent-soft text-fg'
                : 'border-border bg-surface-2 text-fg hover:bg-surface-3',
            )}
          >
            <span
              aria-hidden
              className="relative size-6 shrink-0 overflow-hidden rounded-full border border-border-strong"
              style={{ background: base.bg }}
            >
              <span
                className="absolute right-0 bottom-0 size-3.5 rounded-tl-full"
                style={{ background: base.card }}
              />
            </span>
            {S.look.themes[t]}
          </button>
        );
      })}
    </div>
  );
}

export function LookTab() {
  const look = useProfile((s) => s.data.look);
  return (
    <div className="flex flex-col gap-3">
      <Section title={S.look.images} persistKey="pl-profile:look-images">
        <Segmented<ImagesMode>
          aria-label={S.look.images}
          value={look.images}
          onValueChange={(v) => setLook('images', v)}
          options={IMAGES_MODES.map((m) => ({ value: m, label: S.look.imagesModes[m] }))}
          columns={2}
          size="sm"
        />
      </Section>
      <Section title={S.look.theme} persistKey="pl-profile:look-theme">
        <ThemePicker value={look.theme} />
        <Field label={S.look.accent}>
          <GestureScope gesture={gesture}>
            <ColorField
              value={look.accent}
              onChange={(v) => setLook('accent', v.slice(0, 7).toLowerCase())}
              swatches={ACCENT_SWATCHES}
            />
          </GestureScope>
        </Field>
      </Section>
      <Section title={S.look.group} persistKey="pl-profile:look-group">
        <Field label={S.look.group} hint={S.look.groupHint}>
          <Segmented<GroupMode>
            value={look.group}
            onValueChange={(v) => setLook('group', v)}
            options={GROUP_MODES.map((m) => ({ value: m, label: S.look.groups[m] }))}
            size="sm"
          />
        </Field>
        <Field label={S.look.notes} layout="inline">
          <Toggle checked={look.notes} onCheckedChange={(v) => setLook('notes', v)} />
        </Field>
      </Section>
      <Section title={S.look.scale} persistKey="pl-profile:look-scale">
        <Segmented<'1' | '2'>
          aria-label={S.look.scale}
          value={String(look.scale) as '1' | '2'}
          onValueChange={(v) => setLook('scale', v === '1' ? 1 : 2)}
          options={[
            { value: '1', label: S.look.scales[1] },
            { value: '2', label: S.look.scales[2] },
          ]}
          columns={2}
          size="sm"
        />
      </Section>
    </div>
  );
}
