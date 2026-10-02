/**
 * 「文字」分頁：字型與字重（F41～F43）、字級與字距（F44～F46）、顯示（F47、F48）、顏色與外框線（F49～F52）。
 */
import { resolveFontWeight } from '@/core/fonts';
import { Field, FontPicker, Section, Select, WEIGHT_LABELS } from '@/ui';
import { ColorPathField, NumField, SegField, ToggleField, useS } from '../controls';
import { type FontRef, WEIGHTS } from '../settings';
import { setSetting } from '../store';
import { OUTLINE_OPTIONS, S } from '../strings';

/** 字型欄（css 模式：Google 字型／電腦字型＋手動輸入＋從清單選）；字重另外設定 */
export function FontRefField({
  label,
  path,
  value,
  weight,
  hint,
  previewText,
}: {
  label: string;
  path: string;
  value: FontRef;
  weight: number;
  hint?: string;
  previewText: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <FontPicker
        mode="css"
        showWeight={false}
        value={{ ...value, weight }}
        previewText={previewText}
        onChange={(f) =>
          setSetting(path, { source: f.source === 'local' ? 'local' : 'google', family: f.family })
        }
      />
    </Field>
  );
}

/** 字重選單（400～900）；字型沒有這個字重時註明實際使用的字重 */
export function WeightField({
  label,
  path,
  value,
  fonts,
  hint,
}: {
  label: string;
  path: string;
  value: number;
  fonts: FontRef[];
  hint?: string;
}) {
  const notes = fonts
    .map((f) => ({ f, w: resolveFontWeight(f, value) }))
    .filter((x) => x.w !== value)
    .map((x) => `${x.f.family}：實際使用 ${x.w}`);
  return (
    <Field label={label} hint={[hint, ...new Set(notes)].filter(Boolean).join('　')}>
      <Select
        value={String(value)}
        onValueChange={(v) => setSetting(path, Number(v))}
        options={WEIGHTS.map((w) => ({ value: String(w), label: WEIGHT_LABELS[w] ?? String(w) }))}
      />
    </Field>
  );
}

export function TextPanel() {
  const s = useS();
  const t = s.text;
  return (
    <div className="flex flex-col gap-3">
      <Section title={S.text.fontSection} persistKey="status-bar:fonts">
        <FontRefField
          label={S.text.labelFont}
          path="text.labelFont"
          value={t.labelFont}
          weight={t.weight}
          previewText={S.text.preview}
        />
        <FontRefField
          label={S.text.valueFont}
          path="text.valueFont"
          value={t.valueFont}
          weight={t.weight}
          hint={S.text.valueFontHint}
          previewText="0123456789 / 99"
        />
        <WeightField
          label={S.text.weight}
          path="text.weight"
          value={t.weight}
          fonts={[t.labelFont, t.valueFont]}
          hint={S.text.weightHint}
        />
      </Section>
      <Section title={S.text.sizeSection} persistKey="status-bar:textsize">
        <NumField label={S.text.labelSize} path="text.labelSize" unit="px" />
        <NumField label={S.text.currentSize} path="text.currentSize" unit="px" />
        <NumField
          label={S.text.maxSize}
          path="text.maxSize"
          unit="px"
          hidden={t.valueMode !== 'both'}
        />
        <NumField
          label={S.text.spacing}
          path="text.spacing"
          precision={2}
          hint={S.text.spacingHint}
          format={(v) => v.toFixed(2)}
        />
      </Section>
      <Section title={S.text.showSection} persistKey="status-bar:textshow">
        <ToggleField label={S.text.showLabel} path="text.showLabel" />
        <SegField label={S.text.valueMode} path="text.valueMode" options={S.valueMode} />
      </Section>
      <Section title={S.text.colorSection} persistKey="status-bar:textcolor">
        <ColorPathField label={S.text.color} path="text.color" hint={S.text.colorHint} />
        <ColorPathField
          label={S.text.maxColor}
          path="text.maxColor"
          alpha
          hidden={t.valueMode !== 'both'}
        />
        <ToggleField label={S.text.labelBarColor} path="text.labelBarColor" />
        <SegField label={S.text.outline} path="text.outline" options={OUTLINE_OPTIONS} />
        <ColorPathField
          label={S.text.outlineColor}
          path="text.outlineColor"
          alpha
          hidden={t.outline === 'none'}
        />
        <NumField
          label={S.text.outlineWidth}
          path="text.outlineWidth"
          unit="px"
          precision={1}
          hidden={t.outline !== 'stroke'}
        />
      </Section>
    </div>
  );
}
