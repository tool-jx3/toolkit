/**
 * 輸出（規格 F51～F55）：列印／存成 PDF、匯出 PNG（頁面、解析度）、複製 CCFOLIA 角色資料。
 * 放在預覽下方，一列按鈕＋PNG 的兩個選項（寬畫面時和預覽一起固定在畫面上）。
 */
import { ClipboardCopy, ImageDown, Printer } from 'lucide-react';
import { useState } from 'react';
import { copyText, downloadBlob } from '@/core/files';
import { Button, Field, FieldRow, Select, Tooltip, useToast } from '@/ui';
import type { PngPages, Sheet } from './model';
import { ccfoliaJson, pngFileName, printSheet, sheetPng } from './output';
import { previewApi } from './Preview';
import { useView } from './store';
import { S } from './strings';

/** 列印（按鈕與 Ctrl＋P 共用） */
export async function runPrint(sheet: Sheet, toast: ReturnType<typeof useToast>): Promise<void> {
  try {
    await printSheet(sheet, previewApi.pages());
  } catch (e) {
    toast({
      title: S.output.printFailed,
      description: e instanceof Error ? e.message : String(e),
      tone: 'danger',
    });
  }
}

export function OutputPanel({ sheet }: { sheet: Sheet }) {
  const toast = useToast();
  const pages = useView((v) => v.data.pngPages);
  const scale = useView((v) => v.data.pngScale);
  const [busy, setBusy] = useState(false);

  const exportPng = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const out = await sheetPng(previewApi.pages(), pages, scale);
      const name = pngFileName(sheet, pages);
      downloadBlob(out.blob, name);
      toast({
        title: S.png.saved(name),
        description: S.png.size(out.width, out.height),
        tone: 'success',
      });
    } catch (e) {
      toast({
        title: S.output.exportFailed,
        description: e instanceof Error ? e.message : String(e),
        tone: 'danger',
      });
    } finally {
      setBusy(false);
    }
  };

  const copyCcfolia = async () => {
    const ok = await copyText(ccfoliaJson(sheet));
    toast(
      ok
        ? { title: S.output.copied, description: S.output.copiedHint, tone: 'success' }
        : { title: S.output.copyFailed, description: S.output.copyFailedHint, tone: 'danger' },
    );
  };

  return (
    <section
      aria-label={S.output.section}
      className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-surface p-3"
    >
      <div className="flex flex-wrap gap-2">
        <Tooltip content={S.output.printHint}>
          <Button variant="primary" icon={<Printer />} onClick={() => void runPrint(sheet, toast)}>
            {S.output.print}
          </Button>
        </Tooltip>
        <Tooltip content={S.output.pngHint}>
          <Button icon={<ImageDown />} loading={busy} onClick={() => void exportPng()}>
            {S.output.png}
          </Button>
        </Tooltip>
        <Tooltip content={S.output.ccfoliaHint}>
          <Button icon={<ClipboardCopy />} onClick={() => void copyCcfolia()}>
            {S.output.ccfolia}
          </Button>
        </Tooltip>
      </div>
      <FieldRow columns={2}>
        <Field label={S.output.pngPages}>
          <Select<PngPages>
            value={pages}
            size="sm"
            onValueChange={(v) => useView.getState().patch({ pngPages: v })}
            options={[
              { value: '1', label: S.output.page1 },
              { value: '2', label: S.output.page2 },
              { value: 'both', label: S.output.both },
            ]}
          />
        </Field>
        <Field label={S.png.scale}>
          <Select<string>
            value={String(scale)}
            size="sm"
            onValueChange={(v) => useView.getState().patch({ pngScale: Number(v) })}
            options={[
              { value: '1', label: S.png.scale1 },
              { value: '2', label: S.png.scale2 },
              { value: '3', label: S.png.scale3 },
            ]}
          />
        </Field>
      </FieldRow>
    </section>
  );
}
