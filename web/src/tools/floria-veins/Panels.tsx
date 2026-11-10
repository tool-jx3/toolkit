/**
 * 設定欄（規格 F12～F14、F21、F49、F53、F54、F08）：這張畫布（名字、大小、排序、複製、清空、刪除）、顯示、
 * 我的圖形、原作的資料、關於這個工具。
 */
import {
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  Copy,
  Download,
  Eraser,
  FileUp,
  Pencil,
  Stamp as StampIcon,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { copyText, downloadText, pickFiles } from '@/core/files';
import { historyGesture } from '@/core/storage';
import {
  Button,
  Dialog,
  DialogClose,
  Field,
  IconButton,
  Section,
  Segmented,
  TextArea,
  TextInput,
  type ToastOptions,
  Toggle,
  useConfirm,
  useToast,
} from '@/ui';
import { isEmptyCanvas } from './model/canvas';
import { LegacyError, parseLegacy, serializeLegacy } from './model/legacy';
import { CANVAS_MAX, NAME_MAX, SIZE_CHARACTER, SIZE_MINION, STAMP_MAX } from './model/types';
import type { Layers } from './render';
import {
  activeNow,
  addLegacyCanvas,
  clearActive,
  deleteActive,
  deleteStamp,
  docNow,
  duplicateActive,
  moveActive,
  placeStamp,
  renameCanvas,
  renameStamp,
  resizeCanvas,
  saveStamp,
  stampableFigures,
  useActive,
  useDoc,
  useDraft,
  usePrefs,
} from './store';
import { S } from './strings';

const gesture = historyGesture(useDoc);

/** 這張畫布 */
export function CanvasSection() {
  const c = useActive();
  const count = useDoc((s) => s.data.canvases.length);
  const index = useDoc((s) => s.data.canvases.findIndex((x) => x.id === c.id));
  const confirm = useConfirm();
  const toast = useToast();
  const sizes = [SIZE_CHARACTER, SIZE_MINION, ...(c.size !== 11 && c.size !== 6 ? [c.size] : [])];
  const changeSize = async (v: string) => {
    const size = Number(v);
    if (size === c.size) return;
    if (
      !isEmptyCanvas(c) &&
      !(await confirm({
        title: S.canvas.resizeTitle,
        description: S.canvas.resizeText,
        confirmLabel: S.canvas.resizeConfirm,
        danger: true,
      }))
    )
      return;
    resizeCanvas(c.id, size);
  };
  return (
    <Section title={S.canvas.section} persistKey="floria-veins:canvas">
      <Field label={S.canvas.name} hint={S.canvas.nameHint}>
        <TextInput
          value={c.name}
          maxLength={NAME_MAX}
          onFocus={gesture.begin}
          onBlur={gesture.commit}
          onChange={(e) => renameCanvas(c.id, e.target.value)}
          data-testid="canvas-name"
        />
      </Field>
      <Field label={S.canvas.size} hint={S.canvas.sizeHint}>
        <Segmented<string>
          value={String(c.size)}
          onValueChange={(v) => void changeSize(v)}
          options={sizes.map((n) => ({
            value: String(n),
            label: S.canvas.sizeOptions[n] ?? S.canvas.sizeOther(n),
          }))}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-1.5">
        <IconButton
          size="sm"
          label={S.canvas.moveEarlier}
          icon={<ChevronLeft />}
          disabled={index <= 0}
          onClick={() => moveActive(-1)}
        />
        <IconButton
          size="sm"
          label={S.canvas.moveLater}
          icon={<ChevronRight />}
          disabled={index >= count - 1}
          onClick={() => moveActive(1)}
        />
        <Button
          size="sm"
          icon={<Copy />}
          disabled={count >= CANVAS_MAX}
          onClick={() => duplicateActive()}
        >
          {S.canvas.duplicate}
        </Button>
        <Button
          size="sm"
          icon={<Eraser />}
          disabled={isEmptyCanvas(c)}
          onClick={async () => {
            if (
              await confirm({
                title: S.canvas.clearTitle,
                description: S.canvas.clearText(c.name || S.canvas.untitled),
                confirmLabel: S.canvas.clearConfirm,
                danger: true,
              })
            )
              clearActive();
          }}
        >
          {S.canvas.clear}
        </Button>
        <Button
          size="sm"
          variant="danger"
          icon={<Trash2 />}
          onClick={async () => {
            if (count <= 1) {
              toast({ title: S.canvas.lastOne, tone: 'warning' });
              return;
            }
            if (
              await confirm({
                title: S.canvas.removeTitle,
                description: S.canvas.removeText(c.name || S.canvas.untitled),
                confirmLabel: S.canvas.removeConfirm,
                danger: true,
              })
            )
              deleteActive();
          }}
        >
          {S.canvas.remove}
        </Button>
      </div>
    </Section>
  );
}

/** 顯示切換 */
export function LayersSection() {
  const layers = usePrefs((s) => s.data.layers);
  const set = (k: keyof Layers, v: boolean) =>
    usePrefs.getState().patch({ layers: { ...layers, [k]: v } });
  return (
    <Section title={S.view.layers} description={S.view.layersHint} persistKey="floria-veins:layers">
      <div className="grid grid-cols-2 gap-2">
        {(Object.keys(S.view.layerNames) as (keyof Layers)[]).map((k) => (
          <Toggle
            key={k}
            checked={layers[k]}
            onCheckedChange={(v) => set(k, v)}
            label={S.view.layerNames[k]}
          />
        ))}
      </div>
    </Section>
  );
}

/** 名字的小對話框（存成圖形、改名） */
function NameDialog({
  open,
  title,
  initial,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  title: string;
  initial: string;
  onOpenChange: (v: boolean) => void;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState(initial);
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setName(initial);
  }
  const submit = () => {
    onSubmit(name.trim() || initial);
    onOpenChange(false);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      size="sm"
      footer={
        <>
          <DialogClose />
          <Button variant="primary" onClick={submit}>
            {S.stamps.ok}
          </Button>
        </>
      }
    >
      <Field label={S.stamps.nameLabel}>
        <TextInput
          value={name}
          maxLength={NAME_MAX}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
          data-testid="stamp-name"
        />
      </Field>
    </Dialog>
  );
}

/** 我的圖形 */
export function StampsSection() {
  const stamps = useDoc((s) => s.data.stamps);
  const draft = useDraft();
  const toast = useToast();
  const [dialog, setDialog] = useState<{ kind: 'save' } | { kind: 'rename'; id: string } | null>(
    null,
  );
  const savable = stampableFigures(draft).length > 0;
  const editing = dialog?.kind === 'rename' ? stamps.find((s) => s.id === dialog.id) : undefined;
  return (
    <Section
      title={S.stamps.section}
      description={S.stamps.description}
      persistKey="floria-veins:stamps"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          icon={<StampIcon />}
          disabled={!savable}
          onClick={() => {
            if (stamps.length >= STAMP_MAX)
              toast({ title: S.stamps.full(STAMP_MAX), tone: 'warning' });
            else setDialog({ kind: 'save' });
          }}
        >
          {S.stamps.save}
        </Button>
        {!savable ? <span className="text-xs text-muted">{S.stamps.saveHint}</span> : null}
      </div>
      {stamps.length ? (
        <ul className="m-0 flex list-none flex-col gap-1 p-0" data-testid="stamp-list">
          {stamps.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2 py-1"
            >
              <span className="min-w-0 flex-1 truncate text-sm">{s.name}</span>
              <span className="text-xs text-muted tabular-nums">
                {S.stamps.count(s.figures.length)}
              </span>
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  const r = placeStamp(s.id);
                  toast(
                    r === 'ok'
                      ? { title: S.stamps.placed(s.name), tone: 'success' }
                      : { title: S.stamps.tooBig, tone: 'warning' },
                  );
                }}
              >
                {S.stamps.place}
              </Button>
              <IconButton
                size="sm"
                variant="ghost"
                label={S.stamps.rename}
                icon={<Pencil />}
                onClick={() => setDialog({ kind: 'rename', id: s.id })}
              />
              <IconButton
                size="sm"
                variant="ghost"
                label={S.stamps.remove}
                icon={<Trash2 />}
                onClick={() => {
                  deleteStamp(s.id);
                  toast({ title: S.stamps.removed(s.name), tone: 'success' });
                }}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-xs text-muted">{S.stamps.empty}</p>
      )}
      <NameDialog
        open={dialog !== null}
        onOpenChange={(v) => {
          if (!v) setDialog(null);
        }}
        title={dialog?.kind === 'rename' ? S.stamps.renameTitle : S.stamps.saveTitle}
        initial={editing ? editing.name : S.stamps.defaultName(stamps.length + 1)}
        onSubmit={(name) => {
          if (dialog?.kind === 'rename') renameStamp(dialog.id, name);
          else if (saveStamp(name)) toast({ title: S.stamps.saved(name), tone: 'success' });
        }}
      />
    </Section>
  );
}

/**
 * 讀入原作的資料（貼上或選檔）：成功時通知並回傳 null；看不懂時回傳錯誤訊息（不通知，由呼叫端顯示）。
 */
export function importLegacyText(text: string, toast: (o: ToastOptions) => unknown): string | null {
  let r: ReturnType<typeof parseLegacy>;
  try {
    r = parseLegacy(text);
  } catch (e) {
    return e instanceof LegacyError ? e.message : String(e);
  }
  const id = addLegacyCanvas(r);
  if (!id) return S.canvas.full(CANVAS_MAX);
  const name = docNow().canvases.find((c) => c.id === id)?.name ?? '';
  toast({
    title: S.legacy.loaded(name),
    description: r.skipped ? S.legacy.skipped(r.skipped) : undefined,
    tone: r.skipped ? 'warning' : 'success',
  });
  return null;
}

export function LegacyDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const load = (t: string) => {
    const e = importLegacyText(t, toast);
    setError(e);
    if (!e) {
      setText('');
      onOpenChange(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={S.legacy.dialogTitle}
      description={S.legacy.dialogDescription}
      footer={
        <>
          <DialogClose />
          <Button variant="primary" disabled={!text.trim()} onClick={() => load(text)}>
            {S.legacy.load}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label={S.legacy.paste} error={error ? `${S.legacy.failed}：${error}` : undefined}>
          <TextArea
            value={text}
            rows={5}
            placeholder={S.legacy.pastePlaceholder}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
            }}
            className="font-mono text-xs"
            data-testid="legacy-text"
          />
        </Field>
        <div>
          <Button
            size="sm"
            icon={<FileUp />}
            onClick={async () => {
              const [file] = await pickFiles();
              if (file) load(await file.text());
            }}
          >
            {S.legacy.pickFile}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/** 原作的資料：讀入、寫出 */
export function LegacySection({ onOpen }: { onOpen: () => void }) {
  const toast = useToast();
  return (
    <Section
      title={S.legacy.section}
      description={S.legacy.description}
      persistKey="floria-veins:legacy"
      defaultOpen={false}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" icon={<FileUp />} onClick={onOpen}>
          {S.legacy.open}
        </Button>
        <Button
          size="sm"
          icon={<ClipboardCopy />}
          onClick={async () => {
            const ok = await copyText(serializeLegacy(activeNow()));
            toast(
              ok
                ? { title: S.legacy.copied, tone: 'success' }
                : { title: S.legacy.copyFailed, tone: 'warning' },
            );
          }}
        >
          {S.legacy.copy}
        </Button>
        <Button
          size="sm"
          icon={<Download />}
          onClick={() => downloadText(serializeLegacy(activeNow()), S.legacy.downloadName)}
        >
          {S.legacy.download}
        </Button>
      </div>
    </Section>
  );
}

/** 關於這個工具（權利人的註明） */
export function RightsNote() {
  return (
    <section
      className="rounded-md border border-border bg-surface-2 p-3 text-xs leading-relaxed text-muted"
      aria-label={S.rights.title}
      data-testid="rights-note"
    >
      <h2 className="m-0 mb-1 text-sm font-semibold text-fg">{S.rights.title}</h2>
      <p className="m-0">{S.rights.lead}</p>
      <p className="m-0 mt-1">{S.rights.program}</p>
    </section>
  );
}
