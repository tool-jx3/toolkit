/**
 * 合輯圖對話框（F31～F41）：欄數、格子大小、間距、背景、顯示文字、文字大小與顏色；即時預覽、資訊列、下載 PNG。
 * 關閉鈕、Esc、點遮罩都會關閉；選項值放在 useSheetOptions（同一次開頁期間保留）。
 */
import { Download } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { downloadBlob } from '@/core/files';
import { canvasToBlob } from '@/core/image';
import type { SheetLayout } from '@/core/sheet';
import {
  Button,
  ColorField,
  Dialog,
  DialogClose,
  Field,
  FieldRow,
  NativeNumberInput,
  Notice,
  Segmented,
  Toggle,
} from '@/ui';
import { useLayerResolver, useNotify } from './hooks';
import {
  resolveSheet,
  SHEET_LIMITS,
  type SheetBackground,
  type SheetNumberField,
  sheetFileName,
  sheetNumber,
} from './logic';
import { layoutFor, paintSheet, SheetTooLargeError } from './render';
import { useEmotions, useSheetOptions } from './store';
import { S } from './strings';

const NUMBER_FIELDS: readonly {
  field: SheetNumberField;
  label: string;
  unit?: string;
  hint?: string;
}[] = [
  { field: 'columns', label: S.columns, hint: S.columnsHint },
  { field: 'cellSize', label: S.cellSize, unit: 'px' },
  { field: 'gap', label: S.gap, unit: 'px', hint: S.gapHint },
];

function NumberField({
  field,
  label,
  unit,
  hint,
}: {
  field: SheetNumberField;
  label: string;
  unit?: string;
  hint?: string;
}) {
  const raw = useSheetOptions((s) => s.raw[field]);
  const patch = useSheetOptions((s) => s.patch);
  const lim = SHEET_LIMITS[field];
  const box = useRef<HTMLDivElement>(null);
  /* 離開欄位時把空白、超出範圍的值改寫成實際使用的值（主控裁定：依欄位標示的範圍） */
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const normalize = () => {
      const cur = useSheetOptions.getState().raw[field];
      const v = String(sheetNumber(field, cur));
      if (v !== cur) useSheetOptions.getState().patch({ [field]: v });
    };
    el.addEventListener('focusout', normalize);
    return () => el.removeEventListener('focusout', normalize);
  }, [field]);
  return (
    <Field label={label} hint={hint}>
      <div ref={box} className="min-w-0">
        <NativeNumberInput
          value={raw}
          onChange={(v) => patch({ [field]: v })}
          min={lim.min}
          max={lim.max}
          step={lim.step}
          unit={unit}
          stepLabels={{ up: S.stepUp(label), down: S.stepDown(label) }}
        />
      </div>
    </Field>
  );
}

export function SheetDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const raw = useSheetOptions((s) => s.raw);
  const patch = useSheetOptions((s) => s.patch);
  const options = useMemo(() => resolveSheet(raw), [raw]);
  const expressions = useEmotions((s) => s.data.expressions);
  const picked = useMemo(() => expressions.filter((e) => e.checked), [expressions]);
  const resolve = useLayerResolver();
  const notify = useNotify();
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [layout, setLayout] = useState<SheetLayout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  /* 對話框的內容在 Portal 裡，開啟後才掛上：用 state 記住 canvas 元素，掛上時觸發重畫 */
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
  const canvasRef = useCallback((el: HTMLCanvasElement | null) => {
    canvas.current = el;
    setCanvasEl(el);
  }, []);

  /* 關閉後清掉上次的版面，再開時等新的一張畫好才能下載 */
  useEffect(() => {
    if (!open) setLayout(null);
  }, [open]);

  useEffect(() => {
    if (!open || !canvasEl) return;
    let alive = true;
    setPending(true);
    void (async () => {
      let next: SheetLayout | null = null;
      try {
        next = await layoutFor(picked, options);
        if (!alive) return;
        paintSheet(canvasEl, next, picked, options, resolve);
        setLayout(next);
        setError(null);
      } catch (e) {
        if (!alive) return;
        /* 畫不出來：資訊列照樣顯示要求的尺寸，預覽清空、不能下載（F47：一般的錯誤通知） */
        setLayout(next);
        canvasEl.width = 1;
        canvasEl.height = 1;
        const message =
          e instanceof SheetTooLargeError ? S.sheetTooLarge(e.width, e.height) : S.sheetFailed;
        /* 錯誤顯示在對話框裡（Notice）；不跳通知，免得 Esc 先關掉通知 */
        setError(message);
      } finally {
        if (alive) setPending(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, canvasEl, picked, options, resolve]);

  const download = async () => {
    const c = canvas.current;
    if (!c || !layout || error) return;
    try {
      const blob = await canvasToBlob(c);
      /* 下載成功不跳通知：通知是最上層，會先吃掉 Esc（F41 要 Esc 關閉對話框） */
      downloadBlob(blob, sheetFileName(new Date()));
    } catch {
      notify(S.sheetFailed, 'danger');
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={S.sheetTitle}
      description={S.sheetDescription}
      size="xl"
      footer={
        <>
          <DialogClose>{S.close}</DialogClose>
          <Button
            variant="primary"
            icon={<Download />}
            disabled={!layout || !!error || pending}
            onClick={() => void download()}
          >
            {S.download}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <FieldRow columns={3}>
          {NUMBER_FIELDS.map((f) => (
            <NumberField key={f.field} {...f} />
          ))}
        </FieldRow>
        <FieldRow columns={2}>
          <Field label={S.background}>
            <Segmented<SheetBackground>
              value={raw.background}
              onValueChange={(v) => patch({ background: v })}
              options={[
                { value: 'transparent', label: S.bgTransparent },
                { value: 'white', label: S.bgWhite },
                { value: 'custom', label: S.bgCustom },
              ]}
            />
          </Field>
          <Field label={S.customColor} hidden={raw.background !== 'custom'}>
            <ColorField value={raw.customColor} onChange={(v) => patch({ customColor: v })} />
          </Field>
        </FieldRow>
        <FieldRow columns={3}>
          <Field label={S.sheetShowText} layout="inline">
            <Toggle checked={raw.showText} onCheckedChange={(v) => patch({ showText: v })} />
          </Field>
          <NumberField field="fontSize" label={S.fontSize} unit="px" />
          <Field label={S.textColor}>
            <ColorField value={raw.textColor} onChange={(v) => patch({ textColor: v })} />
          </Field>
        </FieldRow>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <p className="m-0 text-sm text-muted" data-testid="sheet-info" aria-live="polite">
          {layout
            ? S.sheetInfo(picked.length, layout.columns, layout.rows, layout.width, layout.height)
            : S.sheetRendering}
        </p>
        <div className="flex min-w-0 justify-center overflow-auto rounded-md border border-border bg-surface-2 p-2">
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={S.sheetPreviewLabel}
            data-testid="sheet-canvas"
            width={1}
            height={1}
            className="checker block h-auto max-h-[60dvh] w-auto max-w-full"
          />
        </div>
      </div>
    </Dialog>
  );
}
