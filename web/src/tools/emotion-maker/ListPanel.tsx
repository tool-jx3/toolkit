/**
 * 表情清單（F21～F31、F42、F43）：勾選、縮圖、標籤、摘要、編輯／複製／刪除；全選／全不選、刪除勾選的、全部清空；
 * 預設表情組、合輯圖、匯出（ZIP：設定 JSON＋自訂部件圖片）與匯入（加入／取代／取消）。
 */
import { Download, Grid3x3, Sparkles, Upload } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { importAssetFiles } from '@/core/assets';
import { downloadBytes, pickFiles, readAsBytes } from '@/core/files';
import { ProjectFileError, parseProjectBytes, serializeProjectZip } from '@/core/storage';
import { Button, SelectableCardList, useChoice, useConfirm } from '@/ui';
import { useLayerResolver, useNotify, usePartNames } from './hooks';
import {
  buildExportData,
  draftOf,
  duplicateExpression,
  EXPORT_VERSION,
  type Expression,
  exportFileName,
  ImportError,
  mergeImport,
  parseExportData,
  referencedPartIds,
  summaryText,
} from './logic';
import { BUILTIN_PARTS, builtinPart } from './parts';
import { PRESETS } from './presets';
import { type LayerResolver, renderStack, stackOf } from './render';
import { SheetDialog } from './SheetDialog';
import { newId, partAssets, TOOL_ID, useCustomImages, useEditor, useEmotions } from './store';
import { S } from './strings';

/** 清單縮圖（約 64 px 顯示；畫成 128 px） */
const LIST_THUMB_PX = 128;

/** 清單縮圖：同一筆表情、同一份圖層解析只畫一次 */
function useListThumbs(list: readonly Expression[], resolve: LayerResolver) {
  const cache = useRef(
    new WeakMap<Expression, { resolve: LayerResolver; canvas: HTMLCanvasElement }>(),
  );
  return useMemo(() => {
    const out = new Map<string, HTMLCanvasElement>();
    for (const e of list) {
      let hit = cache.current.get(e);
      if (!hit || hit.resolve !== resolve) {
        hit = { resolve, canvas: renderStack(stackOf(e, resolve), LIST_THUMB_PX) };
        cache.current.set(e, hit);
      }
      out.set(e.id, hit.canvas);
    }
    return out;
  }, [list, resolve]);
}

export function ListPanel() {
  const expressions = useEmotions((s) => s.data.expressions);
  const editingId = useEditor((s) => s.editingId);
  const resolve = useLayerResolver();
  const nameOf = usePartNames();
  const thumbs = useListThumbs(expressions, resolve);
  const notify = useNotify();
  const confirm = useConfirm();
  const choose = useChoice();
  const [sheetOpen, setSheetOpen] = useState(false);

  const setList = (next: Expression[]) => useEmotions.getState().patch({ expressions: next });
  const list = () => useEmotions.getState().data.expressions;
  /** 正在編輯的那筆不在清單裡了：重設編輯區 */
  const resetIfGone = (next: readonly Expression[]) => {
    const id = useEditor.getState().editingId;
    if (id && !next.some((e) => e.id === id)) useEditor.getState().reset();
  };

  const edit = (id: string) => {
    const e = list().find((x) => x.id === id);
    if (!e) return;
    useEditor.getState().edit(id, draftOf(e));
    document.getElementById('emotion-editor')?.scrollIntoView?.({ block: 'nearest' });
  };

  const duplicate = (id: string) => {
    setList(duplicateExpression(list(), id, () => newId('e')));
    notify(S.duplicated, 'success');
  };

  const remove = async (id: string) => {
    const e = list().find((x) => x.id === id);
    if (!e) return;
    const ok = await confirm({
      title: S.confirmDelete(e.label.trim() || S.thisExpression),
      confirmLabel: S.deleteLabel,
      danger: true,
    });
    if (!ok) return;
    const next = list().filter((x) => x.id !== id);
    setList(next);
    resetIfGone(next);
  };

  const checkAll = (checked: boolean) =>
    setList(list().map((e) => (e.checked === checked ? e : { ...e, checked })));

  const removeChecked = async () => {
    const count = list().filter((e) => e.checked).length;
    if (!count) {
      notify(S.noneChecked, 'warning');
      return;
    }
    const ok = await confirm({
      title: S.confirmDeleteChecked(count),
      confirmLabel: S.deleteLabel,
      danger: true,
    });
    if (!ok) return;
    const next = list().filter((e) => !e.checked);
    setList(next);
    resetIfGone(next);
    notify(S.deletedChecked(count), 'success');
  };

  const clearAll = async () => {
    const count = list().length;
    if (!count) return;
    const ok = await confirm({
      title: S.confirmClear(count),
      description: S.confirmClearDescription,
      confirmLabel: S.clearLabel,
      danger: true,
    });
    if (!ok) return;
    setList([]);
    useEditor.getState().reset();
    notify(S.cleared, 'success');
  };

  const addPresets = async () => {
    const current = list().length;
    if (current) {
      const ok = await confirm({
        title: S.confirmPresets(PRESETS.length),
        description: S.confirmPresetsDescription(current),
        confirmLabel: S.confirmPresetsOk,
      });
      if (!ok) return;
    }
    setList([
      ...list(),
      ...PRESETS.map(
        (p): Expression => ({
          id: newId('e'),
          label: p.label,
          showText: true,
          checked: true,
          eyes: p.eyes,
          brows: p.brows,
          mouth: p.mouth,
          decorations: [...p.decorations],
        }),
      ),
    ]);
    notify(S.presetsAdded(PRESETS.length), 'success');
  };

  const openSheet = () => {
    if (!list().some((e) => e.checked)) {
      notify(S.needChecked, 'warning');
      return;
    }
    setSheetOpen(true);
  };

  const exportList = async () => {
    const { expressions: all, customParts } = useEmotions.getState().data;
    if (!all.length) {
      notify(S.exportEmpty, 'warning');
      return;
    }
    try {
      const used = referencedPartIds(all);
      const assetIds = customParts
        .filter((p) => used.has(p.id) && p.assetId)
        .map((p) => p.assetId as string);
      const files = await partAssets.exportFiles(assetIds);
      const fileOf = new Map(files.map((f) => [f.name.replace(/\.[^.]+$/, ''), f.name]));
      const data = buildExportData(all, customParts, (a) => fileOf.get(a) ?? null);
      const bytes = serializeProjectZip(TOOL_ID, EXPORT_VERSION, data, files);
      downloadBytes(bytes, exportFileName(new Date()), 'application/zip');
      notify(S.exported(all.length), 'success');
    } catch (e) {
      notify(S.importFailed, 'danger', e instanceof Error ? e.message : String(e));
    }
  };

  const importList = async () => {
    const [file] = await pickFiles({ accept: '.zip,.json,application/zip,application/json' });
    if (!file) return;
    try {
      const project = parseProjectBytes(await readAsBytes(file), TOOL_ID);
      const incoming = parseExportData(project.data);
      if (!incoming.expressions.length) {
        notify(S.importEmpty, 'warning');
        return;
      }
      const current = list().length;
      const how = current
        ? await choose({
            title: S.importTitle(incoming.expressions.length),
            description: S.importDescription(current),
            choices: [
              { value: 'append', label: S.importAppend },
              { value: 'replace', label: S.importReplace, variant: 'danger' },
            ],
          })
        : 'replace';
      if (!how) return;
      /* 用到的自訂部件的圖片放進資產庫（保留檔案裡的 id） */
      const wanted = new Set(
        incoming.customParts.map((p) => p.file).filter((f): f is string => !!f),
      );
      const stored = await importAssetFiles(
        partAssets,
        [...project.files].filter(([name]) => wanted.has(name)),
      );
      const assetOfFile = new Map<string, string>();
      for (const name of wanted) {
        const id = name.replace(/\.[^.]+$/, '');
        if (stored.ids.includes(id)) assetOfFile.set(name, id);
      }
      const merged = mergeImport(useEmotions.getState().data.customParts, incoming, {
        builtinCategory: (id) => {
          const c = builtinPart(id)?.category;
          return c && c !== 'base' ? c : undefined;
        },
        builtinNames: (c) => BUILTIN_PARTS[c].map((p) => p.name),
        assetIdOfFile: (name) => assetOfFile.get(name) ?? null,
        newPartId: () => newId('c'),
        newExpressionId: () => newId('e'),
      });
      for (const p of merged.added) {
        if (!p.assetId) continue;
        const image = await partAssets.bitmap(p.assetId).catch(() => undefined);
        if (image) useCustomImages.getState().put(p.assetId, image);
        else useCustomImages.getState().markMissing(p.assetId);
      }
      const next = how === 'append' ? [...list(), ...merged.expressions] : merged.expressions;
      useEmotions.getState().patch({ customParts: merged.customParts, expressions: next });
      resetIfGone(next);
      notify(
        S.imported(merged.expressions.length),
        stored.notPersisted ? 'warning' : 'success',
        stored.notPersisted
          ? stored.reason === 'unavailable'
            ? S.partsUnavailable
            : S.partsNotSaved(stored.notPersisted)
          : undefined,
      );
    } catch (e) {
      notify(
        S.importFailed,
        'danger',
        e instanceof ProjectFileError || e instanceof ImportError ? e.message : S.importBadData,
      );
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" icon={<Grid3x3 />} onClick={openSheet}>
          {S.openSheet}
        </Button>
        <Button icon={<Sparkles />} onClick={() => void addPresets()}>
          {S.presets}
        </Button>
        <Button icon={<Download />} onClick={() => void exportList()}>
          {S.exportList}
        </Button>
        <Button icon={<Upload />} onClick={() => void importList()}>
          {S.importList}
        </Button>
      </div>
      <SelectableCardList
        title={S.listTitle}
        items={expressions.map((e) => ({
          id: e.id,
          title: e.label,
          summary: summaryText(e, nameOf),
          thumbnail: thumbs.get(e.id) ?? null,
          checked: e.checked,
        }))}
        editingId={editingId}
        onCheckedChange={(id, checked) =>
          setList(list().map((e) => (e.id === id ? { ...e, checked } : e)))
        }
        onEdit={edit}
        onDuplicate={duplicate}
        onDelete={(id) => void remove(id)}
        onCheckAll={checkAll}
        onDeleteChecked={() => void removeChecked()}
        untitled={S.untitled}
        checkedLabel={S.checkedLabel}
        empty={S.listEmpty}
        actions={
          <Button
            size="sm"
            variant="ghost"
            disabled={!expressions.length}
            onClick={() => void clearAll()}
          >
            {S.clearAll}
          </Button>
        }
      />
      <SheetDialog open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  );
}
