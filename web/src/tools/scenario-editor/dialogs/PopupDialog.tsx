/**
 * 彈出視窗的編輯（F110、F111、F120）：以段落保存的用書式按鈕與文字欄編輯；舊式的文字型用一個文字欄＋按鈕＋即時預覽。
 */
import { useMemo, useRef } from 'react';
import { Dialog, DialogClose, Field, TextArea, TextInput, Toggle } from '@/ui';
import { findBlock, POP_SKIP, popIsBlocks } from '../model/blocks';
import { richApply } from '../model/rich';
import { renamePopup } from '../ops';
import { BlockPanel } from '../panel/BlockPanel';
import { popupContentHtml, type RenderCtx } from '../render/html';
import { SourcePane } from '../SourcePane';
import { editBlock, setUi, useDoc, useUi } from '../store';
import { BlockOps, TypeButtons } from '../TypeButtons';
import { RICH_BUTTONS } from '../textOps';

const HEAD_BUTTONS = [
  { mark: '# ', label: '大標' },
  { mark: '## ', label: '中標' },
  { mark: '### ', label: '小標' },
];

/** 編輯視窗裡按 Esc：先離開文字欄，再按才關閉 */
export function escapeLeavesField(e: KeyboardEvent): void {
  const a = document.activeElement;
  if (a instanceof HTMLTextAreaElement || (a instanceof HTMLInputElement && a.type === 'text')) {
    e.preventDefault();
    a.blur();
  }
}

export function PopupDialog() {
  const id = useUi((s) => s.popEdit);
  const d = useDoc((s) => s.data);
  const layout = useUi((s) => s.layout);
  const sel = useUi((s) => s.sel);
  const b = id ? findBlock(d, id)?.b : null;
  const ta = useRef<HTMLTextAreaElement>(null);
  const html = useMemo(() => {
    if (!b?.pop) return '';
    const ctx: RenderCtx = {
      doc: d,
      edit: false,
      pageOf: (x) => (layout.pageOf[x] == null ? null : layout.pageOf[x] + 1),
      total: layout.pages.length,
    };
    return popupContentHtml(b.pop, ctx);
  }, [b, d, layout]);
  if (!id || !b) return null;
  const blocks = popIsBlocks(b);
  const inside = new Set((b.pop?.blocks ?? []).map((x) => x.id));
  const selInside =
    sel.length > 0 && sel.every((x) => inside.has(x) || findInside(b.pop?.blocks ?? [], x));
  const close = () => setUi({ popEdit: null });
  const applyMark = (mark: string) => {
    const el = ta.current;
    const t = String(b.pop?.body ?? '');
    const a = el ? el.selectionStart : t.length;
    const z = el ? el.selectionEnd : t.length;
    const r = richApply(t, a, z, mark);
    editBlock(b.id, (x) => {
      if (x.pop) x.pop.body = r.text;
    });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(r.a, r.z);
    });
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && close()}
      title="彈出視窗"
      size="xl"
      className="max-w-[min(1200px,calc(100vw-2rem))]"
      footer={<DialogClose>完成</DialogClose>}
    >
      <div className="flex flex-col gap-2" data-testid="se-popup-dialog">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="名稱" hint="紙面按鈕上的字。">
            <TextInput
              value={String(b.pop?.label ?? '')}
              onChange={(e) => renamePopup(b.id, e.target.value)}
            />
          </Field>
          <Field label="不放在紙面" layout="inline">
            <Toggle
              checked={!!b.pop?.only}
              onCheckedChange={(v) =>
                editBlock(b.id, (x) => {
                  if (x.pop) x.pop.only = v;
                })
              }
            />
          </Field>
        </div>
        {blocks ? (
          <div className="grid min-h-0 gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <div className="flex min-h-0 flex-col gap-2">
              <TypeButtons exclude={POP_SKIP} />
              <BlockOps compact />
              <div className="h-[46dvh] min-h-48 rounded-md border border-border">
                <SourcePane popupId={b.id} />
              </div>
            </div>
            <div className="flex min-h-0 flex-col gap-2">
              {selInside ? (
                <div className="max-h-[34dvh] overflow-auto rounded-md border border-border p-2">
                  <BlockPanel />
                </div>
              ) : null}
              <PopupPreview html={html} />
            </div>
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-1">
                {[...HEAD_BUTTONS, ...RICH_BUTTONS].map((r) => (
                  <button
                    key={r.label}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applyMark(r.mark)}
                    className="rounded-sm border border-border bg-surface-2 px-1.5 py-0.5 text-xs hover:border-accent"
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <TextArea
                ref={ta}
                rows={16}
                aria-label="彈出視窗的內容"
                value={String(b.pop?.body ?? '')}
                onChange={(e) =>
                  editBlock(b.id, (x) => {
                    if (x.pop) x.pop.body = e.target.value;
                  })
                }
              />
              <p className="m-0 text-xs text-muted">
                以空行分段；行首「#」「##」「###」是標題，也可以用巢狀書式。
              </p>
            </div>
            <PopupPreview html={html} />
          </div>
        )}
      </div>
    </Dialog>
  );
}

function findInside(
  list: readonly { id: string; tbl?: { cb: Record<string, { id: string }[]> } }[],
  id: string,
): boolean {
  return list.some(
    (x) => x.id === id || Object.values(x.tbl?.cb ?? {}).some((l) => l.some((y) => y.id === id)),
  );
}

function PopupPreview({ html }: { html: string }) {
  return (
    <div className="max-h-[56dvh] overflow-auto rounded-md bg-surface-2 p-2">
      <div className="pg" style={{ width: 'auto', height: 'auto', minHeight: 0 }}>
        <div
          className="pg-body"
          style={{ padding: '6mm', height: 'auto' }}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: 紙面的 HTML 由本工具產生（文字都已跳脫）
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}
