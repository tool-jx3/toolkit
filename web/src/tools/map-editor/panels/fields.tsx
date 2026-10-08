/**
 * 面板共用的欄位組：填色與描邊（F080～F087、F054）、陰影（F088、F056）。
 * 值與修改由呼叫端決定（作圖用的設定或選取的物件）。
 */
import { ColorField, Field, FieldRow, NumberInput, Section, Segmented, Select, Toggle } from '@/ui';
import type { LineCap, LineJoin, StrokeStyle } from '../model';
import { LINE_CAPS, LINE_JOINS, STROKE_STYLES } from '../model';
import { S } from '../strings';

export interface StyleValues {
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  lineJoin: LineJoin;
  lineCap: LineCap;
  cornerRadius: number;
  ellipseMode?: 'bbox' | 'center';
}

export interface StyleShow {
  fill?: boolean;
  stroke?: boolean;
  width?: boolean;
  style?: boolean;
  joinCap?: boolean;
  radius?: boolean;
  ellipseMode?: boolean;
}

export interface StyleFieldsProps {
  values: StyleValues;
  show: StyleShow;
  onFill?: (hex8: string) => void;
  onStroke?: (hex8: string) => void;
  onStrokeWidth?: (w: number) => void;
  onStrokeStyle?: (s: StrokeStyle) => void;
  onJoin?: (v: LineJoin) => void;
  onCap?: (v: LineCap) => void;
  onRadius?: (r: number) => void;
  onEllipseMode?: (m: 'bbox' | 'center') => void;
  /** 線寬欄的名稱（牆壁是「牆壁厚度」） */
  widthLabel?: string;
  widthRange?: [number, number];
}

const styleOptions = STROKE_STYLES.map((v) => ({ value: v, label: S.style.styles[v] }));
const joinOptions = LINE_JOINS.map((v) => ({ value: v, label: S.style.joins[v] }));
const capOptions = LINE_CAPS.map((v) => ({ value: v, label: S.style.caps[v] }));

export function StyleFields({
  values: v,
  show,
  onFill,
  onStroke,
  onStrokeWidth,
  onStrokeStyle,
  onJoin,
  onCap,
  onRadius,
  onEllipseMode,
  widthLabel = S.style.strokeWidth,
  widthRange = [0, 100],
}: StyleFieldsProps) {
  return (
    <div className="flex flex-col gap-3" data-testid="style-fields">
      {show.ellipseMode && onEllipseMode ? (
        <Field label={S.style.ellipseMode} hint={S.style.ellipseHints[v.ellipseMode ?? 'bbox']}>
          <Segmented
            value={v.ellipseMode ?? 'bbox'}
            onValueChange={onEllipseMode}
            fullWidth
            size="sm"
            options={(['bbox', 'center'] as const).map((m) => ({
              value: m,
              label: S.style.ellipseModes[m],
            }))}
          />
        </Field>
      ) : null}
      {show.fill && onFill ? (
        <Field label={S.style.fill}>
          <ColorField value={v.fill ?? '#00000000'} onChange={onFill} alpha eyedropper />
        </Field>
      ) : null}
      {show.stroke && onStroke ? (
        <Field label={S.style.stroke}>
          <ColorField value={v.stroke ?? '#00000000'} onChange={onStroke} alpha eyedropper />
        </Field>
      ) : null}
      {show.width && onStrokeWidth ? (
        <Field label={widthLabel}>
          <NumberInput
            value={v.strokeWidth}
            onChange={onStrokeWidth}
            min={widthRange[0]}
            max={widthRange[1]}
            unit="px"
            aria-label={widthLabel}
          />
        </Field>
      ) : null}
      {show.style && onStrokeStyle ? (
        <Field label={S.style.strokeStyle}>
          <Select
            value={v.strokeStyle}
            onValueChange={onStrokeStyle}
            options={styleOptions}
            size="sm"
          />
        </Field>
      ) : null}
      {show.joinCap && onJoin && onCap ? (
        <FieldRow columns={2}>
          <Field label={S.style.lineJoin}>
            <Select value={v.lineJoin} onValueChange={onJoin} options={joinOptions} size="sm" />
          </Field>
          <Field label={S.style.lineCap}>
            <Select value={v.lineCap} onValueChange={onCap} options={capOptions} size="sm" />
          </Field>
        </FieldRow>
      ) : null}
      {show.radius && onRadius ? (
        <Field label={S.style.cornerRadius}>
          <NumberInput value={v.cornerRadius} onChange={onRadius} min={0} max={500} unit="px" />
        </Field>
      ) : null}
    </div>
  );
}

export interface ShadowValues {
  enabled: boolean;
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
}

export function ShadowFields({
  value,
  onChange,
  enabledLabel = S.shadow.enabled,
  title = S.shadow.title,
  persistKey,
  note,
}: {
  value: ShadowValues;
  onChange: (patch: Partial<ShadowValues>) => void;
  enabledLabel?: string;
  title?: string;
  persistKey?: string;
  note?: string;
}) {
  return (
    <Section title={title} defaultOpen={false} persistKey={persistKey} description={note}>
      <div className="flex flex-col gap-3" data-testid="shadow-fields">
        <Field label={enabledLabel} layout="inline">
          <Toggle checked={value.enabled} onCheckedChange={(enabled) => onChange({ enabled })} />
        </Field>
        <Field label={S.shadow.color}>
          <ColorField value={value.color} onChange={(color) => onChange({ color })} alpha />
        </Field>
        <FieldRow columns={3}>
          <Field label={S.shadow.blur}>
            <NumberInput
              value={value.blur}
              onChange={(blur) => onChange({ blur })}
              min={0}
              max={50}
              size="sm"
            />
          </Field>
          <Field label={S.shadow.offsetX}>
            <NumberInput
              value={value.offsetX}
              onChange={(offsetX) => onChange({ offsetX })}
              min={-50}
              max={50}
              size="sm"
            />
          </Field>
          <Field label={S.shadow.offsetY}>
            <NumberInput
              value={value.offsetY}
              onChange={(offsetY) => onChange({ offsetY })}
              min={-50}
              max={50}
              size="sm"
            />
          </Field>
        </FieldRow>
      </div>
    </Section>
  );
}

/** 圖樣細節（F111）：偏移 X、Y、旋轉、縮放 % */
export function PatternDetailFields({
  offX,
  offY,
  rot,
  scalePct,
  onChange,
  persistKey,
}: {
  offX: number;
  offY: number;
  rot: number;
  scalePct: number;
  onChange: (field: 'offX' | 'offY' | 'rot' | 'scale', value: number) => void;
  persistKey?: string;
}) {
  return (
    <Section title={S.pattern.detail} defaultOpen={false} persistKey={persistKey}>
      <FieldRow columns={2}>
        <Field label={S.pattern.offsetX}>
          <NumberInput value={offX} onChange={(v) => onChange('offX', v)} unit="px" size="sm" />
        </Field>
        <Field label={S.pattern.offsetY}>
          <NumberInput value={offY} onChange={(v) => onChange('offY', v)} unit="px" size="sm" />
        </Field>
        <Field label={S.pattern.rotation}>
          <NumberInput
            value={rot}
            onChange={(v) => onChange('rot', v)}
            min={-360}
            max={360}
            unit="°"
            size="sm"
          />
        </Field>
        <Field label={S.pattern.scale}>
          <NumberInput
            value={scalePct}
            onChange={(v) => onChange('scale', v)}
            min={10}
            max={2000}
            step={10}
            unit="%"
            size="sm"
          />
        </Field>
      </FieldRow>
    </Section>
  );
}
