/**
 * 逐句清單的「調整」欄位（規格 F75～F81）：X%、Y%、角度、文字顏色、發光顏色、大小、透明度、字型、恢復自動。
 * 只顯示目前的風格支援的項目（LyricStyle.adjust）；值和預覽上的操作同步（都寫在 overrides.<鍵>.adjust）。
 * 位置與角度顯示這一句目前實際的值（自動排的也看得到）；改了位置或角度，這一句就固定。
 */
import { Eraser, RotateCcw } from 'lucide-react';
import type { FontValue } from '@/core/fonts';
import { ADJUST_RANGES } from '@/core/lyricfx';
import {
  Button,
  ColorField,
  Field,
  FieldRow,
  FontPicker,
  IconButton,
  NumberInput,
  Segmented,
} from '@/ui';
import { pinLine, resetAdjust, setAdjust } from './actions';
import { adjustSupport, placementOf } from './scene';
import { useSession, useSettings } from './store';
import { S } from './strings';
import { GestureSlider } from './widgets';

const pct1 = (v: number) => Math.round(v * 1000) / 10;
const DEFAULT_FONT: FontValue = { source: 'google', family: 'Noto Sans TC', weight: 700 };

export function AdjustFields({ rowKey, n, text }: { rowKey: string; n: number; text: string }) {
  const s = useSettings((st) => st.data);
  const fontTick = useSession((st) => st.fontTick);
  const exporting = useSession((st) => st.exporting);
  const support = adjustSupport(s);
  const adj = s.overrides[rowKey]?.adjust;
  /* 時間只影響看得到的範圍；這裡只用位置、角度、顏色、字型 */
  const pl = placementOf(s, fontTick, rowKey, 0);
  const any = Object.values(support).some(Boolean);
  if (!any)
    return (
      <p className="m-0 text-xs text-muted" data-testid="line-adjust">
        {S.adjust.unsupported}
      </p>
    );
  const x = pl?.x ?? adj?.x ?? 0.5;
  const y = pl?.y ?? adj?.y ?? 0.5;
  const angle = pl?.angle ?? adj?.angle ?? 0;
  const color = adj?.color ?? pl?.color ?? '#ffffff';
  const glowColor = adj?.glowColor ?? pl?.glowColor ?? '#ffffff';
  const font = (adj?.font ?? pl?.font ?? DEFAULT_FONT) as FontValue;
  const off = exporting;
  return (
    <section
      className="flex min-w-0 flex-col gap-2 rounded-md border border-accent/50 bg-surface p-2"
      aria-label={S.adjust.title(n)}
      data-testid="line-adjust"
    >
      {support.position || support.angle ? (
        <FieldRow columns={3}>
          {support.position ? (
            <>
              <Field label={S.adjust.x}>
                <NumberInput
                  value={pct1(x)}
                  min={0}
                  max={100}
                  step={0.1}
                  unit="%"
                  size="sm"
                  disabled={off}
                  onChange={() => {}}
                  onCommit={(v) => pinLine(rowKey, { x: v / 100 })}
                />
              </Field>
              <Field label={S.adjust.y}>
                <NumberInput
                  value={pct1(y)}
                  min={0}
                  max={100}
                  step={0.1}
                  unit="%"
                  size="sm"
                  disabled={off}
                  onChange={() => {}}
                  onCommit={(v) => pinLine(rowKey, { y: v / 100 })}
                />
              </Field>
            </>
          ) : null}
          {support.angle ? (
            <Field label={S.adjust.angle}>
              <NumberInput
                value={Math.round(angle * 100) / 100}
                min={ADJUST_RANGES.angle.min}
                max={ADJUST_RANGES.angle.max}
                step={1}
                unit="°"
                size="sm"
                disabled={off}
                onChange={() => {}}
                onCommit={(v) => pinLine(rowKey, { angle: v })}
              />
            </Field>
          ) : null}
        </FieldRow>
      ) : null}
      {support.position || support.angle ? (
        <p className="m-0 text-xs text-muted">{S.adjust.positionHint}</p>
      ) : null}
      {support.color || support.glowColor ? (
        <FieldRow columns={2}>
          {support.color ? (
            <Field
              label={S.adjust.color}
              labelSuffix={
                adj?.color ? (
                  <IconButton
                    size="sm"
                    variant="ghost"
                    label={`${S.adjust.useStyle}（${S.adjust.color}）`}
                    icon={<Eraser />}
                    disabled={off}
                    onClick={() => setAdjust(rowKey, { color: undefined })}
                    data-testid="adjust-color-clear"
                  />
                ) : null
              }
            >
              <ColorField
                value={color}
                disabled={off}
                onChange={(v) => setAdjust(rowKey, { color: v }, 'edit')}
              />
            </Field>
          ) : null}
          {support.glowColor ? (
            <Field
              label={S.adjust.glowColor}
              hint={S.adjust.glowHint}
              labelSuffix={
                adj?.glowColor ? (
                  <IconButton
                    size="sm"
                    variant="ghost"
                    label={`${S.adjust.useStyle}（${S.adjust.glowColor}）`}
                    icon={<Eraser />}
                    disabled={off}
                    onClick={() => setAdjust(rowKey, { glowColor: undefined })}
                    data-testid="adjust-glow-clear"
                  />
                ) : null
              }
            >
              <ColorField
                value={glowColor}
                disabled={off}
                onChange={(v) => setAdjust(rowKey, { glowColor: v }, 'edit')}
              />
            </Field>
          ) : null}
        </FieldRow>
      ) : null}
      {support.scale ? (
        <Field label={S.adjust.scale} hint={S.adjust.scaleHint}>
          <GestureSlider
            value={Math.round((adj?.scale ?? 1) * 100)}
            min={ADJUST_RANGES.scale.min * 100}
            max={ADJUST_RANGES.scale.max * 100}
            step={1}
            unit="%"
            disabled={off}
            onChange={(v) => setAdjust(rowKey, { scale: v / 100 }, 'edit')}
          />
        </Field>
      ) : null}
      {support.opacity ? (
        <Field label={S.adjust.opacity} hint={S.adjust.opacityHint}>
          <GestureSlider
            value={Math.round((adj?.opacity ?? 1) * 100)}
            min={0}
            max={100}
            step={1}
            unit="%"
            disabled={off}
            onChange={(v) => setAdjust(rowKey, { opacity: v / 100 }, 'edit')}
          />
        </Field>
      ) : null}
      {support.font ? (
        <Field label={S.adjust.font}>
          <div className="flex min-w-0 flex-col gap-2">
            <Segmented
              fullWidth
              value={adj?.font ? 'own' : 'style'}
              disabled={off}
              onValueChange={(v) =>
                setAdjust(rowKey, { font: v === 'own' ? { ...font } : undefined })
              }
              options={[
                { value: 'style', label: S.adjust.fontStyle },
                { value: 'own', label: S.adjust.fontOwn },
              ]}
            />
            {adj?.font ? (
              <FontPicker
                value={font}
                previewText={text}
                onChange={(f) => setAdjust(rowKey, { font: f })}
              />
            ) : null}
          </div>
        </Field>
      ) : null}
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          icon={<RotateCcw />}
          disabled={off || !adj}
          onClick={() => resetAdjust(rowKey)}
          data-testid="adjust-reset"
        >
          {S.adjust.reset}
        </Button>
        <span className="min-w-0 text-xs text-muted">{S.adjust.resetHint}</span>
      </div>
    </section>
  );
}
