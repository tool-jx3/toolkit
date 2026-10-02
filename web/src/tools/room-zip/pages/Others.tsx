/**
 * 切入（F234～F237）、劇本文字（F238～F244）、棋子（F245～F256）三頁。
 */
import { Copy, GripVertical, Plus, Star, Trash2, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { historyGesture } from '@/core/storage';
import {
  Button,
  Checkbox,
  cn,
  IconButton,
  Segmented,
  Select,
  TextArea,
  TextInput,
  useChoice,
  useConfirm,
} from '@/ui';
import { addCutin, addPiece, addPieceFace, addSkill, deleteCutin } from '../actions';
import {
  Card,
  DropCreate,
  Hint,
  ImageField,
  Labeled,
  Row,
  Thumb,
  useNotify,
  usePromptDialog,
} from '../common';
import { applyKpPiece } from '../exportRoom';
import { importFiles } from '../importer';
import {
  addPieceFromTemplate,
  cutinTemplateItems,
  ensureMaterial,
  entryId,
  moveEntry,
  pieceTemplateFrom,
  saveCutinTemplate,
  saveImageToLibrary,
  savePieceTemplate,
  updateCutinTemplate,
} from '../library';
import {
  type CheckType,
  type Cutin,
  createPiece,
  KP_SYSTEM_LABELS,
  type KpSystem,
  NAMES,
  newLocalId,
  type Piece,
  type StoryText,
} from '../model';
import { createFrom } from '../ops';
import { moveSelected, moveSelectedTo } from '../scenes';
import {
  type CutinTemplate,
  commit,
  commitLibrary,
  goPage,
  type LayoutEntry,
  layout,
  patchLayout,
  patchLibrary,
  setSession,
  useLayout,
  useLibrary,
  useProject,
  useSession,
} from '../store';
import { storyBulkEntries, storySingleTitle } from '../story';
import { S } from '../strings';

const Area = ({
  value,
  onChange,
  label,
  rows = 3,
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  rows?: number;
  onFocus?: () => void;
  onBlur?: () => void;
}) => (
  <TextArea
    aria-label={label}
    rows={rows}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    {...rest}
  />
);

function useFold(key: string, initial = true): [boolean, () => void] {
  const folds = useLayout((s) => s.data.folds);
  const open = folds[key] ?? initial;
  return [open, () => patchLayout({ folds: { ...layout().folds, [key]: !open } })];
}

/* =================== 切入 =================== */

export function CutinsPage() {
  const n = useNotify();
  const cutins = useProject((s) => s.data.cutins);
  const sess = useSession();
  const confirm = useConfirm();
  const sel = new Set(sess.cutinSel);
  const fromNames = (names: string[]) => createFrom('cutin', names, n, { stay: true });
  const saveSelected = async () => {
    const list = cutins.filter((c) => sel.has(c.id));
    const existing = cutinTemplateItems();
    const names = list.map((c) => c.name);
    const dups = names.filter(
      (x, i) => names.indexOf(x) !== i || existing.some((t) => t.name === x),
    );
    if (
      dups.length &&
      !(await confirm({
        title: S.cutinSaveSelected,
        description: S.cutinDupConfirm([...new Set(dups)].join('、')),
      }))
    )
      return;
    for (const c of list)
      await saveCutinTemplate(c, cutinTemplateItems().find((t) => t.name === c.name)?.id);
    setSession({ cutinSel: [] });
    n(S.cutinSavedN(list.length), 'success');
  };
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="cutins-page">
      <Card title={S.cutinsTitle} sub={S.cutinsLead}>
        <Row>
          <Button size="sm" variant="primary" onClick={() => commit((d) => void addCutin(d))}>
            {S.cutinAdd}
          </Button>
          <Button size="sm" onClick={() => setSession({ modal: { kind: 'multi', for: 'cutin' } })}>
            {S.cutinFromMaterials}
          </Button>
        </Row>
        <DropCreate
          testId="drop-cutin"
          onMaterials={fromNames}
          onFiles={async (files) => {
            const r = await importFiles(files);
            if (r.names.length) fromNames(r.names);
          }}
        />
      </Card>
      {sel.size ? (
        <Row className="sticky top-14 z-10 rounded-md border border-accent bg-surface p-2">
          <b className="text-sm">{S.cutinSelected(sel.size)}</b>
          <Button size="sm" onClick={() => setSession({ cutinSel: cutins.map((c) => c.id) })}>
            {S.cutinSelectAll}
          </Button>
          <Button size="sm" onClick={() => setSession({ cutinSel: [] })}>
            {S.cutinSelectNone}
          </Button>
          <Button size="sm" variant="primary" onClick={() => void saveSelected()}>
            {S.cutinSaveSelected}
          </Button>
          <IconButton
            size="sm"
            label={S.cutinSelectEnd}
            icon={<X />}
            onClick={() => setSession({ cutinSel: [] })}
          />
        </Row>
      ) : null}
      {!cutins.length ? <Hint>{S.cutinNone}</Hint> : null}
      <div className="grid min-w-0 grid-cols-1 gap-2 md:grid-cols-2">
        {cutins.map((c) => (
          <CutinCard key={c.id} c={c} selected={sel.has(c.id)} />
        ))}
      </div>
      <CutinTemplates />
    </div>
  );
}

function CutinCard({ c, selected }: { c: Cutin; selected: boolean }) {
  const n = useNotify();
  const confirm = useConfirm();
  const upd = (patch: Partial<Cutin>) =>
    commit((d) => {
      const x = d.cutins.find((y) => y.id === c.id);
      if (x) Object.assign(x, patch);
    });
  return (
    <article
      data-cutin={c.id}
      data-selected={selected || undefined}
      aria-label={c.name}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button,input,textarea,label')) return;
        const cur = useSession.getState().cutinSel;
        setSession({
          cutinSel: cur.includes(c.id) ? cur.filter((x) => x !== c.id) : [...cur, c.id],
        });
      }}
      onKeyDown={() => undefined}
      className={cn(
        'flex min-w-0 cursor-pointer flex-col gap-2 rounded-md border border-border bg-surface p-2',
        selected && 'border-accent ring-2 ring-accent',
      )}
    >
      <Row>
        <ImageField
          aria-label={`${S.cutinChoice}：${c.name}`}
          value={c.imageUrl}
          onChange={(v) => upd({ imageUrl: v })}
          useFor="effect"
        />
        <TextInput
          aria-label={S.cutinName}
          value={c.name}
          onChange={(e) => upd({ name: e.target.value })}
          className="min-w-0 flex-1"
        />
      </Row>
      <Row>
        <IconButton
          size="sm"
          variant="ghost"
          label={S.cutinToTemplate}
          icon={<Star />}
          onClick={async () => {
            const dup = cutinTemplateItems().find((x) => x.name === c.name);
            if (
              dup &&
              !(await confirm({ title: S.cutinToTemplate, description: S.cutinDupConfirm(c.name) }))
            )
              return;
            await saveCutinTemplate(c, dup?.id);
            n(S.cutinSavedN(1), 'success');
          }}
        />
        <IconButton
          size="sm"
          variant="ghost"
          label={S.cutinCopy}
          icon={<Copy />}
          onClick={() =>
            commit((d) => void addCutin(d, `${c.name}${NAMES.copySuffix}`, c.imageUrl))
          }
        />
        <IconButton
          size="sm"
          variant="ghost"
          label={S.cutinDelete}
          icon={<Trash2 />}
          onClick={() => commit((d) => deleteCutin(d, c.id))}
        />
        <span className="text-xs text-muted">{S.cutinHint(c.name || NAMES.cutin)}</span>
      </Row>
    </article>
  );
}

/** 有拖曳把手、插入線的範本清單（切入範本、演出預設共用） */
export function useEntryDrag<T>(
  list: LayoutEntry<T>[],
  onMove: (from: number, to: number, after: boolean) => void,
) {
  const [drag, setDrag] = useState<{ from: number; over: number; after: boolean } | null>(null);
  const rowProps = (i: number) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!drag) return;
      e.preventDefault();
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setDrag({ ...drag, over: i, after: e.clientY > r.top + r.height / 2 });
    },
    onDrop: (e: React.DragEvent) => {
      if (!drag) return;
      e.preventDefault();
      onMove(drag.from, drag.over, drag.after);
      setDrag(null);
    },
    'data-drop': drag && drag.over === i ? (drag.after ? 'after' : 'before') : undefined,
    className: cn(
      drag &&
        drag.over === i &&
        (drag.after ? 'border-b-2 border-b-accent' : 'border-t-2 border-t-accent'),
    ),
  });
  const handleProps = (i: number) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData('text/plain', String(i));
      setDrag({ from: i, over: i, after: false });
    },
    onDragEnd: () => setDrag(null),
  });
  return { rowProps, handleProps, size: list.length };
}

function CutinTemplates() {
  const n = useNotify();
  const confirm = useConfirm();
  const entries = useLibrary((s) => s.data.cutinTemplates);
  const [open, toggle] = useFold('cutinTemplates', false);
  const [sep, setSep] = useState('');
  const count = entries.filter((e) => e.type === 'item').length;
  const { rowProps, handleProps } = useEntryDrag(entries, (from, to, after) =>
    commitLibrary((lib) => ({
      ...lib,
      cutinTemplates: moveEntry(lib.cutinTemplates, from, to, after),
    })),
  );
  const rename = async (t: CutinTemplate, v: string) => {
    const name = v.trim() || NAMES.cutin;
    if (name !== t.name && cutinTemplateItems().some((x) => x.id !== t.id && x.name === name)) {
      if (
        !(await confirm({
          title: S.cutinTemplateName,
          description: S.cutinTemplateRenameDup(name),
        }))
      )
        return;
    }
    updateCutinTemplate(t.id, { name });
  };
  const use = async (t: CutinTemplate) => {
    if (t.imageUrl)
      await ensureMaterial(t.imageUrl, { label: t.imageLabel || t.name, tags: ['effect'] });
    commit((d) => void addCutin(d, t.name, t.imageUrl));
    goPage('cutins');
    n(S.cutinTemplateUsed, 'success');
  };
  return (
    <Card data-testid="cutin-templates">
      <button
        type="button"
        aria-expanded={open}
        onClick={toggle}
        className="self-start text-left font-semibold"
      >
        {open ? '▾' : '▸'} {S.cutinTemplates(count)}
      </button>
      {open ? (
        <>
          <Row>
            <TextInput
              aria-label={S.cutinSeparator}
              placeholder={S.cutinSeparator}
              value={sep}
              onChange={(e) => setSep(e.target.value)}
              className="w-40"
            />
            <Button
              size="sm"
              onClick={() => {
                if (!sep.trim()) return n(S.cutinSeparatorEmpty, 'warning');
                commitLibrary((lib) => ({
                  ...lib,
                  cutinTemplates: [
                    ...lib.cutinTemplates,
                    { type: 'separator', id: newLocalId('sep'), label: sep.trim() },
                  ],
                }));
                setSep('');
              }}
            >
              {S.cutinSeparatorAdd}
            </Button>
          </Row>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {entries.map((e, i) => (
              <li
                key={entryId(e)}
                {...rowProps(i)}
                className={cn(
                  'flex min-w-0 items-center gap-2 rounded-sm bg-surface-2 p-1',
                  rowProps(i).className,
                )}
              >
                <span
                  {...handleProps(i)}
                  title={S.dragHandle}
                  aria-hidden
                  className="cursor-grab text-muted [&_svg]:size-4"
                >
                  <GripVertical />
                </span>
                {e.type === 'separator' ? (
                  <>
                    <TextInput
                      aria-label={S.cutinSeparator}
                      value={e.label}
                      onChange={(ev) =>
                        commitLibrary((lib) => ({
                          ...lib,
                          cutinTemplates: lib.cutinTemplates.map((x) =>
                            x.type === 'separator' && x.id === e.id
                              ? { ...x, label: ev.target.value }
                              : x,
                          ),
                        }))
                      }
                      className="min-w-0 flex-1 font-semibold"
                    />
                    <IconButton
                      size="sm"
                      variant="ghost"
                      label={S.cutinDelete}
                      icon={<Trash2 />}
                      onClick={() =>
                        commitLibrary((lib) => ({
                          ...lib,
                          cutinTemplates: lib.cutinTemplates.filter((x) => entryId(x) !== e.id),
                        }))
                      }
                    />
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      aria-label={`${S.cutinChoice}：${e.item.name}`}
                      onClick={() =>
                        setSession({
                          picker: {
                            current: e.item.imageUrl,
                            empty: S.imgEmpty,
                            role: 'effect',
                            apply: async (name) => {
                              await saveImageToLibrary(name);
                              const label =
                                useProject.getState().data.materials.find((m) => m.name === name)
                                  ?.label ?? '';
                              updateCutinTemplate(e.item.id, { imageUrl: name, imageLabel: label });
                            },
                          },
                        })
                      }
                    >
                      <Thumb name={e.item.imageUrl} className="size-9" />
                    </button>
                    <span className="hidden w-24 truncate text-[11px] text-muted sm:inline">
                      {e.item.imageLabel}
                    </span>
                    <TextInput
                      aria-label={S.cutinTemplateName}
                      defaultValue={e.item.name}
                      onBlur={(ev) => void rename(e.item, ev.target.value)}
                      className="min-w-0 flex-1"
                    />
                    <Button size="sm" onClick={() => void use(e.item)}>
                      {S.cutinTemplateUse}
                    </Button>
                    <IconButton
                      size="sm"
                      variant="ghost"
                      label={S.cutinDelete}
                      icon={<Trash2 />}
                      onClick={() =>
                        commitLibrary((lib) => ({
                          ...lib,
                          cutinTemplates: lib.cutinTemplates.filter(
                            (x) => entryId(x) !== e.item.id,
                          ),
                        }))
                      }
                    />
                  </>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Card>
  );
}

/* =================== 劇本文字 =================== */

export function StoryPage() {
  const n = useNotify();
  const sess = useSession();
  const story = useProject((s) => s.data.story);
  const templates = useLibrary((s) => s.data.storyTemplates);
  const [one, setOne] = useState({ title: '', body: '' });
  const [bulk, setBulk] = useState('');
  const [delim, setDelim] = useState('---');
  const [blank, setBlank] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [tplOpen, toggleTpl] = useFold('storyTemplates', false);
  const area = useRef<HTMLTextAreaElement>(null);
  const entries = storyBulkEntries(bulk, blank, delim);
  const sel = new Set(sess.storySel);
  const insert = (v: string) => {
    const ta = area.current;
    if (!ta) return;
    const a = ta.selectionStart;
    const b = ta.selectionEnd;
    const next = ta.value.slice(0, a) + v + ta.value.slice(b);
    setBulk(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = a + v.length;
    });
  };
  const add = (title: string, body: string) =>
    commit(
      (d) =>
        void d.story.push({
          id: newLocalId('st'),
          title: storySingleTitle(title, body, d.story.length + 1),
          body,
        }),
    );
  const click = (id: string, e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button,input,textarea')) return;
    if (e.shiftKey && sess.storyAnchor) {
      const a = story.findIndex((x) => x.id === sess.storyAnchor);
      const b = story.findIndex((x) => x.id === id);
      setSession({ storySel: story.slice(Math.min(a, b), Math.max(a, b) + 1).map((x) => x.id) });
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      setSession({
        storySel: sel.has(id) ? sess.storySel.filter((x) => x !== id) : [...sess.storySel, id],
        storyAnchor: id,
      });
      return;
    }
    setSession({ storySel: [id], storyAnchor: id });
  };
  const move = (fn: (l: StoryText[]) => StoryText[]) =>
    commit((d) => {
      d.story = fn(d.story);
    });
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="story-page">
      <Card title={S.storyTitle} sub={S.storyLead}>
        <Segmented
          size="sm"
          value={sess.storyMode}
          onValueChange={(v) => setSession({ storyMode: v as 'single' | 'bulk' })}
          options={[
            { value: 'single', label: S.storyModes.single },
            { value: 'bulk', label: S.storyModes.bulk },
          ]}
        />
        {sess.storyMode === 'single' ? (
          <>
            <Row>
              <TextInput
                aria-label={S.storyTitleField}
                placeholder={S.storyTitleField}
                value={one.title}
                onChange={(e) => setOne({ ...one, title: e.target.value })}
                className="min-w-0 flex-1"
              />
              <Button
                size="sm"
                onClick={() => {
                  patchLibrary((lib) => ({
                    ...lib,
                    storyTemplates: [
                      ...lib.storyTemplates,
                      {
                        id: newLocalId('stt'),
                        name: one.title.trim() || NAMES.template,
                        title: one.title,
                        body: one.body,
                      },
                    ],
                  }));
                  n(S.storyTemplateSaved, 'success');
                }}
              >
                {S.storyToTemplate}
              </Button>
            </Row>
            <Area
              label={S.storyBody}
              rows={8}
              value={one.body}
              onChange={(v) => setOne({ ...one, body: v })}
            />
            <div>
              <Button
                variant="primary"
                onClick={() => {
                  add(one.title, one.body);
                  setOne({ title: '', body: '' });
                  n(S.storyAdded, 'success');
                }}
              >
                {S.storyAddOne}
              </Button>
            </div>
          </>
        ) : (
          <>
            <TextArea
              ref={area}
              aria-label={S.storyBulkText}
              rows={10}
              value={bulk}
              onChange={(e) => setBulk(e.target.value)}
            />
            <Row>
              <Button size="sm" onClick={() => insert(`\n${delim.trim() || '---'}\n`)}>
                {S.storyInsertSep}
              </Button>
              <Button size="sm" onClick={() => insert('# ')}>
                {S.storyInsertTitle}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-expanded={splitOpen}
                onClick={() => setSplitOpen(!splitOpen)}
              >
                {splitOpen ? '▾' : '▸'} {S.storySplitSettings}
              </Button>
              <span className="text-xs text-muted">{S.storySplitSummary(delim.trim(), blank)}</span>
            </Row>
            {splitOpen ? (
              <Row>
                <Labeled label={S.storyDelimiter}>
                  <TextInput
                    aria-label={S.storyDelimiter}
                    value={delim}
                    onChange={(e) => setDelim(e.target.value)}
                    className="w-28"
                  />
                </Labeled>
                <Checkbox
                  checked={blank}
                  onCheckedChange={(v) => setBlank(!!v)}
                  aria-label={S.storySplitBlank}
                  label={S.storySplitBlank}
                />
              </Row>
            ) : null}
            <div className="text-xs" data-testid="story-bulk-preview">
              <b>{S.storyBulkCount(entries.length)}</b>
              {entries.length ? (
                <ol className="m-0 pl-5">
                  {entries.map((e, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: 預覽清單，順序固定
                    <li key={`${i}-${e.title}`}>{e.title}</li>
                  ))}
                </ol>
              ) : null}
            </div>
            <div>
              <Button
                variant="primary"
                onClick={() => {
                  if (!entries.length) return n(S.storyBulkNone, 'warning');
                  commit((d) => {
                    for (const e of entries)
                      d.story.push({ id: newLocalId('st'), title: e.title, body: e.body });
                  });
                  setBulk('');
                  n(S.storyBulkDone(entries.length), 'success');
                }}
              >
                {S.storyBulkGo}
              </Button>
            </div>
          </>
        )}
        {templates.length ? (
          <div className="flex flex-col gap-1">
            <button
              type="button"
              aria-expanded={tplOpen}
              onClick={toggleTpl}
              className="self-start text-sm font-semibold"
            >
              {tplOpen ? '▾' : '▸'} {S.storyTemplates(templates.length)}
            </button>
            {tplOpen
              ? templates.map((t) => (
                  <Row key={t.id}>
                    <b className="min-w-0 flex-1 truncate text-sm">{t.name}</b>
                    <Button size="sm" onClick={() => add(t.title, t.body)}>
                      {S.storyTemplateUse}
                    </Button>
                    <IconButton
                      size="sm"
                      variant="ghost"
                      label={S.storyTemplateDelete}
                      icon={<Trash2 />}
                      onClick={() =>
                        patchLibrary((lib) => ({
                          ...lib,
                          storyTemplates: lib.storyTemplates.filter((x) => x.id !== t.id),
                        }))
                      }
                    />
                  </Row>
                ))
              : null}
          </div>
        ) : null}
      </Card>
      <Card title={S.storyList(story.length)}>
        {sel.size ? (
          <Row className="rounded-md bg-surface-2 p-1.5">
            <b className="text-xs">{S.storySelected(sel.size)}</b>
            <Button size="sm" onClick={() => move((l) => moveSelected(l, sel, -1))}>
              {S.moveUp}
            </Button>
            <Button size="sm" onClick={() => move((l) => moveSelected(l, sel, 1))}>
              {S.moveDown}
            </Button>
            <Button size="sm" onClick={() => move((l) => moveSelectedTo(l, sel, 'top'))}>
              {S.moveTop}
            </Button>
            <Button size="sm" onClick={() => move((l) => moveSelectedTo(l, sel, 'bottom'))}>
              {S.moveBottom}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSession({ storySel: [] })}>
              {S.selectNone}
            </Button>
          </Row>
        ) : null}
        {!story.length ? <Hint>{S.storyEmpty}</Hint> : null}
        {story.map((x, i) => (
          <StoryItem
            key={x.id}
            x={x}
            i={i}
            selected={sel.has(x.id)}
            onClick={(e) => click(x.id, e)}
          />
        ))}
      </Card>
    </div>
  );
}

/** 正文：離開欄位時才記一步復原（F242） */
const gesture = historyGesture(useProject);

function StoryItem({
  x,
  i,
  selected,
  onClick,
}: {
  x: StoryText;
  i: number;
  selected: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  const upd = (patch: Partial<StoryText>) =>
    commit((d) => {
      const s = d.story.find((y) => y.id === x.id);
      if (s) Object.assign(s, patch);
    });
  return (
    <article
      data-story={x.id}
      data-selected={selected || undefined}
      onClick={onClick}
      onKeyDown={() => undefined}
      className={cn(
        'flex min-w-0 flex-col gap-1 rounded-md border border-border bg-surface-2 p-2',
        selected && 'border-accent ring-1 ring-accent',
      )}
    >
      <Row>
        <span className="text-xs text-muted tabular-nums">{i + 1}</span>
        <TextInput
          aria-label={`${S.storyTitleField} ${i + 1}`}
          value={x.title}
          onChange={(e) => upd({ title: e.target.value })}
          className="min-w-0 flex-1"
        />
        <IconButton
          size="sm"
          variant="ghost"
          label={S.storyDelete}
          icon={<Trash2 />}
          onClick={() =>
            commit((d) => {
              d.story = d.story.filter((y) => y.id !== x.id);
            })
          }
        />
      </Row>
      <Area
        label={`${S.storyBody} ${i + 1}`}
        rows={5}
        value={x.body}
        onChange={(v) => upd({ body: v })}
        onFocus={gesture.begin}
        onBlur={gesture.commit}
      />
    </article>
  );
}

/* =================== 棋子 =================== */

const isCoc = (s: KpSystem) => s === 'coc6' || s === 'coc7';

export function PiecesPage() {
  const n = useNotify();
  const pieces = useProject((s) => s.data.pieces);
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="pieces-page">
      <Card title={S.piecesTitle} sub={S.piecesLead}>
        <KpCard />
        <Row>
          <Button size="sm" onClick={() => commit((d) => void addPiece(d, 'enemy'))}>
            {S.addEnemy}
          </Button>
          <Button size="sm" onClick={() => commit((d) => void addPiece(d, 'ally'))}>
            {S.addAlly}
          </Button>
          <Button size="sm" onClick={() => commit((d) => void addPiece(d, 'normal'))}>
            {S.addNormal}
          </Button>
        </Row>
      </Card>
      {!pieces.length ? <Hint>{S.piecesNone}</Hint> : null}
      <div className="grid min-w-0 grid-cols-1 gap-2 xl:grid-cols-2">
        {pieces.map((c) => (
          <PieceCard key={c.id} c={c} onSaved={() => n(S.pieceTemplateSaved, 'success')} />
        ))}
      </div>
      <PieceTemplates />
    </div>
  );
}

function KpCard() {
  const n = useNotify();
  const choose = useChoice();
  const kp = useProject((s) => s.data.kp);
  const shared = useLibrary((s) => s.data.kpTemplates);
  const [pick, setPick] = useState('');
  const [ask, node] = usePromptDialog();
  const [pcOpen, togglePc] = useFold('kpPcs');
  const [tplOpen, toggleTpl] = useFold('kpTpl', false);
  const set = (fn: (k: typeof kp) => void) => commit((d) => fn(d.kp));
  const saveShared = async () => {
    const v = await ask(S.kpShared, S.kpSharedName, S.kpSharedDefault(KP_SYSTEM_LABELS[kp.system]));
    if (!v?.trim()) return;
    let name = v.trim();
    let replaceId: string | undefined;
    const same = shared.find((x) => x.system === kp.system && x.name === name);
    if (same) {
      const how = await choose({
        title: S.kpSharedDup(name),
        choices: [
          { value: 'overwrite', label: S.templateOverwriteBtn, variant: 'danger' },
          { value: 'rename', label: S.templateRename },
        ],
      });
      if (!how) return;
      if (how === 'overwrite') replaceId = same.id;
      else {
        const r = await ask(S.kpShared, S.templateNewName, `${name}${S.makerCopySuffix}`);
        if (!r?.trim()) return;
        name = r.trim();
        if (shared.some((x) => x.system === kp.system && x.name === name))
          return n(S.templateNameDup(name), 'warning');
      }
    }
    const rec = {
      id: replaceId ?? newLocalId('kt'),
      name,
      system: kp.system,
      values: { ...kp.tpl[kp.system] },
    };
    commitLibrary((lib) => ({
      ...lib,
      kpTemplates: replaceId
        ? lib.kpTemplates.map((x) => (x.id === replaceId ? rec : x))
        : [...lib.kpTemplates, rec],
    }));
    n(S.kpSharedSaved, 'success');
  };
  return (
    <section
      className="flex flex-col gap-2 rounded-md border border-border p-2"
      data-testid="kp-card"
    >
      <b className="text-sm">{S.kpTitle}</b>
      <Row>
        <Labeled label={S.kpSystem}>
          <Select
            aria-label={S.kpSystem}
            value={kp.system}
            onValueChange={(v) =>
              set((k) => {
                k.system = v as KpSystem;
              })
            }
            options={(['coc6', 'coc7', 'emoklore'] as const).map((v) => ({
              value: v,
              label: KP_SYSTEM_LABELS[v],
            }))}
          />
        </Labeled>
        {isCoc(kp.system) ? (
          <Labeled label={S.kpCheck}>
            <Select
              aria-label={S.kpCheck}
              value={kp.checkType}
              onValueChange={(v) =>
                set((k) => {
                  k.checkType = v as CheckType;
                })
              }
              options={[
                { value: 'CCB<=', label: 'CCB<=' },
                { value: 'CC<=', label: 'CC<=' },
              ]}
            />
          </Labeled>
        ) : null}
        <Button
          variant="primary"
          onClick={() => {
            commit((d) => void applyKpPiece(d, () => createPiece('kp')));
            n(S.kpGenerated, 'success');
          }}
        >
          {S.kpGenerate}
        </Button>
      </Row>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold">{S.kpOwnSkills}</span>
        {kp.skills.map((sk, i) => (
          <Row key={sk.id}>
            <TextInput
              aria-label={`${S.kpSkillName} ${i + 1}`}
              placeholder={S.kpSkillName}
              value={sk.name}
              onChange={(e) =>
                set((k) => {
                  k.skills[i].name = e.target.value;
                })
              }
              className="w-32"
            />
            <TextInput
              aria-label={`${S.kpSkillValue} ${i + 1}`}
              placeholder={S.kpSkillValue}
              value={sk.value}
              onChange={(e) =>
                set((k) => {
                  k.skills[i].value = e.target.value;
                })
              }
              className="w-20"
            />
            <IconButton
              size="sm"
              variant="ghost"
              label={S.todoDelete}
              icon={<Trash2 />}
              onClick={() => set((k) => void k.skills.splice(i, 1))}
            />
          </Row>
        ))}
        <div>
          <Button
            size="sm"
            icon={<Plus />}
            onClick={() =>
              set((k) => void k.skills.push({ id: newLocalId('ks'), name: '', value: '' }))
            }
          >
            {S.kpAddSkill}
          </Button>
        </div>
      </div>
      <button
        type="button"
        aria-expanded={pcOpen}
        onClick={togglePc}
        className="self-start text-xs font-semibold"
      >
        {pcOpen ? '▾' : '▸'} {S.kpPcs}
      </button>
      {pcOpen ? (
        <div className="flex flex-col gap-1">
          {kp.pcs.map((pc, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: 第 n 欄固定對應第 n 位玩家角色
            <Row key={`pc${i}`}>
              <TextInput
                aria-label={`${S.kpPcName} ${i + 1}`}
                value={pc}
                onChange={(e) =>
                  set((k) => {
                    k.pcs[i] = e.target.value;
                  })
                }
                className="w-40"
              />
              <IconButton
                size="sm"
                variant="ghost"
                label={S.todoDelete}
                icon={<Trash2 />}
                onClick={() => set((k) => void k.pcs.splice(i, 1))}
              />
            </Row>
          ))}
          <div>
            <Button size="sm" icon={<Plus />} onClick={() => set((k) => void k.pcs.push(''))}>
              {S.kpAddPc}
            </Button>
          </div>
        </div>
      ) : null}
      <button
        type="button"
        aria-expanded={tplOpen}
        onClick={toggleTpl}
        className="self-start text-xs font-semibold"
      >
        {tplOpen ? '▾' : '▸'} {S.kpTemplates}（{KP_SYSTEM_LABELS[kp.system]}）
      </button>
      {tplOpen ? (
        <div className="flex flex-col gap-2">
          <Row>
            <Select
              aria-label={S.kpShared}
              value={pick || '__none__'}
              onValueChange={(v) => setPick(v === '__none__' ? '' : v)}
              options={[
                { value: '__none__', label: S.kpSharedNone },
                ...shared.map((t) => ({
                  value: t.id,
                  label: `${t.name}（${KP_SYSTEM_LABELS[t.system]}）`,
                })),
              ]}
            />
            <Button
              size="sm"
              onClick={() => {
                const t = shared.find((x) => x.id === pick);
                if (!t) return n(S.kpSharedPick, 'warning');
                set((k) => {
                  k.system = t.system;
                  k.tpl[t.system] = { ...t.values };
                });
                n(S.kpSharedLoaded, 'success');
              }}
            >
              {S.kpSharedLoad}
            </Button>
            <Button size="sm" onClick={() => void saveShared()}>
              {S.kpSharedSave}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (!pick) return n(S.kpSharedPick, 'warning');
                commitLibrary((lib) => ({
                  ...lib,
                  kpTemplates: lib.kpTemplates.filter((x) => x.id !== pick),
                }));
                setPick('');
                n(S.kpSharedDeleted, 'success');
              }}
            >
              {S.kpSharedDelete}
            </Button>
          </Row>
          {(['main', 'scene', 'memo'] as const).map((f) => (
            <Labeled key={f} label={S.kpTplFields[f]}>
              <Area
                label={`${S.kpTemplates}：${S.kpTplFields[f]}`}
                rows={5}
                value={kp.tpl[kp.system][f]}
                onChange={(v) =>
                  set((k) => {
                    k.tpl[k.system][f] = v;
                  })
                }
              />
            </Labeled>
          ))}
          <Hint>{S.kpTplNote}</Hint>
        </div>
      ) : null}
      {node}
    </section>
  );
}

function PieceCard({ c, onSaved }: { c: Piece; onSaved: () => void }) {
  const n = useNotify();
  const choose = useChoice();
  const sys = useProject((s) => s.data.kp.system);
  const [facesOpen, toggleFaces] = useFold(`faces:${c.id}`, false);
  const [ask, node] = usePromptDialog();
  const upd = (fn: (x: Piece) => void) =>
    commit((d) => {
      const x = d.pieces.find((y) => y.id === c.id);
      if (x) fn(x);
    });
  const npc = c.kind === 'enemy' || c.kind === 'ally';
  const coc = isCoc(sys);
  const toTemplate = async () => {
    if (c.kind === 'kp') return n(S.pieceKpNoTemplate, 'warning');
    let name = c.name.trim() || NAMES.normal;
    let replaceId: string | undefined;
    const same = useLibrary.getState().data.pieceTemplates.find((x) => x.name.trim() === name);
    if (same) {
      const how = await choose({
        title: S.templateOverwrite(name),
        choices: [
          { value: 'overwrite', label: S.templateOverwriteBtn, variant: 'danger' },
          { value: 'rename', label: S.templateRename },
        ],
      });
      if (!how) return;
      if (how === 'overwrite') replaceId = same.id;
      else {
        const v = await ask(S.templateNewName, S.templateName, `${name}${S.makerCopySuffix}`);
        if (!v?.trim()) return;
        name = v.trim();
        if (useLibrary.getState().data.pieceTemplates.some((x) => x.name.trim() === name))
          return n(S.templateNameDup(name), 'warning');
      }
    }
    await savePieceTemplate(pieceTemplateFrom(c, name), replaceId);
    onSaved();
  };
  return (
    <article
      className="flex min-w-0 flex-col gap-2 rounded-md border border-border bg-surface p-2"
      data-piece={c.id}
      aria-label={c.name}
    >
      <Row>
        <span className="rounded-sm bg-accent-soft px-1.5 text-xs text-accent">
          {S.pieceKinds[c.kind]}
        </span>
        <TextInput
          aria-label={S.pieceName}
          value={c.name}
          onChange={(e) =>
            upd((x) => {
              x.name = e.target.value;
            })
          }
          className="min-w-0 flex-1"
        />
        {c.kind !== 'kp' ? (
          <IconButton
            size="sm"
            variant="ghost"
            label={S.pieceToTemplate}
            icon={<Star />}
            onClick={() => void toTemplate()}
          />
        ) : null}
        <IconButton
          size="sm"
          variant="ghost"
          label={S.pieceDelete}
          icon={<Trash2 />}
          onClick={() =>
            commit((d) => {
              d.pieces = d.pieces.filter((y) => y.id !== c.id);
            })
          }
        />
      </Row>
      <Row>
        <Labeled label={S.pieceIcon}>
          <ImageField
            aria-label={`${S.pieceIcon}：${c.name}`}
            value={c.iconUrl}
            onChange={(v) =>
              upd((x) => {
                x.iconUrl = v;
              })
            }
            useFor="icon"
          />
        </Labeled>
        {c.kind !== 'kp' ? (
          <>
            <Labeled label={S.pieceHp}>
              <TextInput
                aria-label={`${S.pieceHp}：${c.name}`}
                type="number"
                value={c.hp}
                onChange={(e) =>
                  upd((x) => {
                    x.hp = e.target.value;
                  })
                }
                className="w-20"
              />
            </Labeled>
            <Labeled label={S.pieceMp}>
              <TextInput
                aria-label={`${S.pieceMp}：${c.name}`}
                type="number"
                value={c.mp}
                onChange={(e) =>
                  upd((x) => {
                    x.mp = e.target.value;
                  })
                }
                className="w-20"
              />
            </Labeled>
          </>
        ) : null}
      </Row>
      <button
        type="button"
        aria-expanded={facesOpen}
        onClick={toggleFaces}
        className="self-start text-xs font-semibold"
      >
        {facesOpen ? '▾' : '▸'} {S.pieceFaces(c.faces.length)}
      </button>
      {facesOpen ? (
        <div className="flex flex-col gap-1">
          {c.faces.map((f, i) => (
            <Row key={f.id}>
              <ImageField
                aria-label={`${S.pieceFaceName} ${i + 1} 的圖`}
                value={f.iconUrl}
                onChange={(v) =>
                  upd((x) => {
                    x.faces[i].iconUrl = v;
                  })
                }
                size="sm"
              />
              <TextInput
                aria-label={`${S.pieceFaceName} ${i + 1}`}
                value={f.label}
                onChange={(e) =>
                  upd((x) => {
                    x.faces[i].label = e.target.value;
                  })
                }
                className="w-32"
              />
              <IconButton
                size="sm"
                variant="ghost"
                label={S.todoDelete}
                icon={<Trash2 />}
                onClick={() => upd((x) => void x.faces.splice(i, 1))}
              />
            </Row>
          ))}
          <div>
            <Button size="sm" icon={<Plus />} onClick={() => commit((d) => addPieceFace(d, c.id))}>
              {S.pieceFaceAdd}
            </Button>
          </div>
        </div>
      ) : null}
      {npc ? (
        <div className="flex flex-col gap-1 rounded-md bg-surface-2 p-1.5">
          <Row>
            <Labeled label={S.pieceArmor}>
              <TextInput
                aria-label={`${S.pieceArmor}：${c.name}`}
                value={c.armor}
                onChange={(e) =>
                  upd((x) => {
                    x.armor = e.target.value;
                  })
                }
                className="w-16"
              />
            </Labeled>
            <Labeled label={coc ? S.pieceDodge.coc : S.pieceDodge.emo}>
              <TextInput
                aria-label={`${S.pieceDodge.coc}：${c.name}`}
                value={c.dodge}
                disabled={c.noDodge}
                onChange={(e) =>
                  upd((x) => {
                    x.dodge = e.target.value;
                  })
                }
                className="w-16"
              />
            </Labeled>
            <Checkbox
              checked={c.noDodge}
              onCheckedChange={(v) =>
                upd((x) => {
                  x.noDodge = !!v;
                })
              }
              aria-label={`${S.pieceNoDodge}：${c.name}`}
              label={S.pieceNoDodge}
            />
          </Row>
          <span className="text-xs font-semibold">{S.pieceSkills}</span>
          {c.skills.map((sk, i) => (
            <Row key={sk.id}>
              <TextInput
                aria-label={`${S.kpSkillName}：${c.name} ${i + 1}`}
                placeholder={S.kpSkillName}
                value={sk.name}
                onChange={(e) =>
                  upd((x) => {
                    x.skills[i].name = e.target.value;
                  })
                }
                className="w-28"
              />
              <TextInput
                aria-label={`${coc ? S.pieceSkillValue.coc : S.pieceSkillValue.emo}：${c.name} ${i + 1}`}
                placeholder={coc ? S.pieceSkillValue.coc : S.pieceSkillValue.emo}
                value={sk.value}
                onChange={(e) =>
                  upd((x) => {
                    x.skills[i].value = e.target.value;
                  })
                }
                className="w-16"
              />
              <TextInput
                aria-label={`${S.pieceDamage}：${c.name} ${i + 1}`}
                placeholder={S.pieceDamage}
                value={sk.damage}
                onChange={(e) =>
                  upd((x) => {
                    x.skills[i].damage = e.target.value;
                  })
                }
                className="w-20"
              />
              <IconButton
                size="sm"
                variant="ghost"
                label={S.todoDelete}
                icon={<Trash2 />}
                onClick={() => upd((x) => void x.skills.splice(i, 1))}
              />
            </Row>
          ))}
          <div>
            <Button size="sm" icon={<Plus />} onClick={() => commit((d) => addSkill(d, c.id))}>
              {S.kpAddSkill}
            </Button>
          </div>
        </div>
      ) : null}
      <div className="grid gap-2 md:grid-cols-2">
        <Labeled label={S.pieceCommands}>
          <Area
            label={`${S.pieceCommands}：${c.name}`}
            rows={4}
            value={c.commands}
            onChange={(v) =>
              upd((x) => {
                x.commands = v;
              })
            }
          />
        </Labeled>
        <Labeled label={S.pieceMemo}>
          <Area
            label={`${S.pieceMemo}：${c.name}`}
            rows={4}
            value={c.memo}
            onChange={(v) =>
              upd((x) => {
                x.memo = v;
              })
            }
          />
        </Labeled>
      </div>
      {node}
    </article>
  );
}

function PieceTemplates() {
  const n = useNotify();
  const list = useLibrary((s) => s.data.pieceTemplates);
  return (
    <Card title={S.pieceTemplatesTitle} data-testid="piece-templates">
      {!list.length ? <Hint>{S.pieceTemplatesEmpty}</Hint> : null}
      {list.map((t) => (
        <Row key={t.id}>
          <Thumb name={t.iconUrl} className="size-10" />
          <div className="flex min-w-0 flex-1 flex-col">
            <b className="truncate text-sm">{t.name}</b>
            <span className="truncate text-xs text-muted">{pieceSummary(t)}</span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSession({ modal: { kind: 'pieceTemplate', id: t.id } })}
          >
            {S.pieceTemplateDetail}
          </Button>
          <Button
            size="sm"
            onClick={async () => {
              await addPieceFromTemplate(t.id);
              n(S.pieceTemplateUsed, 'success');
            }}
          >
            {S.pieceTemplateUse}
          </Button>
          <IconButton
            size="sm"
            variant="ghost"
            label={S.pieceTemplateDelete}
            icon={<Trash2 />}
            onClick={() =>
              commitLibrary((lib) => ({
                ...lib,
                pieceTemplates: lib.pieceTemplates.filter((x) => x.id !== t.id),
              }))
            }
          />
        </Row>
      ))}
    </Card>
  );
}

export function pieceSummary(t: {
  kind: string;
  hp: string;
  mp: string;
  armor: string;
  dodge: string;
  noDodge: boolean;
  skills: unknown[];
  faces: unknown[];
}): string {
  const parts = [
    t.hp ? `HP ${t.hp}` : '',
    t.mp ? `MP ${t.mp}` : '',
    t.armor ? `${S.pieceArmor} ${t.armor}` : '',
    t.noDodge ? S.pieceNoDodge : t.dodge ? `${S.pieceDodge.coc} ${t.dodge}` : '',
    `${S.pieceSkills} ${t.skills.length}`,
    `差分 ${t.faces.length}`,
  ].filter(Boolean);
  return S.pieceTemplateSummary(S.pieceKinds[t.kind as keyof typeof S.pieceKinds] ?? t.kind, parts);
}
