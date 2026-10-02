/**
 * 設定面板用的小控制項：數值欄（照規格第 2 節的範圍）、色彩欄＋「複製色碼」（F25、F26）。
 */
import { Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { copyText } from '@/core/files';
import { Button, ColorField, Field, NumberInput, useToast } from '@/ui';
import type { Range } from './settings';
import { S } from './strings';

export function NumberField({
  label,
  value,
  onChange,
  range,
  unit,
  hint,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  range: Range;
  unit?: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <Field label={label} hint={hint}>
      <NumberInput
        value={value}
        onChange={onChange}
        min={range.min}
        max={range.max}
        step={range.step}
        precision={range.precision}
        unit={unit}
        disabled={disabled}
      />
    </Field>
  );
}

/** 複製色碼：大寫 6 位（含 #）；按鈕文字暫時改成「已複製」約 0.9 秒，失敗時提示手動複製 */
export function CopyHexButton({ name, value }: { name: string; value: string }) {
  const toast = useToast();
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const hex = value.slice(0, 7).toUpperCase();
  return (
    <Button
      size="sm"
      variant="ghost"
      icon={done ? <Check /> : <Copy />}
      aria-label={S.color.copyLabel(name)}
      data-copied={done ? '' : undefined}
      className="h-8 shrink-0"
      onClick={async () => {
        const ok = await copyText(hex);
        if (!ok) {
          toast({
            title: S.color.copyFailed,
            description: S.color.copyFailedHint(hex),
            tone: 'warning',
          });
          return;
        }
        setDone(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setDone(false), 900);
      }}
    >
      {done ? S.color.copied : S.color.copy}
    </Button>
  );
}

/** 色彩欄（色塊＋色碼欄，打字或貼上 3／6 位色碼）＋複製色碼 */
export function ColorCopyField({
  label,
  value,
  onChange,
  hint,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <Field label={label} hint={hint}>
      <div className="flex min-w-0 items-center gap-1.5">
        <ColorField
          value={value}
          onChange={onChange}
          disabled={disabled}
          className="min-w-0 flex-1"
        />
        <CopyHexButton name={label} value={value} />
      </div>
    </Field>
  );
}
