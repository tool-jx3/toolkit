/**
 * 版型欄位的控制項：依欄位定義（model.ts 的 FieldDef）畫出文字、多行、勾選、顏色、數值、單選、字型、格式化文字。
 * 預設文字第一次聚焦時清空（shouldClear）；改過的欄位記在 touched。
 */
import type { Draft as ImmerDraft } from 'immer';
import { Fragment, type ReactNode } from 'react';
import type { FontValue } from '@/core/fonts';
import { fontFamilyCss } from '@/core/fonts';
import { plainDoc, type RichDoc } from '@/core/richtext';
import type { ToolStore } from '@/core/storage';
import {
  type CanvasPicker,
  ColorField,
  Field,
  FieldRow,
  FontPicker,
  RichTextField,
  Segmented,
  Slider,
  TextArea,
  TextInput,
  Toggle,
} from '@/ui';
import {
  condMet,
  type Draft,
  type FieldDef,
  font,
  num,
  rich,
  shouldClear,
  str,
  textMax,
  type Value,
} from './model';
import { S } from './strings';
import { SANS, sansFont } from './templates/kit';

export interface FieldEnv {
  store: ToolStore<Draft>;
  d: Draft;
  defaults: Record<string, Value>;
  picker: CanvasPicker;
  /** 格式化文字欄離開時（文字記錄：分頁） */
  onRichBlur?: () => void;
}

/** 設定一個欄位的值（並記為改過） */
export function setValue(store: ToolStore<Draft>, id: string, value: Value): void {
  store.getState().update((d) => {
    (d.v as Record<string, unknown>)[id] = value as ImmerDraft<Value>;
    d.touched[id] = true;
  });
}

function FieldControl({ f, env }: { f: Exclude<FieldDef, { type: 'separator' }>; env: FieldEnv }) {
  const { store, d, defaults, picker } = env;
  const v = d.v;
  const set = (value: Value) => setValue(store, f.id, value);
  const clearOnFocus = () => {
    if (shouldClear(f, store.getState().data, defaults))
      set(f.type === 'rich' ? plainDoc('', f.color ?? '#363636') : '');
  };
  switch (f.type) {
    case 'text':
      return (
        <Field label={f.label} hint={f.hint}>
          <TextInput
            value={str(v, f.id)}
            maxLength={textMax(f)}
            placeholder={f.placeholder}
            inputMode={f.inputMode}
            onFocus={clearOnFocus}
            onChange={(e) => set(e.target.value)}
            data-field={f.id}
          />
        </Field>
      );
    case 'textarea':
      return (
        <Field label={f.label} hint={f.hint}>
          <TextArea
            value={str(v, f.id)}
            maxLength={textMax(f)}
            rows={3}
            placeholder={f.placeholder}
            onFocus={clearOnFocus}
            onChange={(e) => set(e.target.value)}
            data-field={f.id}
          />
        </Field>
      );
    case 'checkbox':
      return (
        <Field label={f.label} layout="inline" hint={f.hint}>
          <Toggle checked={v[f.id] === true} onCheckedChange={(on) => set(on)} />
        </Field>
      );
    case 'color':
      return (
        <Field label={f.label} hint={f.hint}>
          <ColorField
            aria-label={f.label}
            value={str(v, f.id) || '#000000'}
            onChange={(hex) => set(hex)}
            pickFromCanvas={picker.pick}
          />
        </Field>
      );
    case 'number':
      return (
        <Field label={f.label} hint={f.hint}>
          <Slider
            value={num(v, f.id, f.min)}
            onChange={(n) => set(Math.max(f.min, Math.min(f.max, n)))}
            min={f.min}
            max={f.max}
            step={f.step ?? 1}
            unit={f.unit}
          />
        </Field>
      );
    case 'radio':
      return (
        <Field label={f.label} hint={f.hint}>
          <Segmented
            value={str(v, f.id)}
            onValueChange={(x) => set(x)}
            options={f.options.map((o) => ({ value: o.value, label: o.label }))}
            fullWidth
          />
        </Field>
      );
    case 'font': {
      const value = font(v, f.id, sansFont(700));
      const sample = (f.sampleOf ? str(v, f.sampleOf) : '') || S.fontSample;
      return (
        <Field label={f.label} hint={f.hint}>
          <div className="flex min-w-0 flex-col gap-1.5">
            <FontPicker
              value={value}
              onChange={(x: FontValue) => set(x)}
              previewText={sample.slice(0, 12)}
            />
            <p
              className="m-0 truncate rounded-md bg-surface-2 px-2 py-1 text-lg text-fg"
              style={{ fontFamily: fontFamilyCss(value.family || SANS), fontWeight: value.weight }}
              data-testid="font-sample"
            >
              {sample}
            </p>
          </div>
        </Field>
      );
    }
    case 'rich':
      return (
        <Field label={f.label} hint={f.hint}>
          <RichTextField
            value={rich(v, f.id)}
            onChange={(doc: RichDoc) => set(doc)}
            defaultColor={f.color ?? '#363636'}
            maxLength={f.max ?? 1000}
            rows={f.rows}
            note={f.note}
            onFocus={clearOnFocus}
            onBlur={env.onRichBlur}
          />
        </Field>
      );
  }
}

/** 一組欄位（依條件顯示；同 row 的排在同一列） */
export function FieldList({ fields, env }: { fields: readonly FieldDef[]; env: FieldEnv }) {
  const out: ReactNode[] = [];
  const v = env.d.v;
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    if (!condMet(f.when, v)) continue;
    if (f.type === 'separator') {
      out.push(<hr key={f.id} className="my-1 border-0 border-t border-border" />);
      continue;
    }
    if (f.row) {
      const row: Exclude<FieldDef, { type: 'separator' }>[] = [];
      let j = i;
      while (
        j < fields.length &&
        'row' in fields[j] &&
        (fields[j] as { row?: string }).row === f.row
      ) {
        const g = fields[j];
        if (g.type !== 'separator' && condMet(g.when, v)) row.push(g);
        j++;
      }
      i = j - 1;
      out.push(
        <FieldRow key={`row-${f.id}`} columns={Math.min(3, Math.max(2, row.length)) as 2 | 3}>
          {row.map((g) => (
            <Fragment key={g.id}>
              <FieldControl f={g} env={env} />
            </Fragment>
          ))}
        </FieldRow>,
      );
      continue;
    }
    out.push(<FieldControl key={f.id} f={f} env={env} />);
  }
  return <>{out}</>;
}
