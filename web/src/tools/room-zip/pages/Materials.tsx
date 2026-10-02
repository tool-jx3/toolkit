/**
 * 素材頁（F035～F073）：匯入（拖放、選檔、長邊上限、轉檔開關、容量合計）、篩選、選取（Shift 範圍）、卡片（名稱、標籤、
 * 最愛、詳細、加工、刪除）、批次操作面板（標籤、依序編號、名稱取代、以選取的素材建立、刪除）、找圖網站、最愛、範本內含的圖。
 */
import {
  Brush,
  Info,
  Palette,
  Scissors,
  Sparkles,
  Star,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  Button,
  Checkbox,
  cn,
  FileDrop,
  IconButton,
  NumberInput,
  TextInput,
  Toggle,
  useConfirm,
} from '@/ui';
import { deleteMaterials, setMaterialTags } from '../actions';
import { Card, Hint, Labeled, Row, startMaterialDrag, Thumb, useNotify } from '../common';
import { importFiles, importMessage } from '../importer';
import { addFavorite, ensureMaterial, removeFavorite, takeFavorite } from '../library';
import {
  brokenImages,
  filterMaterials,
  formatMb,
  isMaterialUsed,
  sizeTotals,
  TAG_LABELS,
  toggleTag,
} from '../materials';
import { SEARCH_PLACEHOLDER, TAGS, type Tag } from '../model';
import { createFrom, openFade, openMaker } from '../ops';
import { sequenceLabel } from '../scenes';
import {
  commit,
  setSession,
  useBlobs,
  useLibrary,
  useProject,
  useSession,
  useSettings,
} from '../store';
import { S } from '../strings';

export function MaterialsPage() {
  const n = useNotify();
  const materials = useProject((s) => s.data.materials);
  const p = useProject((s) => s.data);
  const urls = useBlobs((s) => s.urls);
  const st = useSettings((s) => s.data);
  const sess = useSession();
  const lib = useLibrary((s) => s.data);
  const list = useMemo(
    () => filterMaterials(materials, sess.imgQuery, sess.imgTags),
    [materials, sess.imgQuery, sess.imgTags],
  );
  const totals = sizeTotals(materials);
  const broken = brokenImages(p, (name) => !!urls[name]);
  const tplUse = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of lib.partTemplates) if (t.imageUrl) m[t.imageUrl] = (m[t.imageUrl] ?? 0) + 1;
    for (const t of lib.pieceTemplates)
      for (const x of new Set([t.iconUrl, ...t.faces.map((f) => f.iconUrl)]))
        if (x) m[x] = (m[x] ?? 0) + 1;
    return m;
  }, [lib]);
  const selSet = new Set(sess.imgSel);

  const doImport = async (files: File[]) => {
    if (!files.length) return;
    const r = await importFiles(files);
    const msg = importMessage(r);
    n(msg.text, msg.ok ? 'success' : 'warning');
    if (r.heavy.length)
      n(
        S.importHeavyTitle,
        'warning',
        S.importHeavy(r.heavy.map((m) => `・${m.label}（${formatMb(m.after)}）`).join('\n')),
      );
  };

  const click = (name: string, shift: boolean) => {
    const order = list.map((m) => m.name);
    if (shift && sess.imgAnchor && order.includes(sess.imgAnchor)) {
      const a = order.indexOf(sess.imgAnchor);
      const b = order.indexOf(name);
      const range = order.slice(Math.min(a, b), Math.max(a, b) + 1);
      setSession({ imgSel: [...new Set([...sess.imgSel, ...range])], imgAnchor: name });
      return;
    }
    setSession({
      imgSel: selSet.has(name) ? sess.imgSel.filter((x) => x !== name) : [...sess.imgSel, name],
      imgAnchor: name,
    });
  };
  /** 選取的素材，依目前的顯示順序 */
  const selectedInOrder = () => list.filter((m) => selSet.has(m.name));

  return (
    <div className="flex min-w-0 flex-col gap-3 pb-2" data-testid="materials-page">
      <Card title={S.materialsTitle} sub={S.totals(totals.before, totals.after, totals.saved)}>
        <FileDrop
          multiple
          accept="image/*"
          filterByAccept={false}
          clickable
          label={S.materialsDrop}
          buttonLabel={S.materialsPick}
          onFiles={(files) => void doImport(files)}
        />
        <Row>
          <Labeled label={`${S.maxEdge}（px）`}>
            <NumberInput
              value={st.maxEdge}
              min={200}
              max={4000}
              step={100}
              onChange={(v) => useSettings.getState().patch({ maxEdge: v })}
              aria-label={S.maxEdge}
            />
          </Labeled>
          <Toggle
            checked={st.convert}
            onCheckedChange={(v) => useSettings.getState().patch({ convert: v })}
            aria-label={S.convert}
            label={S.convert}
          />
        </Row>
        <Hint>{S.convertHint}</Hint>
        <Row>
          <span className="text-xs text-muted">{S.makeTitle}</span>
          <Button
            size="sm"
            icon={<Palette />}
            onClick={() => setSession({ modal: { kind: 'solid' } })}
          >
            {S.makeSolid}
          </Button>
          <Button
            size="sm"
            icon={<Sparkles />}
            onClick={() => {
              const one =
                sess.imgSel.length === 1
                  ? materials.find((m) => m.name === sess.imgSel[0])
                  : undefined;
              openFade({ kind: 'material' }, one && !one.animated ? one.name : null);
            }}
          >
            {S.makeFade}
          </Button>
          <Button
            size="sm"
            icon={<Brush />}
            onClick={() => {
              const one =
                sess.imgSel.length === 1
                  ? materials.find((m) => m.name === sess.imgSel[0])
                  : undefined;
              openMaker({ kind: 'material' }, one && !one.animated ? one.name : '');
            }}
          >
            {S.makeMaker}
          </Button>
        </Row>
      </Card>

      {broken.length ? (
        <Card
          className="border-warning bg-warning-soft"
          title={S.brokenTitle}
          data-testid="broken-banner"
        >
          <ul className="m-0 pl-5 text-sm">
            {broken.map((b) => (
              <li key={b.name}>{b.uses.join('、')}</li>
            ))}
          </ul>
          <div>
            <Button
              size="sm"
              icon={<TriangleAlert />}
              onClick={() => setSession({ modal: { kind: 'broken' } })}
            >
              {S.brokenOpen}
            </Button>
          </div>
        </Card>
      ) : null}

      <Card>
        <Row>
          <TextInput
            aria-label={S.filterName}
            placeholder={S.filterName}
            value={sess.imgQuery}
            onChange={(e) => setSession({ imgQuery: e.target.value })}
            className="w-48"
          />
          {TAGS.map((t) => (
            <Button
              key={t}
              size="sm"
              variant={sess.imgTags.includes(t) ? 'primary' : 'ghost'}
              aria-pressed={sess.imgTags.includes(t)}
              onClick={() =>
                setSession({
                  imgTags: sess.imgTags.includes(t)
                    ? sess.imgTags.filter((x) => x !== t)
                    : [...sess.imgTags, t],
                })
              }
            >
              {TAG_LABELS[t]}
            </Button>
          ))}
          {sess.imgTags.length ? (
            <Button size="sm" variant="ghost" onClick={() => setSession({ imgTags: [] })}>
              {S.filterClear}
            </Button>
          ) : null}
        </Row>
        <Row>
          <Button
            size="sm"
            onClick={() =>
              setSession({ imgSel: [...new Set([...sess.imgSel, ...list.map((m) => m.name)])] })
            }
          >
            {S.selectAll}
          </Button>
          <Button size="sm" onClick={() => setSession({ imgSel: [], imgAnchor: null })}>
            {S.selectNone}
          </Button>
          <span className="text-xs text-muted" data-testid="material-sel-count">
            {S.selected(sess.imgSel.length)}・{sess.imgSel.length ? S.selectedHelp : S.selectHelp}
          </span>
          <Button
            size="sm"
            className="ml-auto"
            onClick={() => setSession({ modal: { kind: 'rename' } })}
            disabled={!list.length}
          >
            {S.batchRename}
          </Button>
        </Row>
        {!materials.length ? (
          <Hint>{S.noMaterials}</Hint>
        ) : !list.length ? (
          <Hint>{S.noMatch}</Hint>
        ) : null}
        <ul
          className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-2 p-0"
          aria-label={S.materialsTitle}
        >
          {list.map((m) => {
            const on = selSet.has(m.name);
            return (
              <li
                key={m.name}
                data-material={m.name}
                data-selected={on || undefined}
                draggable
                onDragStart={(e) => startMaterialDrag(e, m.name)}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('button,input,label,[role="checkbox"]'))
                    return;
                  click(m.name, e.shiftKey);
                }}
                onKeyDown={() => undefined}
                className={cn(
                  'relative flex min-w-0 cursor-pointer flex-col gap-1.5 rounded-md border border-border bg-surface-2 p-2',
                  on && 'border-accent ring-2 ring-accent',
                )}
              >
                {on ? (
                  <span className="absolute top-1 left-1 z-10 rounded-full bg-accent px-1.5 text-xs text-accent-contrast">
                    ✓
                  </span>
                ) : null}
                <Thumb name={m.name} className="aspect-[4/3] w-full" />
                <TextInput
                  aria-label={`${m.label} 的名稱`}
                  value={m.label}
                  onChange={(e) =>
                    commit((d) => {
                      const x = d.materials.find((y) => y.name === m.name);
                      if (x) x.label = e.target.value;
                    })
                  }
                />
                <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                  {TAGS.map((t) => (
                    <Checkbox
                      checked={m.tags.includes(t)}
                      aria-label={`${m.label}：${TAG_LABELS[t]}`}
                      onCheckedChange={(v) =>
                        commit((d) => setMaterialTags(d, m.name, toggleTag(m.tags, t, !!v)))
                      }
                      key={t}
                      label={TAG_LABELS[t]}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted">
                  {m.width ? `${m.width}×${m.height}` : null}
                  {m.animated ? (
                    <span className="rounded-sm bg-accent-soft px-1 text-accent">{S.animated}</span>
                  ) : null}
                  {tplUse[m.name] ? (
                    <span className="rounded-sm bg-surface-3 px-1">
                      {S.templateUsed(tplUse[m.name])}
                    </span>
                  ) : null}
                </div>
                <div className="flex gap-0.5">
                  <IconButton
                    size="sm"
                    variant="ghost"
                    label={S.favorite}
                    icon={<Star />}
                    pressed={lib.favorites.some((f) => f.name === m.name)}
                    onClick={async () => {
                      await addFavorite(m);
                      n(S.favorited, 'success');
                    }}
                  />
                  <IconButton
                    size="sm"
                    variant="ghost"
                    label={S.detail}
                    icon={<Info />}
                    onClick={() => setSession({ modal: { kind: 'info', name: m.name } })}
                  />
                  <IconButton
                    size="sm"
                    variant="ghost"
                    label={S.edit}
                    icon={<Scissors />}
                    onClick={() =>
                      setSession({
                        modal: { kind: 'edit', name: m.name, context: { kind: 'material' } },
                      })
                    }
                  />
                  <IconButton
                    size="sm"
                    variant="ghost"
                    label={S.remove}
                    icon={<Trash2 />}
                    onClick={() => {
                      commit((d) => deleteMaterials(d, [m.name]));
                      setSession({ imgSel: sess.imgSel.filter((x) => x !== m.name) });
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <SearchCard />
      <FavoritesCard />
      <TemplateMediaCard />
      {sess.imgSel.length ? <BatchPanel selectedInOrder={selectedInOrder} /> : null}
    </div>
  );
}

/* ---------- 批次操作面板（F057～F062） ---------- */

function BatchPanel({
  selectedInOrder,
}: {
  selectedInOrder: () => { name: string; label: string; tags: Tag[] }[];
}) {
  const n = useNotify();
  const confirm = useConfirm();
  const sess = useSession();
  const p = useProject((s) => s.data);
  const [seq, setSeq] = useState({ prefix: '', start: 1, digits: 2 });
  const [rep, setRep] = useState({ from: '', to: '' });
  const sel = selectedInOrder();
  const tag = (t: Tag, on: boolean) => {
    commit((d) => {
      for (const m of sel) {
        const x = d.materials.find((y) => y.name === m.name);
        if (x) x.tags = toggleTag(x.tags, t, on);
      }
    });
    n(S.tagChanged(sel.length), 'success');
  };
  return (
    <section
      aria-label={S.batchTitle(sel.length)}
      data-testid="batch-panel"
      className="sticky bottom-10 z-10 flex flex-col gap-2 rounded-lg border border-accent bg-surface p-3 shadow-2"
    >
      <Row>
        <b>{S.batchTitle(sel.length)}</b>
        <span className="flex-1" />
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setSession({ batchCollapsed: !sess.batchCollapsed })}
        >
          {sess.batchCollapsed ? S.batchShow : S.batchHide}
        </Button>
        <IconButton
          size="sm"
          label={S.batchEnd}
          icon={<X />}
          onClick={() => setSession({ imgSel: [], imgAnchor: null })}
        />
      </Row>
      {sess.batchCollapsed ? null : (
        <div className="flex max-h-[45dvh] flex-col gap-2 overflow-y-auto">
          <Row>
            {TAGS.map((t) => (
              <Button key={t} size="sm" variant="ghost" onClick={() => tag(t, true)}>
                {S.addTag(TAG_LABELS[t])}
              </Button>
            ))}
          </Row>
          <Row>
            {TAGS.map((t) => (
              <Button key={t} size="sm" variant="ghost" onClick={() => tag(t, false)}>
                {S.removeTag(TAG_LABELS[t])}
              </Button>
            ))}
          </Row>
          <Row>
            <b className="text-xs">{S.seqTitle}</b>
            <Labeled label={S.seqPrefix}>
              <TextInput
                value={seq.prefix}
                onChange={(e) => setSeq({ ...seq, prefix: e.target.value })}
                className="w-28"
              />
            </Labeled>
            <Labeled label={S.seqStart}>
              <NumberInput
                value={seq.start}
                min={0}
                max={99999}
                onChange={(v) => setSeq({ ...seq, start: v })}
              />
            </Labeled>
            <Labeled label={S.seqDigits}>
              <NumberInput
                value={seq.digits}
                min={1}
                max={4}
                onChange={(v) => setSeq({ ...seq, digits: v })}
              />
            </Labeled>
            <Button
              size="sm"
              onClick={() => {
                commit((d) => {
                  sel.forEach((m, i) => {
                    const x = d.materials.find((y) => y.name === m.name);
                    if (x) x.label = sequenceLabel(seq.prefix, seq.start, seq.digits, i);
                  });
                });
                n(S.seqDone(sel.length), 'success');
              }}
            >
              {S.seqGo}
            </Button>
          </Row>
          <Row>
            <b className="text-xs">{S.replaceTitle}</b>
            <Labeled label={S.replaceFind}>
              <TextInput
                value={rep.from}
                onChange={(e) => setRep({ ...rep, from: e.target.value })}
                className="w-28"
              />
            </Labeled>
            <Labeled label={S.replaceWith}>
              <TextInput
                value={rep.to}
                onChange={(e) => setRep({ ...rep, to: e.target.value })}
                className="w-28"
              />
            </Labeled>
            <Button
              size="sm"
              onClick={() => {
                if (!rep.from) return n(S.replaceEmpty, 'warning');
                const hit = sel.filter((m) => m.label.includes(rep.from));
                if (!hit.length) return n(S.replaceNone, 'warning');
                commit((d) => {
                  for (const m of hit) {
                    const x = d.materials.find((y) => y.name === m.name);
                    if (x) x.label = x.label.split(rep.from).join(rep.to);
                  }
                });
                n(S.replaceDone(hit.length), 'success');
              }}
            >
              {S.replaceGo}
            </Button>
          </Row>
          <Row>
            <b className="text-xs">{S.createTitle}</b>
            {(['tachie', 'marker', 'panel', 'scene', 'cutin'] as const).map((k) => (
              <Button
                key={k}
                size="sm"
                variant="primary"
                onClick={() => {
                  createFrom(
                    k,
                    sel.map((m) => m.name),
                    n,
                  );
                  setSession({ imgSel: [] });
                }}
              >
                {S.createAs[k]}
              </Button>
            ))}
          </Row>
          <Row>
            <Button
              size="sm"
              variant="danger"
              icon={<Trash2 />}
              onClick={async () => {
                const used = sel.filter((m) => isMaterialUsed(p, m.name)).length;
                if (
                  !(await confirm({
                    title: S.deleteSelected,
                    description: S.deleteConfirm(sel.length, used),
                    danger: true,
                  }))
                )
                  return;
                commit((d) =>
                  deleteMaterials(
                    d,
                    sel.map((m) => m.name),
                  ),
                );
                setSession({ imgSel: [], imgAnchor: null });
                n(S.deleted(sel.length), 'success');
              }}
            >
              {S.deleteSelected}
            </Button>
          </Row>
        </div>
      )}
    </section>
  );
}

/* ---------- 找圖（F065） ---------- */

export function searchUrl(url: string, q: string): string {
  const e = encodeURIComponent(q);
  return url.includes(SEARCH_PLACEHOLDER) ? url.split(SEARCH_PLACEHOLDER).join(e) : url + e;
}

function SearchCard() {
  const sites = useSettings((s) => s.data.sites);
  const [q, setQ] = useState('');
  return (
    <Card title={S.searchTitle}>
      <TextInput
        aria-label={S.searchPlaceholder}
        placeholder={S.searchPlaceholder}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <Row>
        {sites.map((s) => (
          <Button
            key={s.id}
            size="sm"
            onClick={() => window.open(searchUrl(s.url, q), '_blank', 'noopener')}
          >
            {s.name}
          </Button>
        ))}
      </Row>
      <Hint>{S.searchNote}</Hint>
    </Card>
  );
}

/* ---------- 最愛（F070、F071） ---------- */

function FavoritesCard() {
  const favs = useLibrary((s) => s.data.favorites);
  const n = useNotify();
  return (
    <Card title={S.favoritesTitle} data-testid="favorites">
      {!favs.length ? (
        <Hint>{S.favoritesEmpty}</Hint>
      ) : (
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2 p-0">
          {favs.map((f) => (
            <li
              key={f.name}
              className="flex min-w-0 flex-col gap-1 rounded-md border border-border bg-surface-2 p-1.5"
            >
              <Thumb name={f.name} className="aspect-square w-full" />
              <span className="truncate text-xs">{f.label}</span>
              <Button
                size="sm"
                onClick={async () => {
                  if (await takeFavorite(f)) n(S.favoriteAdded, 'success');
                }}
              >
                {S.favoriteUse}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => removeFavorite(f.name)}>
                {S.favoriteRemove}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ---------- 範本內含的圖（F072） ---------- */

function TemplateMediaCard() {
  const lib = useLibrary((s) => s.data);
  const [filter, setFilter] = useState<'all' | 'marker' | 'panel' | 'piece'>('all');
  const n = useNotify();
  const rows = useMemo(() => {
    const map = new Map<
      string,
      { name: string; label: string; count: number; kinds: Set<'marker' | 'panel' | 'piece'> }
    >();
    const add = (name: string | null, label: string, kind: 'marker' | 'panel' | 'piece') => {
      if (!name) return;
      const r = map.get(name) ?? { name, label, count: 0, kinds: new Set() };
      r.count++;
      r.kinds.add(kind);
      map.set(name, r);
    };
    for (const t of lib.partTemplates) add(t.imageUrl, t.imageLabel || t.name, t.kind);
    for (const t of lib.pieceTemplates)
      for (const x of new Set([t.iconUrl, ...t.faces.map((f) => f.iconUrl)]))
        add(x, t.name, 'piece');
    return [...map.values()];
  }, [lib]);
  if (!rows.length) return null;
  const kinds = (['marker', 'panel', 'piece'] as const).filter((k) =>
    rows.some((r) => r.kinds.has(k)),
  );
  const shown = rows.filter((r) => filter === 'all' || r.kinds.has(filter));
  return (
    <Card title={S.templateMediaTitle} data-testid="template-media">
      <Row>
        <Button
          size="sm"
          variant={filter === 'all' ? 'primary' : 'ghost'}
          onClick={() => setFilter('all')}
        >
          {S.templateMediaAll}
        </Button>
        {kinds.map((k) => (
          <Button
            key={k}
            size="sm"
            variant={filter === k ? 'primary' : 'ghost'}
            onClick={() => setFilter(k)}
          >
            {S.templateMediaKinds[k]}
          </Button>
        ))}
      </Row>
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2 p-0">
        {shown.map((r) => (
          <li
            key={r.name}
            className="flex min-w-0 flex-col gap-1 rounded-md border border-border bg-surface-2 p-1.5"
          >
            <Thumb name={r.name} className="aspect-square w-full" />
            <span className="truncate text-xs">{r.label}</span>
            <span className="text-[11px] text-muted">
              {S.templateMediaUsed(r.count)}・
              {[...r.kinds].map((k) => S.templateMediaKinds[k]).join('、')}
            </span>
            <Button
              size="sm"
              onClick={async () => {
                if (await ensureMaterial(r.name, { label: r.label })) n(S.favoriteAdded, 'success');
              }}
            >
              {S.favoriteUse}
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
