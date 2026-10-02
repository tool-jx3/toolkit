/**
 * 其他對話框：單色圖（F090～F092）、從素材挑選建立（F173）、貼上建立多個場景（F174）、場景範本（F175）、
 * 遺失圖片（F280）、素材詳細（F063、F064）、批次改名（F056、F181）、部件範本加入（F168）、共用設定（F219）、
 * 範本詳細（F268）、棋子範本詳細（F256）。
 */
import { useRef, useState } from 'react';
import { pickFiles, readAsText } from '@/core/files';
import {
  Button,
  Checkbox,
  ColorField,
  cn,
  Dialog,
  Segmented,
  Select,
  TextArea,
  TextInput,
  useConfirm,
} from '@/ui';
import {
  addScene,
  defaultsOf,
  sceneFromTemplate,
  setSceneForeground,
  updateEffect,
  updatePart,
} from '../actions';
import {
  Hint,
  ImageField,
  Labeled,
  NumCell,
  QUIET_CHECKBOX,
  Row,
  Thumb,
  useNotify,
  usePromptDialog,
} from '../common';
import { sceneCutin } from '../exportRoom';
import { materialLookup, partSceneUsage, tachieSize, tachieSource } from '../geometry';
import { asFile, importFiles } from '../importer';
import {
  addPartFromTemplate,
  cutinTemplateItems,
  saveImageToLibrary,
  updateCutinTemplate,
} from '../library';
import { formatKb, materialUsages, TAG_LABELS, tagsLabel } from '../materials';
import { NAMES, type Tag } from '../model';
import {
  applyPending,
  createFrom,
  currentBroken,
  exportRoom,
  repairMissing,
  replaceBroken,
} from '../ops';
import { pieceSummary } from '../pages/Others';
import { applyTemplate, parseBulkScenes, renamePairs, templateFromScene } from '../scenes';
import { commit, goPage, setSession, settings, useLibrary, useProject, useSession } from '../store';
import { S } from '../strings';

const close = () => setSession({ modal: null });

/* ---------- 單色圖（F090～F092） ---------- */

const SOLID_SWATCHES = ['#000000', '#ffffff', '#1d2333', '#3a2a1c', '#2b3a2a', '#3c1f2c'];
const SOLID_SIZES = [8, 16, 64, 256];

export function SolidDialog() {
  const n = useNotify();
  const [color, setColor] = useState('#000000');
  const [name, setName] = useState('');
  const [size, setSize] = useState(8);
  const [busy, setBusy] = useState(false);
  const make = async () => {
    setBusy(true);
    try {
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const cx = c.getContext('2d');
      if (!cx) throw new Error('canvas');
      cx.fillStyle = color;
      cx.fillRect(0, 0, size, size);
      const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'));
      if (!blob) throw new Error('encode');
      const label = name.trim() || S.solidDefaultName(color);
      const r = await importFiles([asFile(blob, `${label}.png`, 'image/png')], {
        label,
        tags: ['fg'],
      });
      const out = r.names[0];
      if (!out) throw new Error('import');
      commit((d) => {
        const m = d.materials.find((x) => x.name === out);
        if (m) {
          m.label = label;
          m.tags = ['fg'];
        }
      });
      close();
      if (!applyPending(out)) goPage('materials');
      n(S.solidDone(label), 'success');
    } catch {
      n(S.solidFailed, 'danger');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      className={QUIET_CHECKBOX}
      open
      size="sm"
      title={S.solidTitle}
      onOpenChange={(o) => !o && close()}
      footer={
        <Button variant="primary" loading={busy} onClick={() => void make()}>
          {S.solidGo}
        </Button>
      }
    >
      <div className="flex flex-col gap-3 text-sm" data-testid="solid-dialog">
        <Hint>{S.solidLead}</Hint>
        <Labeled label={S.solidColor}>
          <ColorField aria-label={S.solidColor} value={color} onChange={setColor} />
        </Labeled>
        <Row>
          <span className="text-xs text-muted">{S.solidSwatches}</span>
          {SOLID_SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              title={c}
              onClick={() => setColor(c)}
              className="size-6 rounded-sm border border-border-strong focus-visible:focus-ring"
              style={{ background: c }}
            />
          ))}
        </Row>
        <Labeled label={S.solidName}>
          <TextInput
            aria-label={S.solidName}
            placeholder={S.solidNamePlaceholder}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Labeled>
        <Labeled label={S.solidSize}>
          <Segmented
            size="sm"
            value={String(size)}
            onValueChange={(v) => setSize(Number(v))}
            options={SOLID_SIZES.map((v) => ({ value: String(v), label: `${v}×${v}` }))}
          />
        </Labeled>
      </div>
    </Dialog>
  );
}

/* ---------- 從素材挑選建立（F173） ---------- */

export function MultiPickDialog({
  kind,
}: {
  kind: 'scene' | 'tachie' | 'marker' | 'panel' | 'cutin';
}) {
  const n = useNotify();
  const materials = useProject((s) => s.data.materials);
  const role: Tag | null = kind === 'scene' ? 'fg' : kind === 'tachie' ? 'tachie' : null;
  const [others, setOthers] = useState(
    () => !role || !materials.some((m) => m.tags.includes(role)),
  );
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string[]>([]);
  const last = useRef<string | null>(null);
  const list = materials.filter(
    (m) =>
      (others || !role || m.tags.includes(role)) &&
      (!q || m.label.toLowerCase().includes(q.toLowerCase())),
  );
  const click = (name: string, shift: boolean) => {
    if (shift && last.current) {
      const a = list.findIndex((m) => m.name === last.current);
      const b = list.findIndex((m) => m.name === name);
      if (a >= 0 && b >= 0) {
        const range = (a <= b ? list.slice(a, b + 1) : list.slice(b, a + 1).reverse()).map(
          (m) => m.name,
        );
        setSel([...sel, ...range.filter((x) => !sel.includes(x))]);
        last.current = name;
        return;
      }
    }
    setSel(sel.includes(name) ? sel.filter((x) => x !== name) : [...sel, name]);
    last.current = name;
  };
  return (
    <Dialog
      className={QUIET_CHECKBOX}
      open
      size="xl"
      title={S.multiTitle[kind]}
      onOpenChange={(o) => !o && close()}
      footer={
        <Button
          variant="primary"
          disabled={!sel.length}
          onClick={() => {
            if (!sel.length) return n(S.multiNoneSelected, 'warning');
            close();
            createFrom(kind, sel, n);
          }}
        >
          {S.multiGo(sel.length, S.multiWhat[kind])}
        </Button>
      }
    >
      <div className="flex flex-col gap-2" data-testid="multi-pick">
        <Hint>{S.multiLead}</Hint>
        <Row>
          <TextInput
            aria-label={S.filterName}
            placeholder={S.filterName}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-40"
          />
          <Button
            size="sm"
            onClick={() =>
              setSel([...sel, ...list.map((m) => m.name).filter((x) => !sel.includes(x))])
            }
          >
            {S.multiAll}
          </Button>
          <Button size="sm" onClick={() => setSel([])}>
            {S.multiNone}
          </Button>
          {role ? (
            <Checkbox
              checked={others}
              onCheckedChange={(v) => setOthers(!!v)}
              aria-label={S.multiOthers(TAG_LABELS[role])}
              label={S.multiOthers(TAG_LABELS[role])}
            />
          ) : null}
        </Row>
        {!list.length ? <Hint>{S.multiEmpty}</Hint> : null}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2">
          {list.map((m) => {
            const at = sel.indexOf(m.name);
            return (
              <button
                key={m.name}
                type="button"
                data-multi-tile={m.name}
                aria-pressed={at >= 0}
                onClick={(e) => click(m.name, e.shiftKey)}
                className={cn(
                  'flex min-w-0 flex-col gap-1 rounded-md border border-border bg-surface-2 p-1.5 text-left focus-visible:focus-ring',
                  at >= 0 && 'border-accent ring-2 ring-accent',
                )}
              >
                <Thumb name={m.name} className="aspect-square w-full" />
                <span className="truncate text-xs">{m.label}</span>
                <span className="truncate text-[11px] text-muted">
                  {at >= 0 ? S.multiOrder(at + 1) : tagsLabel(m)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </Dialog>
  );
}

/* ---------- 貼上建立多個場景（F174） ---------- */

export function BulkDialog() {
  const n = useNotify();
  const [text, setText] = useState('');
  const run = (t: string) => {
    const rows = parseBulkScenes(t, useProject.getState().data.materials);
    if (!rows.length) return n(S.bulkNone, 'warning');
    let last = '';
    commit((d) => {
      for (const r of rows) {
        const s = addScene(d, r.name, r.foregroundUrl);
        s.text = r.text;
        last = s.id;
      }
    });
    close();
    setSession({ sceneId: last, sceneSel: [] });
    goPage('scenes');
    n(S.bulkDone(rows.length), 'success');
  };
  return (
    <Dialog
      className={QUIET_CHECKBOX}
      open
      size="lg"
      title={S.bulkTitle}
      onOpenChange={(o) => !o && close()}
      footer={
        <>
          <Button
            onClick={async () => {
              const [f] = await pickFiles({ accept: '.csv,.tsv,.txt,text/csv,text/plain' });
              if (!f) return;
              try {
                run((await readAsText(f)).replace(/^﻿/, ''));
              } catch (e) {
                n(S.bulkFileFailed(e instanceof Error ? e.message : String(e)), 'danger');
              }
            }}
          >
            {S.bulkFile}
          </Button>
          <Button variant="primary" onClick={() => run(text)}>
            {S.bulkGo}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <Hint>{S.bulkLead}</Hint>
        <TextArea
          aria-label={S.bulkTitle}
          rows={10}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
    </Dialog>
  );
}

/* ---------- 場景範本（F175） ---------- */

export function SceneTemplatesDialog() {
  const n = useNotify();
  const templates = useProject((s) => s.data.sceneTemplates);
  const sceneId = useSession((s) => s.sceneId);
  const scene = useProject((s) => s.data.scenes.find((x) => x.id === sceneId));
  const [ask, node] = usePromptDialog();
  return (
    <Dialog
      className={QUIET_CHECKBOX}
      open
      size="lg"
      title={S.templatesTitle}
      onOpenChange={(o) => !o && close()}
    >
      <div className="flex flex-col gap-2" data-testid="scene-templates">
        <Hint>{S.templatesLead}</Hint>
        <div>
          <Button
            variant="primary"
            onClick={async () => {
              if (!scene) return n(S.needScene, 'warning');
              const v = await ask(S.templateRegister, S.templateName, scene.name || NAMES.template);
              if (v == null) return;
              commit((d) => {
                const s = d.scenes.find((x) => x.id === scene.id);
                if (s) d.sceneTemplates.push(templateFromScene(s, v || s.name || NAMES.template));
              });
              n(S.templateRegistered, 'success');
            }}
          >
            {S.templateRegister}
          </Button>
        </div>
        {!templates.length ? <Hint>{S.templatesEmpty}</Hint> : null}
        {templates.map((t) => (
          <Row key={t.id}>
            <Thumb name={t.foregroundUrl} className="h-9 w-14" fit="cover" />
            <b className="min-w-0 flex-1 truncate text-sm">{t.name}</b>
            <Button
              size="sm"
              onClick={() => {
                let id: string | null = null;
                commit((d, c) => {
                  id = sceneFromTemplate(d, t.id, c)?.id ?? null;
                });
                if (id) setSession({ sceneId: id, sceneSel: [] });
                goPage('scenes');
                n(S.templateCreated, 'success');
              }}
            >
              {S.templateNew}
            </Button>
            {(['all', 'keep'] as const).map((mode) => (
              <Button
                key={mode}
                size="sm"
                onClick={() => {
                  if (!scene) return n(S.needScene, 'warning');
                  commit((d, c) => {
                    const s = d.scenes.find((x) => x.id === scene.id);
                    const tp = d.sceneTemplates.find((x) => x.id === t.id);
                    if (s && tp)
                      applyTemplate(tp, s, d.room, c.tool.tachieGap, {
                        keepForeground: mode === 'keep',
                      });
                  });
                  n(S.templateApplied, 'success');
                }}
              >
                {mode === 'all' ? S.templateApply : S.templateApplyKeep}
              </Button>
            ))}
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                commit((d) => {
                  d.sceneTemplates = d.sceneTemplates.filter((x) => x.id !== t.id);
                })
              }
            >
              {S.templateDelete}
            </Button>
          </Row>
        ))}
        {node}
      </div>
    </Dialog>
  );
}

/* ---------- 遺失圖片（F280） ---------- */

export function BrokenDialog() {
  const n = useNotify();
  const confirm = useConfirm();
  const materials = useProject((s) => s.data.materials);
  useProject((s) => s.data);
  const list = currentBroken();
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [uploadFor, setUploadFor] = useState(list[0]?.name ?? '');
  const options = [
    { value: '__none__', label: S.brokenReplaceNone },
    ...materials.map((m) => ({ value: m.name, label: m.label })),
  ];
  return (
    <Dialog
      className={QUIET_CHECKBOX}
      open
      size="lg"
      title={S.brokenDialog}
      onOpenChange={(o) => !o && close()}
    >
      <div className="flex flex-col gap-3 text-sm" data-testid="broken-dialog">
        {!list.length ? (
          <>
            <p className="m-0 text-success">{S.brokenNone}</p>
            <div>
              <Button
                variant="primary"
                onClick={() => {
                  close();
                  void exportRoom(n);
                }}
              >
                {S.brokenContinue}
              </Button>
            </div>
          </>
        ) : (
          <>
            <b className="text-danger">{S.brokenCount(list.length)}</b>
            <Hint>{S.brokenLead}</Hint>
            {list.map((b) => (
              <div
                key={b.name}
                className="flex flex-col gap-1 rounded-md border border-border p-2"
                data-broken={b.name}
              >
                <code className="text-xs break-all">{b.name}</code>
                <ul className="m-0 pl-5 text-xs">
                  {b.uses.map((u) => (
                    <li key={u}>{u}</li>
                  ))}
                </ul>
                <Labeled label={S.brokenReplace}>
                  <Select
                    aria-label={`${S.brokenReplace}：${b.name}`}
                    value={choice[b.name] ?? '__none__'}
                    onValueChange={(v) => setChoice({ ...choice, [b.name]: v })}
                    options={options}
                  />
                </Labeled>
              </div>
            ))}
            <Row>
              <Button
                variant="primary"
                onClick={async () => {
                  n(S.brokenAutoDone(await repairMissing()), 'success');
                }}
              >
                {S.brokenAuto}
              </Button>
              <Button
                onClick={() => {
                  let k = 0;
                  for (const [old, nm] of Object.entries(choice)) {
                    if (nm && nm !== '__none__') {
                      replaceBroken(old, nm);
                      k++;
                    }
                  }
                  n(S.brokenApplied(k), 'success');
                }}
              >
                {S.brokenApply}
              </Button>
            </Row>
            <Row>
              <Labeled label={S.brokenUploadFor}>
                <Select
                  aria-label={S.brokenUploadFor}
                  value={uploadFor || list[0].name}
                  onValueChange={setUploadFor}
                  options={list.map((b) => ({ value: b.name, label: b.uses[0] ?? b.name }))}
                />
              </Labeled>
              <Button
                onClick={async () => {
                  const [f] = await pickFiles({ accept: 'image/*' });
                  if (!f) return;
                  const r = await importFiles([f]);
                  if (r.names[0]) {
                    replaceBroken(uploadFor || list[0].name, r.names[0]);
                    n(S.brokenUploaded, 'success');
                  }
                }}
              >
                {S.brokenUpload}
              </Button>
            </Row>
            <div className="flex flex-col gap-1 border-t border-border pt-2">
              <div>
                <Button
                  variant="danger"
                  onClick={async () => {
                    if (
                      !(await confirm({
                        title: S.brokenExclude,
                        description: S.brokenExcludeConfirm,
                        danger: true,
                      }))
                    )
                      return;
                    for (const b of list) replaceBroken(b.name, null);
                    close();
                    void exportRoom(n);
                  }}
                >
                  {S.brokenExclude}
                </Button>
              </div>
              <Hint>{S.brokenExcludeNote}</Hint>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}

/* ---------- 素材詳細（F063、F064） ---------- */

export function InfoDialog({ name }: { name: string }) {
  const n = useNotify();
  const p = useProject((s) => s.data);
  const sceneId = useSession((s) => s.sceneId);
  const m = p.materials.find((x) => x.name === name);
  if (!m) return null;
  const usages = materialUsages(p, name);
  const scene = p.scenes.find((s) => s.id === sceneId);
  const go = (u: (typeof usages)[number]) => {
    close();
    const t = u.target;
    if (t.page === 'scenes') {
      setSession({ sceneId: t.sceneId, sceneSel: [] });
      goPage('scenes');
    } else if (t.page === 'room') {
      if ('partId' in t) setSession({ roomSel: [t.partId] });
      goPage('room');
    } else goPage(t.page);
  };
  return (
    <Dialog
      className={QUIET_CHECKBOX}
      open
      size="lg"
      title={`${S.infoTitle}：${m.label}`}
      onOpenChange={(o) => !o && close()}
    >
      <div className="grid gap-3 md:grid-cols-[200px_minmax(0,1fr)]" data-testid="info-dialog">
        <Thumb name={name} className="aspect-square w-full" />
        <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted">{S.infoSize}</dt>
          <dd className="m-0">{m.width ? `${m.width}×${m.height} px` : S.infoUnknown}</dd>
          <dt className="text-muted">{S.infoBytes}</dt>
          <dd className="m-0">
            {formatKb(m.before)} → {formatKb(m.after)}
          </dd>
          <dt className="text-muted">{S.infoTags}</dt>
          <dd className="m-0">{tagsLabel(m)}</dd>
          {m.animated ? (
            <>
              <dt className="text-muted">{S.animated}</dt>
              <dd className="m-0">{S.infoAnimated}</dd>
            </>
          ) : null}
          <dt className="text-muted">{S.infoZipName}</dt>
          <dd className="m-0 font-mono text-xs break-all">{name}</dd>
          <dt className="text-muted">{S.infoUsages}</dt>
          <dd className="m-0">
            {!usages.length ? (
              S.infoNoUsage
            ) : (
              <ul className="m-0 pl-4">
                {usages.map((u, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: 唯讀清單，順序固定
                  <li key={`${u.label}${i}`}>
                    <button
                      type="button"
                      className="text-left text-accent hover:underline"
                      onClick={() => go(u)}
                    >
                      {u.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </dl>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
        <b className="w-full text-sm">{S.infoUse}</b>
        {scene ? (
          <Button
            size="sm"
            onClick={() => {
              commit((d) => setSceneForeground(d, scene.id, name));
              n(S.mediaFgDone, 'success');
            }}
          >
            {S.infoUseScene}
          </Button>
        ) : null}
        <Button
          size="sm"
          onClick={() => {
            commit((d) => {
              d.room.foregroundUrl = name;
            });
            n(S.infoUseRoomFg, 'success');
          }}
        >
          {S.infoUseRoomFg}
        </Button>
        {(['tachie', 'marker', 'panel', 'cutin'] as const).map((k) => (
          <Button
            key={k}
            size="sm"
            onClick={() => {
              close();
              createFrom(k, [name], n);
            }}
          >
            {S.createAs[k]}
          </Button>
        ))}
      </div>
    </Dialog>
  );
}

/* ---------- 批次改名（F056、F181） ---------- */

export function RenameDialog({ target }: { target: 'materials' | 'scenes' }) {
  const n = useNotify();
  const sess = useSession();
  /* 對象在開啟時決定 */
  const [items] = useState(() => {
    const p = useProject.getState().data;
    const sess = useSession.getState();
    if (target === 'scenes') {
      const checked = sess.sceneSel.length
        ? p.scenes.filter((s) => sess.sceneSel.includes(s.id))
        : p.scenes;
      return checked.map((s) => ({ id: s.id, name: s.name, thumb: s.foregroundUrl }));
    }
    const shown = p.materials.filter(
      (m) =>
        (!sess.imgQuery || m.label.toLowerCase().includes(sess.imgQuery.toLowerCase())) &&
        (!sess.imgTags.length || sess.imgTags.some((t) => m.tags.includes(t))),
    );
    const list = sess.imgSel.length ? shown.filter((m) => sess.imgSel.includes(m.name)) : shown;
    return list.map((m) => ({ id: m.name, name: m.label, thumb: m.name as string | null }));
  });
  const [text, setText] = useState(items.map((x) => x.name).join('\n'));
  const lines = text.split('\n');
  const apply = () => {
    const pairs = renamePairs(
      text,
      items.map((x) => x.name),
    );
    commit((d) => {
      for (const [i, v] of pairs) {
        if (target === 'scenes') {
          const s = d.scenes.find((x) => x.id === items[i].id);
          if (s) s.name = v;
        } else {
          const m = d.materials.find((x) => x.name === items[i].id);
          if (m) m.label = v;
        }
      }
    });
    close();
    n(target === 'scenes' ? S.renameDone(pairs.length) : S.renamed(pairs.length), 'success');
  };
  const checked = target === 'scenes' ? sess.sceneSel.length > 0 : sess.imgSel.length > 0;
  return (
    <Dialog
      className={QUIET_CHECKBOX}
      open
      size="lg"
      title={target === 'scenes' ? S.sceneRenameTitle : S.materialRenameTitle}
      onOpenChange={(o) => !o && close()}
      footer={
        <Button variant="primary" onClick={apply}>
          {S.renameGo}
        </Button>
      }
    >
      <div className="flex flex-col gap-2" data-testid="rename-dialog">
        <Hint>
          {target === 'scenes'
            ? S.sceneRenameTarget(items.length, checked)
            : S.materialRenameTarget(items.length, checked)}
          ・{S.renameLead}
        </Hint>
        <div className="grid gap-2 md:grid-cols-2">
          <TextArea
            aria-label={S.renameGo}
            rows={Math.min(16, Math.max(6, items.length))}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="font-mono"
          />
          <ol className="m-0 flex list-none flex-col gap-1 p-0 text-xs">
            {items.map((x, i) => (
              <li key={x.id} className="flex items-center gap-2">
                <span className="w-6 text-right text-muted tabular-nums">{i + 1}</span>
                <Thumb name={x.thumb} className="h-6 w-9" />
                <span className="min-w-0 flex-1 truncate">{x.name}</span>
                {lines[i]?.trim() && lines[i].trim() !== x.name ? (
                  <span className="truncate text-accent">→ {lines[i].trim()}</span>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Dialog>
  );
}

/* ---------- 部件範本加入（F168） ---------- */

export function PartTemplatesDialog() {
  const n = useNotify();
  const list = useLibrary((s) => s.data.partTemplates);
  return (
    <Dialog
      className={QUIET_CHECKBOX}
      open
      size="lg"
      title={S.partTemplatesTitle}
      onOpenChange={(o) => !o && close()}
    >
      <div className="flex flex-col gap-2" data-testid="part-templates">
        <Hint>{S.partTemplatesNote}</Hint>
        {!list.length ? <Hint>{S.partTemplatesEmpty}</Hint> : null}
        {list.map((t) => (
          <Row key={t.id}>
            <Thumb name={t.imageUrl} className="size-10" />
            <b className="min-w-0 flex-1 truncate text-sm">{t.name}</b>
            <span className="text-xs text-muted">
              {t.kind === 'panel' ? S.panelsCol : S.markersCol}・{t.width}×{t.height}
            </span>
            <Button
              size="sm"
              onClick={async () => {
                const id = await addPartFromTemplate(t.id);
                if (id) setSession({ roomSel: [id] });
                n(S.templateAdded, 'success');
              }}
            >
              {S.templateAdd}
            </Button>
          </Row>
        ))}
      </div>
    </Dialog>
  );
}

/* ---------- 共用設定（F219） ---------- */

export function SourceDialog({
  target: r,
}: {
  target: { kind: 'tachie' | 'part' | 'effect' | 'cutin'; id: string; sceneId?: string };
}) {
  const p = useProject((s) => s.data);
  const find = materialLookup(p.materials);
  const title =
    r.kind === 'tachie'
      ? S.secTachie
      : r.kind === 'part'
        ? S.partsTitle
        : r.kind === 'effect'
          ? S.secEffect
          : S.secCutin;
  let body: React.ReactNode = <Hint>{S.noParts}</Hint>;
  if (r.kind === 'tachie') {
    const tc = p.tachie.find((x) => x.id === r.id);
    if (tc) {
      const src = tachieSource(p, tc);
      const { width, height } = tachieSize(p, tc, find);
      const upd = (target: string, patch: object) =>
        commit((d) => {
          const t = d.tachie.find((x) => x.id === target);
          if (t) Object.assign(t, patch);
        });
      body = (
        <div className="flex flex-col gap-2 text-sm">
          <Hint>{S.tachieLead}</Hint>
          <Row>
            <ImageField
              aria-label={S.tachieImage}
              value={tc.imageUrl}
              onChange={(v) => upd(tc.id, { imageUrl: v })}
              useFor="tachie"
            />
            <Labeled label={S.tachieExpression}>
              <TextInput
                aria-label={S.tachieExpression}
                value={tc.expression}
                onChange={(e) => upd(tc.id, { expression: e.target.value })}
              />
            </Labeled>
          </Row>
          <Row>
            <Labeled label={S.tachieHeight}>
              <NumCell
                aria-label={S.tachieHeight}
                value={src.height}
                onCommit={(v) => v != null && upd(src.id, { height: Math.max(1, Math.round(v)) })}
              />
            </Labeled>
            <Labeled label={S.tachieDy}>
              <NumCell
                aria-label={S.tachieDy}
                value={src.dy}
                onCommit={(v) => upd(src.id, { dy: Math.round(v ?? 0) })}
              />
            </Labeled>
            <Labeled label={S.tachieZ}>
              <NumCell
                aria-label={S.tachieZ}
                value={src.z}
                placeholder={String(defaultsOf(p, { find, tool: settings() }).z.tachie)}
                onCommit={(v) => upd(src.id, { z: v })}
              />
            </Labeled>
          </Row>
          <Hint>
            {width}×{height}
          </Hint>
        </div>
      );
    }
  } else if (r.kind === 'part') {
    const part = p.parts.find((x) => x.id === r.id);
    if (part) {
      const upd = (patch: object) => commit((d, c) => updatePart(d, part.id, patch, c));
      const usage = partSceneUsage(p, part.id);
      body = (
        <div className="flex flex-col gap-2 text-sm">
          <Row>
            <ImageField
              aria-label={S.partImage}
              value={part.imageUrl}
              onChange={(v) => upd({ imageUrl: v })}
            />
            <Labeled label={S.partName}>
              <TextInput
                aria-label={S.partName}
                value={part.name}
                onChange={(e) => upd({ name: e.target.value })}
              />
            </Labeled>
          </Row>
          <Row>
            {(['x', 'y', 'width', 'height', 'z'] as const).map((k) => (
              <Labeled
                key={k}
                label={
                  k === 'x'
                    ? S.posX
                    : k === 'y'
                      ? S.posY
                      : k === 'z'
                        ? S.zOrder
                        : k === 'width'
                          ? S.width
                          : S.height
                }
              >
                <NumCell
                  aria-label={k}
                  value={part[k]}
                  className="w-16"
                  onCommit={(v) => v != null && upd({ [k]: v })}
                />
              </Labeled>
            ))}
          </Row>
          <Labeled label={S.partText}>
            <TextArea
              aria-label={S.partText}
              rows={2}
              value={part.text}
              onChange={(e) => upd({ text: e.target.value })}
            />
          </Labeled>
          {part.kind === 'marker' ? (
            <Hint>
              {S.partUsage}：{S.partUsageKinds.hidden} {usage.hidden.length}・
              {S.partUsageKinds.image} {usage.image.length}・{S.partUsageKinds.moved}{' '}
              {usage.moved.length}
            </Hint>
          ) : null}
        </div>
      );
    }
  } else if (r.kind === 'effect') {
    const s = p.scenes.find((x) => x.id === r.sceneId);
    const m = s?.markers.find((x) => x.id === r.id);
    if (s && m) {
      const upd = (patch: object) => commit((d, c) => updateEffect(d, s.id, m.id, patch, c));
      body = (
        <div className="flex flex-col gap-2 text-sm">
          <Row>
            <ImageField
              aria-label={S.effectImageEmpty}
              value={m.imageUrl}
              onChange={(v) => upd({ imageUrl: v })}
              useFor="effect"
            />
            <Labeled label={S.effectName}>
              <TextInput
                aria-label={S.effectName}
                value={m.name}
                onChange={(e) => upd({ name: e.target.value })}
              />
            </Labeled>
          </Row>
          {m.kind === 'free' ? (
            <Row>
              {(['x', 'y', 'width', 'height'] as const).map((k) => (
                <Labeled key={k} label={k}>
                  <NumCell
                    aria-label={k}
                    value={m[k]}
                    className="w-16"
                    onCommit={(v) => v != null && upd({ [k]: v })}
                  />
                </Labeled>
              ))}
            </Row>
          ) : null}
          <Row>
            <Labeled label={S.zOrder}>
              <NumCell
                aria-label={S.zOrder}
                value={m.z}
                onCommit={(v) => v != null && upd({ z: v })}
              />
            </Labeled>
            <Labeled label={S.effectText}>
              <TextInput
                aria-label={S.effectText}
                value={m.text}
                onChange={(e) => upd({ text: e.target.value })}
              />
            </Labeled>
          </Row>
        </div>
      );
    }
  } else {
    const c =
      p.cutins.find((x) => x.id === r.id) ??
      (r.sceneId ? sceneCutin(p.scenes.find((s) => s.id === r.sceneId)!, p.cutins) : undefined);
    if (c) {
      const upd = (patch: object) =>
        commit((d) => {
          const x = d.cutins.find((y) => y.id === c.id);
          if (x) Object.assign(x, patch);
        });
      body = (
        <Row>
          <ImageField
            aria-label={S.cutinChoice}
            value={c.imageUrl}
            onChange={(v) => upd({ imageUrl: v })}
            useFor="effect"
          />
          <TextInput
            aria-label={S.cutinName}
            value={c.name}
            onChange={(e) => upd({ name: e.target.value })}
          />
        </Row>
      );
    }
  }
  return (
    <Dialog
      className={QUIET_CHECKBOX}
      open
      size="md"
      title={title}
      onOpenChange={(o) => !o && close()}
    >
      <div data-testid="source-dialog">{body}</div>
    </Dialog>
  );
}

/* ---------- 範本詳細（F268）、棋子範本詳細（F256） ---------- */

export function TemplateDetailDialog({
  target: r,
}: {
  target: { kind: 'scene' | 'cutin' | 'piece'; id: string };
}) {
  const p = useProject((s) => s.data);
  const lib = useLibrary((s) => s.data);
  let body: React.ReactNode = null;
  if (r.kind === 'scene') {
    const t = p.sceneTemplates.find((x) => x.id === r.id);
    if (t) {
      const upd = (patch: object) =>
        commit((d) => {
          const x = d.sceneTemplates.find((y) => y.id === t.id);
          if (x) Object.assign(x, patch);
        });
      body = (
        <div className="flex flex-col gap-2 text-sm">
          <Labeled label={S.templateName}>
            <TextInput
              aria-label={S.templateName}
              value={t.name}
              onChange={(e) => upd({ name: e.target.value })}
            />
          </Labeled>
          <Row>
            <Labeled label={S.sceneForeground}>
              <ImageField
                aria-label={S.sceneForeground}
                value={t.foregroundUrl}
                onChange={(v) => upd({ foregroundUrl: v })}
              />
            </Labeled>
            <Labeled label={S.sceneBackground}>
              <Select
                aria-label={S.sceneBackground}
                value={t.backgroundMode}
                onValueChange={(v) => upd({ backgroundMode: v })}
                options={(['room', 'foreground', 'image', 'none'] as const).map((v) => ({
                  value: v,
                  label: S.sceneBgModes[v],
                }))}
              />
            </Labeled>
            {t.backgroundMode === 'image' ? (
              <ImageField
                aria-label={S.sceneBgImage}
                value={t.backgroundUrl}
                onChange={(v) => upd({ backgroundUrl: v })}
              />
            ) : null}
          </Row>
          <Labeled label={S.sceneText}>
            <TextArea
              aria-label={S.sceneText}
              rows={3}
              value={t.text}
              onChange={(e) => upd({ text: e.target.value })}
            />
          </Labeled>
          <Hint>
            {S.secTachie} {t.markers.filter((m) => m.kind === 'tachie').length}・{S.secEffect}{' '}
            {t.markers.filter((m) => m.kind !== 'tachie').length}・{S.secCutin} {t.cutinId ? 1 : 0}
          </Hint>
        </div>
      );
    }
  } else if (r.kind === 'cutin') {
    const t = cutinTemplateItems(lib).find((x) => x.id === r.id);
    if (t)
      body = (
        <Row>
          <ImageField
            aria-label={S.cutinChoice}
            value={t.imageUrl}
            onChange={async (v) => {
              await saveImageToLibrary(v);
              updateCutinTemplate(t.id, {
                imageUrl: v,
                imageLabel: p.materials.find((m) => m.name === v)?.label ?? '',
              });
            }}
          />
          <TextInput
            aria-label={S.cutinTemplateName}
            value={t.name}
            onChange={(e) => updateCutinTemplate(t.id, { name: e.target.value })}
          />
        </Row>
      );
  }
  return (
    <Dialog
      className={QUIET_CHECKBOX}
      open
      size="md"
      title={S.manageEdit}
      onOpenChange={(o) => !o && close()}
    >
      {body}
    </Dialog>
  );
}

export function PieceTemplateDialog({ id }: { id: string }) {
  const t = useLibrary((s) => s.data.pieceTemplates.find((x) => x.id === id));
  if (!t) return null;
  return (
    <Dialog
      className={QUIET_CHECKBOX}
      open
      size="md"
      title={t.name}
      onOpenChange={(o) => !o && close()}
    >
      <div className="flex flex-col gap-2 text-sm" data-testid="piece-template-detail">
        <Row>
          <Thumb name={t.iconUrl} className="size-14" />
          <span>{pieceSummary(t)}</span>
        </Row>
        {t.skills.length ? (
          <ul className="m-0 pl-5 text-xs">
            {t.skills.map((s, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: 唯讀清單，順序固定
              <li key={`${s.name}${i}`}>
                {s.name} {s.value} {s.damage ? `（${s.damage}）` : ''}
              </li>
            ))}
          </ul>
        ) : null}
        <Labeled label={S.pieceCommands}>
          <pre className="m-0 max-h-40 overflow-auto rounded-md bg-surface-2 p-1.5 text-xs whitespace-pre-wrap">
            {t.commands}
          </pre>
        </Labeled>
        <Labeled label={S.pieceMemo}>
          <pre className="m-0 max-h-24 overflow-auto rounded-md bg-surface-2 p-1.5 text-xs whitespace-pre-wrap">
            {t.memo}
          </pre>
        </Labeled>
      </div>
    </Dialog>
  );
}
