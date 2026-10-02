/**
 * 右側面板（F010～F013）：「素材」（F222～F224）與「預覽」（F211～F221、立繪頁的試排 F225）兩個分頁；
 * 釘選＝與主畫面並排，取消釘選＝疊在主畫面上（點面板以外就收起）；拖曳左緣調整寬度。
 */
import { Eye, EyeOff, Lock, Pin, PinOff, Unlock, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Checkbox, cn, IconButton, Segmented, Select, TextInput } from '@/ui';
import { addTachie, setOverride, updateEffect, updatePart, updateSceneTachie } from './actions';
import { Board, type BoardItem, type BoardMove, type BoardResize } from './Board';
import { Hint, startMaterialDrag, Thumb, useNotify, usePromptDialog } from './common';
import { sceneBackgroundUrl, sceneCutin } from './exportRoom';
import {
  effectivePart,
  effectRect,
  imageAspect,
  materialLookup,
  tachieFamily,
  tachieSize,
  tachieSource,
  tachieY,
} from './geometry';
import { filterMaterials, TAG_LABELS } from './materials';
import { type Project, type Scene, TAGS, type Tag } from './model';
import {
  commit,
  goPage,
  patchLayout,
  setSession,
  useLayout,
  useProject,
  useSession,
  useSettings,
} from './store';
import { S } from './strings';

/* ---------- 面板外框 ---------- */

export function RightOpener() {
  return (
    <Button
      size="sm"
      className="fixed top-1/2 right-0 z-20 hidden rounded-r-none lg:inline-flex"
      onClick={() => patchLayout({ rightOpen: true })}
    >
      {S.rightOpen}
    </Button>
  );
}

export function RightPanel() {
  const lay = useLayout((s) => s.data);
  const n = useNotify();
  const ref = useRef<HTMLElement>(null);
  /* 未釘選：點面板以外（對話框除外）就收起；Esc 也收起（F011、F285） */
  useEffect(() => {
    if (lay.rightPinned) return;
    const down = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (
        ref.current?.contains(t) ||
        t.closest('[role="dialog"],[role="alertdialog"],[data-radix-popper-content-wrapper]')
      )
        return;
      patchLayout({ rightOpen: false });
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"]'))
        patchLayout({ rightOpen: false });
    };
    const t = setTimeout(() => window.addEventListener('pointerdown', down), 0);
    window.addEventListener('keydown', key);
    return () => {
      clearTimeout(t);
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('keydown', key);
    };
  }, [lay.rightPinned]);

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const sx = e.clientX;
    const w0 = lay.rightWidth;
    const move = (ev: PointerEvent) => {
      const max = Math.min(1100, window.innerWidth - 300);
      patchLayout({ rightWidth: Math.round(Math.max(260, Math.min(max, w0 + sx - ev.clientX))) });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <aside
      ref={ref}
      aria-label={S.rightTabs[lay.rightTab]}
      data-testid="right-panel"
      data-pinned={lay.rightPinned || undefined}
      className={cn(
        'relative flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-surface p-2 lg:w-[var(--rz-right)] lg:shrink-0',
        lay.rightPinned
          ? 'lg:sticky lg:top-16 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto'
          : 'lg:fixed lg:top-20 lg:right-3 lg:bottom-16 lg:z-30 lg:overflow-y-auto lg:shadow-2',
      )}
      style={{ ['--rz-right' as string]: `${lay.rightWidth}px` }}
    >
      {/* biome-ignore lint/a11y/useSemanticElements: 可拖曳調整寬度的分隔線（hr 不能互動） */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={S.rightResize}
        title={S.rightResize}
        onPointerDown={startResize}
        className="absolute top-0 bottom-0 -left-1 hidden w-2 cursor-col-resize lg:block"
      />
      <div className="flex items-center gap-1">
        <Segmented
          size="sm"
          value={lay.rightTab}
          onValueChange={(v) => patchLayout({ rightTab: v as 'media' | 'preview' })}
          options={[
            { value: 'media', label: S.rightTabs.media },
            { value: 'preview', label: S.rightTabs.preview },
          ]}
        />
        <span className="flex-1" />
        <IconButton
          size="sm"
          label={lay.rightPinned ? S.rightUnpin : S.rightPin}
          icon={lay.rightPinned ? <PinOff /> : <Pin />}
          pressed={lay.rightPinned}
          onClick={() => {
            patchLayout({ rightPinned: !lay.rightPinned });
            n(lay.rightPinned ? S.rightFloating : S.rightPinned);
          }}
        />
        <IconButton
          size="sm"
          label={S.rightClose}
          icon={<X />}
          onClick={() => patchLayout({ rightOpen: false })}
        />
      </div>
      {lay.rightTab === 'media' ? <MediaTab /> : <PreviewTab />}
    </aside>
  );
}

/* ---------- 素材分頁（F222～F224） ---------- */

function MediaTab() {
  const materials = useProject((s) => s.data.materials);
  const sceneId = useSession((s) => s.sceneId);
  const scene = useProject((s) => s.data.scenes.find((x) => x.id === sceneId));
  const [q, setQ] = useState('');
  const [tags, setTags] = useState<Tag[]>([]);
  const n = useNotify();
  const list = filterMaterials(materials, q, tags);
  return (
    <div className="flex min-w-0 flex-col gap-2" data-testid="media-tab">
      <TextInput
        aria-label={S.filterName}
        placeholder={S.filterName}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="flex flex-wrap gap-1">
        <Button size="sm" variant={tags.length ? 'ghost' : 'primary'} onClick={() => setTags([])}>
          {S.pickerAll}
        </Button>
        {TAGS.map((t) => (
          <Button
            key={t}
            size="sm"
            variant={tags.includes(t) ? 'primary' : 'ghost'}
            aria-pressed={tags.includes(t)}
            onClick={() => setTags(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t])}
          >
            {TAG_LABELS[t]}
          </Button>
        ))}
      </div>
      <Hint>{scene ? S.mediaTarget(scene.name) : S.mediaNoTarget}</Hint>
      {!materials.length ? <Hint>{S.mediaEmpty}</Hint> : <Hint>{S.mediaDragHint}</Hint>}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
        {list.map((m) => (
          // biome-ignore lint/a11y/noStaticElementInteractions: 拖到右側欄位的素材卡（點選另有按鈕）
          <div
            key={m.name}
            draggable
            onDragStart={(e) => startMaterialDrag(e, m.name)}
            data-media-card={m.name}
            className="flex min-w-0 flex-col gap-1 rounded-md border border-border bg-surface-2 p-1.5"
          >
            <Thumb name={m.name} className="aspect-square w-full" />
            <span className="truncate text-xs" title={m.label}>
              {m.label}
            </span>
            <span className="truncate text-[11px] text-muted">
              {m.tags.map((t) => TAG_LABELS[t]).join('・')}
            </span>
            <div className="flex flex-wrap gap-1">
              {scene ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    commit((d) => {
                      const s = d.scenes.find((x) => x.id === scene.id);
                      if (s) s.foregroundUrl = m.name;
                    });
                    n(S.mediaFgDone, 'success');
                  }}
                >
                  {S.mediaAsFg}
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  commit((d, c) => {
                    addTachie(d, { character: m.label, expression: m.label, imageUrl: m.name }, c);
                  });
                  n(S.mediaTachieDone, 'success');
                }}
              >
                {S.mediaAsTachie}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- 預覽分頁 ---------- */

const PREVIEW_HEIGHTS = { small: 170, normal: 220, large: 360 } as const;

function PreviewTab() {
  const page = useSession((s) => s.page);
  return page === 'tachie' ? <TachiePreview /> : <ScenePreview />;
}

/** 拖曳中的暫時位移（放開才寫進資料） */
interface Drag {
  move?: BoardMove;
  resize?: BoardResize;
}

/** 場景的預覽物件 */
export function sceneItems(
  p: Project,
  scene: Scene | null,
  hidden: Record<string, true>,
): BoardItem[] {
  const find = materialLookup(p.materials);
  const out: BoardItem[] = [];
  for (const part of p.parts) {
    if (!part.visible || hidden[part.id]) continue;
    const e = effectivePart(part, scene);
    if (e.hidden) continue;
    out.push({
      id: part.id,
      label: part.name,
      imageUrl: e.imageUrl,
      text: part.text,
      x: e.x,
      y: e.y,
      width: e.width,
      height: e.height,
      z: e.z,
      kind: part.kind,
      locked: part.kind === 'marker' && scene ? !!e.override?.locked || part.locked : part.locked,
      resizable: true,
    });
  }
  if (scene) {
    for (const m of scene.markers) {
      if (hidden[m.id]) continue;
      const r = m.kind === 'tachie' ? m : effectRect(m, scene, find);
      out.push({
        id: m.id,
        label: m.name,
        imageUrl: m.imageUrl,
        text: m.text,
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        z: m.z,
        kind: m.kind === 'tachie' ? 'tachie' : 'effect',
        locked: !!m.locked || m.kind === 'full',
        resizable: m.kind !== 'full',
        frameless: m.kind === 'full',
      });
    }
    const c = sceneCutin(scene, p.cutins);
    if (c?.imageUrl) {
      const a = imageAspect(c.imageUrl, find) ?? 1;
      const w = Math.max(1, Math.round(scene.fieldWidth * 0.4));
      out.push({
        id: `cutin:${c.id}`,
        label: c.name,
        imageUrl: c.imageUrl,
        x: 0,
        y: 0,
        width: w,
        height: Math.max(1, Math.round(w / a)),
        z: 100000,
        kind: 'cutin',
        locked: true,
      });
    }
  }
  return out;
}

/** 拖曳中的位移套到物件上（畫面用） */
export function applyDrag(items: BoardItem[], d: Drag): BoardItem[] {
  if (!d.move && !d.resize) return items;
  return items.map((i) => {
    if (d.move?.ids.includes(i.id)) return { ...i, x: i.x + d.move.dx, y: i.y + d.move.dy };
    if (d.resize?.id === i.id) return { ...i, width: d.resize.width, height: d.resize.height };
    return i;
  });
}

function ScenePreview() {
  const p = useProject((s) => s.data);
  const sceneId = useSession((s) => s.sceneId);
  const sel = useSession((s) => s.previewSel);
  const lay = useLayout((s) => s.data);
  const st = useSettings((s) => s.data);
  const scene = p.scenes.find((s) => s.id === sceneId) ?? null;
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [scope, setScope] = useState(true);
  const [drag, setDrag] = useState<Drag>({});
  const W = scene ? scene.fieldWidth : p.room.fieldWidth;
  const H = scene ? scene.fieldHeight : p.room.fieldHeight;
  const items = useMemo(
    () => applyDrag(sceneItems(p, scene, lay.previewHidden), drag),
    [p, scene, lay.previewHidden, drag],
  );
  const zoom = lay.sceneZoom;
  const setZoom = (z: number) =>
    patchLayout({ sceneZoom: Math.max(0.35, Math.min(3, Math.round(z * 100) / 100)) });
  const info = (() => {
    const scopeText = (id: string) => {
      const part = p.parts.find((x) => x.id === id);
      if (part)
        return part.kind === 'marker' && scope && scene ? S.previewScopeScene : S.previewScopeAll;
      return S.previewScopeScene;
    };
    if (drag.move) {
      const i = items.find((x) => x.id === drag.move?.ids[0]);
      return i ? S.previewDragInfo(i.x, i.y, scopeText(i.id)) : '';
    }
    if (drag.resize)
      return S.previewSizeInfo(drag.resize.width, drag.resize.height, scopeText(drag.resize.id));
    return '';
  })();

  const onMove = (m: BoardMove) => {
    if (m.phase === 'move') return setDrag({ move: m });
    setDrag({});
    commit((d, c) => {
      const s = scene ? d.scenes.find((x) => x.id === scene.id) : undefined;
      for (const id of m.ids) {
        const part = d.parts.find((x) => x.id === id);
        if (part) {
          const e = effectivePart(part, s);
          if (part.kind === 'marker' && s && scope)
            setOverride(d, s.id, id, { x: e.x + m.dx, y: e.y + m.dy });
          else updatePart(d, id, { x: part.x + m.dx, y: part.y + m.dy }, c);
          continue;
        }
        const mk = s?.markers.find((x) => x.id === id);
        if (!s || !mk) continue;
        if (mk.kind === 'tachie')
          updateSceneTachie(d, s.id, id, { x: mk.x + m.dx, y: mk.y + m.dy }, c);
        else updateEffect(d, s.id, id, { x: mk.x + m.dx, y: mk.y + m.dy }, c);
      }
    });
  };
  const onResize = (r: BoardResize) => {
    if (r.phase === 'move') return setDrag({ resize: r });
    setDrag({});
    commit((d, c) => {
      const s = scene ? d.scenes.find((x) => x.id === scene.id) : undefined;
      const part = d.parts.find((x) => x.id === r.id);
      if (part) {
        if (part.kind === 'marker' && s && scope) {
          const a = part.lockAspect ? imageAspect(effectivePart(part, s).imageUrl, c.find) : null;
          setOverride(d, s.id, r.id, {
            width: r.width,
            height: a ? Math.max(1, Math.round(r.width / a)) : r.height,
          });
        } else
          updatePart(
            d,
            r.id,
            { width: r.width, ...(part.lockAspect ? {} : { height: r.height }) },
            c,
          );
        return;
      }
      const mk = s?.markers.find((x) => x.id === r.id);
      if (!s || !mk) return;
      if (mk.kind === 'tachie') updateSceneTachie(d, s.id, r.id, { height: r.height }, c);
      else
        updateEffect(
          d,
          s.id,
          r.id,
          mk.lockAspect ? { width: r.width } : { width: r.width, height: r.height },
          c,
        );
    });
  };

  return (
    <div className="flex min-w-0 flex-col gap-2" data-testid="preview-tab">
      <Select
        aria-label={S.previewScene}
        value={scene?.id ?? '__room__'}
        onValueChange={(v) =>
          setSession({ sceneId: v === '__room__' ? null : v, previewSel: null })
        }
        options={[
          { value: '__room__', label: S.previewRoom },
          ...p.scenes.map((s, i) => ({ value: s.id, label: `${i + 1}. ${s.name}` })),
        ]}
      />
      <div className="flex flex-wrap items-center gap-1">
        {(
          [
            ['fit', 1],
            ['far', 0.82],
            ['farther', 0.64],
          ] as const
        ).map(([k, z]) => (
          <Button
            key={k}
            size="sm"
            variant={Math.abs(zoom - z) < 0.001 ? 'primary' : 'ghost'}
            onClick={() => {
              setZoom(z);
              setPan({ x: 0, y: 0 });
            }}
          >
            {S.previewModes[k]}
          </Button>
        ))}
        <Button
          size="sm"
          variant="ghost"
          aria-label={S.zoomOut}
          onClick={() => setZoom(zoom - 0.1)}
        >
          −
        </Button>
        <span className="text-xs tabular-nums" data-testid="preview-zoom">
          {Math.round(zoom * 100)}%
        </span>
        <Button size="sm" variant="ghost" aria-label={S.zoomIn} onClick={() => setZoom(zoom + 0.1)}>
          ＋
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-1 text-xs">
        <span className="text-muted">{S.previewHeight}</span>
        {(Object.keys(PREVIEW_HEIGHTS) as (keyof typeof PREVIEW_HEIGHTS)[]).map((k) => (
          <Button
            key={k}
            size="sm"
            variant={lay.scenePvHeight === PREVIEW_HEIGHTS[k] ? 'primary' : 'ghost'}
            onClick={() => patchLayout({ scenePvHeight: PREVIEW_HEIGHTS[k] })}
          >
            {S.previewHeights[k]}
          </Button>
        ))}
        <Button
          size="sm"
          variant={st.guides ? 'primary' : 'ghost'}
          onClick={() => useSettings.getState().patch({ guides: !st.guides })}
        >
          {S.previewGuides(st.guides)}
        </Button>
        <input
          type="color"
          aria-label={S.guideColor}
          value={st.guideColor}
          onChange={(e) => useSettings.getState().patch({ guideColor: e.target.value })}
          className="h-7 w-8 rounded-sm border border-border bg-transparent"
        />
      </div>
      <Hint>{S.previewPanHint}</Hint>
      <Board
        aria-label={S.rightTabs.preview}
        testId="scene-preview"
        fieldWidth={W}
        fieldHeight={H}
        background={scene ? sceneBackgroundUrl(scene, p.room) : p.room.backgroundUrl}
        foreground={scene ? scene.foregroundUrl : p.room.foregroundUrl}
        autoCrop={scene ? scene.autoCrop : true}
        items={items}
        selected={sel ? [sel] : []}
        zoom={zoom}
        onZoomChange={setZoom}
        zoomRange={[0.35, 3]}
        wheelStep={0.1}
        base="fit"
        pan={pan}
        onPanChange={setPan}
        height={lay.scenePvHeight}
        guides={{ on: st.guides, color: st.guideColor }}
        decorations
        step={0.5}
        axisRatio={2.414}
        diagonal="mean"
        threshold={2}
        onSelect={(id) => setSession({ previewSel: id })}
        onBlankClick={() => setSession({ previewSel: null })}
        onMove={onMove}
        onResize={onResize}
        footer={
          <div className="flex flex-col gap-1">
            {/* biome-ignore lint/a11y/useSemanticElements: 可拖曳調整高度的分隔線（hr 不能互動） */}
            <div
              role="separator"
              aria-label={S.previewHeight}
              className="h-2 cursor-row-resize rounded-sm bg-surface-3"
              onPointerDown={(e) => {
                const sy = e.clientY;
                const h0 = lay.scenePvHeight;
                const move = (ev: PointerEvent) =>
                  patchLayout({
                    scenePvHeight: Math.max(170, Math.min(520, Math.round(h0 + ev.clientY - sy))),
                  });
                const up = () => {
                  window.removeEventListener('pointermove', move);
                  window.removeEventListener('pointerup', up);
                };
                window.addEventListener('pointermove', move);
                window.addEventListener('pointerup', up);
              }}
            />
            {info ? <Hint className="tabular-nums">{info}</Hint> : null}
          </div>
        }
      />
      {scene ? (
        <Checkbox
          checked={scope}
          onCheckedChange={(v) => setScope(!!v)}
          aria-label={S.previewScope}
          label={
            <>
              <span>{S.previewScope}</span>
              <span className="ml-1 text-muted">{S.previewScopeHint}</span>
            </>
          }
        />
      ) : null}
      {zoom < 1 ? <Hint>{S.previewFar}</Hint> : null}
      {!p.parts.length ? <Hint>{S.previewNoParts}</Hint> : null}
      {scene ? <LayerList scene={scene} /> : null}
    </div>
  );
}

/* ---------- 圖層清單（F220） ---------- */

function LayerList({ scene }: { scene: Scene }) {
  const p = useProject((s) => s.data);
  const hidden = useLayout((s) => s.data.previewHidden);
  const sel = useSession((s) => s.previewSel);
  const [ask, node] = usePromptDialog();
  const rows: {
    id: string;
    name: string;
    z: number;
    kind: 'marker' | 'panel' | 'tachie' | 'effect';
    locked: boolean;
    trueHidden?: boolean;
  }[] = [];
  for (const part of p.parts) {
    if (!part.visible) continue;
    const e = effectivePart(part, scene);
    const o = scene.overrides[part.id];
    rows.push({
      id: part.id,
      name: part.name,
      z: e.z,
      kind: part.kind,
      locked: part.kind === 'marker' ? !!o?.locked : part.locked,
      trueHidden: !!o?.hidden,
    });
  }
  for (const m of scene.markers)
    rows.push({
      id: m.id,
      name: m.name,
      z: m.z,
      kind: m.kind === 'tachie' ? 'tachie' : 'effect',
      locked: !!m.locked,
    });
  rows.sort((a, b) => b.z - a.z);
  const toggleHide = (id: string) => {
    const next = { ...hidden };
    if (next[id]) delete next[id];
    else next[id] = true;
    patchLayout({ previewHidden: next });
  };
  const open = (r: (typeof rows)[number]) => {
    const ref =
      r.kind === 'marker' || r.kind === 'panel'
        ? { kind: 'part' as const, id: r.id }
        : r.kind === 'tachie'
          ? { kind: 'tachie' as const, id: scene.markers.find((m) => m.id === r.id)?.refId ?? '' }
          : { kind: 'effect' as const, id: r.id, sceneId: scene.id };
    setSession({ modal: { kind: 'source', ref } });
  };
  const jump = (r: (typeof rows)[number]) => {
    const sec = r.kind === 'tachie' ? 'tachie' : r.kind === 'effect' ? 'effect' : 'parts';
    setSession({
      previewSel: r.id,
      flash: `${sec}:${r.id}`,
      overridesAll: sec === 'parts' ? true : useSession.getState().overridesAll,
    });
    patchLayout({ sceneFolds: { ...useLayout.getState().data.sceneFolds, [sec]: true } });
    if (useSession.getState().page !== 'scenes') goPage('scenes');
  };
  const setZ = async (r: (typeof rows)[number]) => {
    const v = await ask(S.layerZ, S.layerZPrompt, String(r.z));
    if (v == null || !Number.isFinite(Number(v))) return;
    const z = Number(v);
    commit((d, c) => {
      const part = d.parts.find((x) => x.id === r.id);
      if (part) return updatePart(d, r.id, { z }, c);
      const mk = d.scenes.find((x) => x.id === scene.id)?.markers.find((x) => x.id === r.id);
      if (!mk) return;
      if (mk.kind === 'tachie' && mk.refId) {
        const tc = d.tachie.find((x) => x.id === mk.refId);
        if (tc) tachieSource(d, tc).z = z;
      } else mk.z = z;
    });
  };
  return (
    <div className="flex flex-col gap-1" data-testid="layer-list">
      <b className="text-sm">{S.layersTitle}</b>
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
        {rows.map((r) => (
          <li
            key={r.id}
            data-layer={r.id}
            className={cn(
              'flex items-center gap-1 rounded-sm px-1 text-xs',
              sel === r.id && 'bg-accent-soft',
            )}
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('button')) return;
              jump(r);
            }}
            onKeyDown={() => undefined}
          >
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left text-accent hover:underline"
              onClick={() => open(r)}
            >
              {r.name}
            </button>
            <IconButton
              size="sm"
              variant="ghost"
              label={S.layerHide}
              icon={hidden[r.id] ? <EyeOff /> : <Eye />}
              pressed={!!hidden[r.id]}
              onClick={() => toggleHide(r.id)}
            />
            <IconButton
              size="sm"
              variant="ghost"
              label={S.layerLock}
              icon={r.locked ? <Lock /> : <Unlock />}
              pressed={r.locked}
              onClick={() =>
                commit((d) => {
                  const part = d.parts.find((x) => x.id === r.id);
                  if (part?.kind === 'marker')
                    setOverride(d, scene.id, r.id, { locked: r.locked ? undefined : true });
                  else if (part) part.locked = !part.locked;
                  else {
                    const mk = d.scenes
                      .find((x) => x.id === scene.id)
                      ?.markers.find((x) => x.id === r.id);
                    if (mk) mk.locked = !mk.locked;
                  }
                })
              }
            />
            {r.kind === 'marker' || r.kind === 'panel' ? (
              <Button
                size="sm"
                variant={r.trueHidden ? 'primary' : 'ghost'}
                title={r.kind === 'panel' ? S.layerPanelNote : undefined}
                onClick={() =>
                  commit((d) =>
                    setOverride(d, scene.id, r.id, { hidden: r.trueHidden ? undefined : true }),
                  )
                }
              >
                {S.layerTrueHide}
                {r.kind === 'panel' ? '＊' : ''}
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              aria-label={`${S.layerZ}：${r.name}`}
              onClick={() => void setZ(r)}
            >
              {r.z}
            </Button>
          </li>
        ))}
        <li className="px-1 text-xs text-muted">{S.layerFg}</li>
        {scene.cutinId ? <li className="px-1 text-xs text-muted">{S.layerCutin}</li> : null}
      </ul>
      {rows.some((r) => r.kind === 'panel') ? <Hint>＊{S.layerPanelNote}</Hint> : null}
      {node}
    </div>
  );
}

/* ---------- 立繪頁的試排（F225） ---------- */

function TachiePreview() {
  const p = useProject((s) => s.data);
  const lay = useLayout((s) => s.data);
  const group = useSession((s) => s.tachieGroup);
  const st = useSettings((s) => s.data);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<Drag>({});
  const find = materialLookup(p.materials);
  const list = p.tachie.filter(
    (t) => (!group || t.character === group) && !lay.tachiePreviewHidden[t.id],
  );
  const W = p.room.fieldWidth;
  const H = p.room.fieldHeight;
  const base: BoardItem[] = list.map((t, i) => {
    const { width, height } = tachieSize(p, t, find);
    const src = tachieSource(p, t);
    return {
      id: t.id,
      label: t.expression || t.character,
      imageUrl: t.imageUrl,
      x: Math.round(-W / 2 + (W * (i + 1)) / (list.length + 1)),
      y: tachieY(p.room, height, Number(src.dy) || 0),
      width,
      height,
      z: 1,
      kind: 'tachie',
      resizable: true,
      axis: 'y',
    };
  });
  const items = applyDrag(base, drag);
  const all = p.tachie.filter((t) => !group || t.character === group);
  const toggle = (id: string) => {
    const next = { ...lay.tachiePreviewHidden };
    if (next[id]) delete next[id];
    else next[id] = true;
    patchLayout({ tachiePreviewHidden: next });
  };
  const sign = p.room.tachieAlign === 'top' || p.room.tachieAlign === 'center' ? 1 : -1;
  return (
    <div className="flex min-w-0 flex-col gap-2" data-testid="tachie-preview">
      <Hint>{S.tachiePreviewNote}</Hint>
      <Board
        aria-label={S.rightTabs.preview}
        fieldWidth={W}
        fieldHeight={H}
        background={p.room.backgroundUrl}
        foreground={p.room.foregroundUrl}
        autoCrop
        items={items}
        selected={[]}
        zoom={lay.sceneZoom}
        onZoomChange={(z) => patchLayout({ sceneZoom: Math.max(0.35, Math.min(3, z)) })}
        zoomRange={[0.35, 3]}
        wheelStep={0.1}
        base="fit"
        pan={pan}
        onPanChange={setPan}
        height={lay.scenePvHeight}
        guides={{ on: false, color: st.guideColor }}
        decorations
        step={0.5}
        axisRatio={2.414}
        diagonal="mean"
        threshold={2}
        onSelect={() => undefined}
        onMove={(m) => {
          if (m.phase === 'move') return setDrag({ move: m });
          setDrag({});
          commit((d) => {
            for (const id of m.ids) {
              const tc = d.tachie.find((x) => x.id === id);
              if (!tc) continue;
              const src = tachieSource(d, tc);
              src.dy = Math.round((Number(src.dy) || 0) + sign * m.dy);
            }
          });
        }}
        onResize={(r) => {
          if (r.phase === 'move') return setDrag({ resize: r });
          setDrag({});
          commit((d) => {
            const tc = d.tachie.find((x) => x.id === r.id);
            if (tc) tachieSource(d, tc).height = Math.max(1, Math.round(r.height));
          });
        }}
        footer={
          drag.move || drag.resize ? (
            <Hint className="tabular-nums">
              {drag.move
                ? `${S.tachieDy}：${(() => {
                    const tc = p.tachie.find((x) => x.id === drag.move?.ids[0]);
                    return tc
                      ? Math.round(
                          (Number(tachieSource(p, tc).dy) || 0) + sign * (drag.move?.dy ?? 0),
                        )
                      : '';
                  })()}`
                : `${S.tachieHeight}：${drag.resize?.height}`}
            </Hint>
          ) : null
        }
      />
      <div className="flex flex-wrap gap-1">
        {all.map((t) => (
          <Button
            key={t.id}
            size="sm"
            variant={lay.tachiePreviewHidden[t.id] ? 'ghost' : 'secondary'}
            aria-pressed={!lay.tachiePreviewHidden[t.id]}
            onClick={() => toggle(t.id)}
          >
            {t.expression || t.character}
          </Button>
        ))}
        <Button size="sm" variant="ghost" onClick={() => patchLayout({ tachiePreviewHidden: {} })}>
          {S.tachiePreviewShowAll}
        </Button>
      </div>
    </div>
  );
}

/** 換差分時選的立繪（給場景頁用） */
export function familyOptions(p: Project, refId: string | null) {
  const tc = refId ? p.tachie.find((x) => x.id === refId) : undefined;
  return tc ? tachieFamily(p, tc) : [];
}
