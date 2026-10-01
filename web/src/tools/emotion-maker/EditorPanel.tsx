/**
 * 編輯區（F06～F17）：即時預覽、標籤、顯示文字、儲存／完成修改、取消編輯、隨機、重設、裝飾圖層清單。
 */
import { Dices, RotateCcw, Save, X } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { Button, Field, IconButton, LayerList, TextArea, Toggle } from '@/ui';
import { candidatesOf, useLayerResolver, useNotify, usePartNames } from './hooks';
import {
  decorationRows,
  moveDecorationRow,
  randomSelection,
  saveDraft,
  summaryText,
} from './logic';
import { drawStack, type StackLayer, stackOf } from './render';
import { newId, useEditor, useEmotions } from './store';
import { S } from './strings';

/** 預覽的顯示大小（F10：約 340 × 340 px） */
export const PREVIEW_SIZE = 340;

function PreviewCanvas({ layers, label }: { layers: readonly StackLayer[]; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const px = Math.round(PREVIEW_SIZE * Math.min(2, window.devicePixelRatio || 1));
    if (c.width !== px) {
      c.width = px;
      c.height = px;
    }
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, px, px);
    drawStack(ctx, layers, { x: 0, y: 0, width: px, height: px });
  }, [layers]);
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={label}
      data-testid="emotion-preview"
      data-layers={layers.map((l) => l.id).join(',')}
      width={PREVIEW_SIZE}
      height={PREVIEW_SIZE}
      className="checker block aspect-square w-full max-w-[340px] shrink-0 self-center rounded-md border border-border"
    />
  );
}

export function EditorPanel() {
  const draft = useEditor((s) => s.draft);
  const editingId = useEditor((s) => s.editingId);
  const setDraft = useEditor((s) => s.setDraft);
  const reset = useEditor((s) => s.reset);
  const resolve = useLayerResolver();
  const nameOf = usePartNames();
  const notify = useNotify();

  const layers = useMemo(() => stackOf(draft, resolve), [draft, resolve]);
  const summary = summaryText(draft, nameOf);

  const save = () => {
    const { draft: d, editingId: editing } = useEditor.getState();
    const r = saveDraft(useEmotions.getState().data.expressions, d, editing, () => newId('e'));
    if (!r.ok) {
      notify(S.needPart, 'warning');
      return;
    }
    useEmotions.getState().patch({ expressions: r.expressions });
    notify(r.mode === 'added' ? S.saved : S.updated, 'success');
    reset();
  };

  const random = () => {
    setDraft(randomSelection(candidatesOf(useEmotions.getState().data.customParts)));
  };

  const rows = decorationRows(draft.decorations).map((r) => ({
    id: r.id,
    name: S.layerName(r.order, nameOf(r.id) ?? r.id),
  }));

  return (
    <section
      id="emotion-editor"
      aria-labelledby="emotion-editor-title"
      className="@container flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-3"
    >
      <div className="flex items-center gap-2">
        <h2 id="emotion-editor-title" className="m-0 text-base font-semibold text-fg">
          {S.editorTitle}
        </h2>
        {editingId ? (
          <span
            className="rounded-sm bg-accent-soft px-1.5 py-0.5 text-xs text-accent"
            data-testid="editing-badge"
          >
            {S.editingBadge}
          </span>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col gap-3 @2xl:flex-row @2xl:items-start">
        <PreviewCanvas layers={layers} label={S.previewLabel(summary)} />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <Field label={S.label} hint={S.labelHint}>
            <TextArea
              rows={2}
              value={draft.label}
              placeholder={S.labelPlaceholder}
              onChange={(e) => setDraft({ label: e.target.value })}
              className="resize-y"
            />
          </Field>
          <Field label={S.showText} layout="inline">
            <Toggle checked={draft.showText} onCheckedChange={(v) => setDraft({ showText: v })} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" icon={<Save />} onClick={save}>
              {editingId ? S.update : S.save}
            </Button>
            {editingId ? <Button onClick={reset}>{S.cancelEdit}</Button> : null}
            <Button icon={<Dices />} onClick={random}>
              {S.random}
            </Button>
            <Button variant="ghost" icon={<RotateCcw />} aria-label={S.resetLabel} onClick={reset}>
              {S.reset}
            </Button>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <h3 className="m-0 text-sm font-semibold text-fg">{S.layersTitle}</h3>
              <span className="text-xs text-muted">{S.layersHint}</span>
            </div>
            <LayerList
              aria-label={S.layersLabel}
              items={rows}
              moveButtons={{ up: S.layerUp, down: S.layerDown }}
              onMove={(from, to) =>
                setDraft({
                  decorations: moveDecorationRow(useEditor.getState().draft.decorations, from, to),
                })
              }
              renderActions={(item) => (
                <IconButton
                  size="sm"
                  label={S.layerRemove(nameOf(item.id) ?? item.id)}
                  icon={<X />}
                  onClick={() =>
                    setDraft({
                      decorations: useEditor
                        .getState()
                        .draft.decorations.filter((d) => d !== item.id),
                    })
                  }
                />
              )}
              empty={S.layersEmpty}
              compact
            />
          </div>
        </div>
      </div>
    </section>
  );
}
