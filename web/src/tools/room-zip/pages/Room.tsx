/**
 * 房間設計頁（F135～F168）：基本（專案名稱、盤面大小、房間背景與前景）、立繪基準、本專案初始值；
 * 畫布（縮放、平移、參考線、圖層面板、實際顯示、選取、拖曳、改大小、方向鍵、選取工具列、快速加工、暫用立繪）；
 * 部件清單（共用標記與螢幕面板兩欄）。
 */
import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, Lock, Repeat, Trash2, Unlock } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Checkbox,
  cn,
  IconButton,
  Segmented,
  Slider,
  TextInput,
  Toggle,
  useChoice,
  useConfirm,
} from '@/ui';
import {
  addPart,
  addTachieSizedPart,
  deletePart,
  duplicatePart,
  movePart,
  setTachieDefaultHeight,
  switchPartKind,
  updatePart,
} from '../actions';
import { Board, type BoardItem, type BoardMove, type BoardResize } from '../Board';
import {
  Card,
  DropCreate,
  Hint,
  ImageField,
  Labeled,
  NumCell,
  Row,
  useNotify,
  usePromptDialog,
  useRenameProject,
} from '../common';
import { runEdit } from '../dialogs/Edit';
import { editDefaults, percentCrop } from '../edit';
import { imageAspect, partSceneUsage, tachieY } from '../geometry';
import { importFiles } from '../importer';
import { findPartTemplate, partTemplateFrom, savePartTemplate } from '../library';
import {
  fieldSizeInput,
  type Part,
  type PartKind,
  type ProjectDefaults,
  type TachieAlign,
} from '../model';
import { createFrom, type Notify } from '../ops';
import { applyDrag } from '../Right';
import {
  commit,
  patchLayout,
  session,
  setSession,
  useLayout,
  useProject,
  useSession,
  useSettings,
} from '../store';
import { S } from '../strings';

/* ---------- 部件快捷鍵（Mod＋1／2／3，只在房間設計頁） ---------- */

export function runPartShortcut(kind: 'open' | 'lock' | 'visible', notify: Notify): void {
  if (session().page !== 'room') return;
  const sel = session().roomSel;
  if (kind === 'open') {
    if (sel.length !== 1) {
      notify(S.partNeedOne, 'warning');
      return;
    }
    setSession({ modal: { kind: 'source', ref: { kind: 'part', id: sel[0] } } });
    return;
  }
  if (!sel.length) {
    notify(S.partNeedSel, 'warning');
    return;
  }
  const parts = useProject.getState().data.parts.filter((p) => sel.includes(p.id));
  if (kind === 'lock') {
    const on = !parts.every((p) => p.locked);
    commit((d) => {
      for (const p of d.parts) if (sel.includes(p.id)) p.locked = on;
    });
    notify(S.partsLocked(on), 'success');
  } else {
    const on = !parts.every((p) => p.visible);
    commit((d) => {
      for (const p of d.parts) if (sel.includes(p.id)) p.visible = on;
    });
    notify(S.partsShown(on), 'success');
  }
}

/* ---------- 暫用立繪的大小 ---------- */

const placeholderSize = (h: number) => ({ width: Math.max(5, Math.round(h * 0.42)), height: h });

/* ---------- 頁面 ---------- */

export function RoomPage() {
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="room-page">
      <div className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
        <RoomSettings />
        <RoomCanvas />
      </div>
      <PartsList />
    </div>
  );
}

function RoomSettings() {
  const room = useProject((s) => s.data.room);
  const name = useProject((s) => s.data.name);
  const tool = useSettings((s) => s.data);
  const [rename, node] = useRenameProject();
  const [open, setOpen] = useState(false);
  const set = (fn: (r: typeof room) => void) => commit((d) => fn(d.room));
  const d = room.defaults;
  const own = Object.values(d).some((v) => v != null);
  const field = (k: keyof ProjectDefaults, common: number) => (
    <Labeled label={S.defaultsFields[k]} key={k}>
      <NumCell
        aria-label={`${S.projectDefaults}：${S.defaultsFields[k]}`}
        value={d[k]}
        placeholder={String(common)}
        onCommit={(v) =>
          commit((p) => {
            p.room.defaults[k] = v;
          })
        }
      />
      {d[k] != null ? <span className="text-[11px] text-accent">{S.defaultsOwnNote}</span> : null}
    </Labeled>
  );
  return (
    <Card title={S.roomTitle}>
      <button
        type="button"
        onClick={() => void rename()}
        className="self-start rounded-sm text-left text-lg font-semibold hover:text-accent focus-visible:focus-ring"
      >
        {name}
      </button>
      {node}
      <div className="flex flex-col gap-2">
        <b className="text-sm">
          {S.boardSize}{' '}
          <span className="text-xs font-normal text-muted" data-testid="board-size">
            {room.fieldWidth} × {room.fieldHeight} 格
          </span>
        </b>
        <Row>
          {(
            [
              ['40x30', 40, 30],
              ['37x17', 37, 17],
              ['32x18', 32, 18],
            ] as const
          ).map(([k, w, h]) => (
            <Button
              key={k}
              size="sm"
              onClick={() =>
                set((r) => {
                  r.fieldWidth = w;
                  r.fieldHeight = h;
                })
              }
            >
              {S.boardPresets[k]}
            </Button>
          ))}
        </Row>
        <Row>
          <Labeled label={S.boardWidth}>
            <NumCell
              aria-label={S.boardWidth}
              value={room.fieldWidth}
              min={1}
              onCommit={(v) =>
                set((r) => {
                  r.fieldWidth = fieldSizeInput(String(v ?? ''), r.fieldWidth);
                })
              }
            />
          </Labeled>
          <Labeled label={S.boardHeight}>
            <NumCell
              aria-label={S.boardHeight}
              value={room.fieldHeight}
              min={1}
              onCommit={(v) =>
                set((r) => {
                  r.fieldHeight = fieldSizeInput(String(v ?? ''), r.fieldHeight);
                })
              }
            />
          </Labeled>
        </Row>
        <Hint>{S.boardNote}</Hint>
        <Row>
          <Labeled label={S.roomBackground}>
            <ImageField
              aria-label={S.roomBackground}
              value={room.backgroundUrl}
              onChange={(v) =>
                set((r) => {
                  r.backgroundUrl = v;
                })
              }
            />
          </Labeled>
          <Labeled label={S.roomForeground}>
            <ImageField
              aria-label={S.roomForeground}
              value={room.foregroundUrl}
              onChange={(v) =>
                set((r) => {
                  r.foregroundUrl = v;
                })
              }
            />
          </Labeled>
        </Row>
        <Hint>{S.roomBgHint}</Hint>
      </div>
      <div className="flex flex-col gap-2 border-t border-border pt-2">
        <b className="text-sm">{S.tachieBase}</b>
        <Segmented
          size="sm"
          aria-label={S.tachieAlign}
          value={room.tachieAlign}
          onValueChange={(v) =>
            set((r) => {
              r.tachieAlign = v as TachieAlign;
            })
          }
          options={(['bottom', 'top', 'center', 'position'] as const).map((v) => ({
            value: v,
            label: S.tachieAligns[v],
          }))}
        />
        <Row>
          <Labeled label={`${S.tachieLine[room.tachieAlign]}（格）`}>
            <NumCell
              aria-label={S.tachieLine[room.tachieAlign]}
              value={room.tachieBaseline}
              onCommit={(v) =>
                v != null &&
                set((r) => {
                  r.tachieBaseline = Math.round(v);
                })
              }
            />
          </Labeled>
          <Labeled label={S.tachieDefaultSize}>
            <NumCell
              aria-label={S.tachieDefaultSize}
              value={room.tachieHeight}
              min={1}
              onCommit={(v) => v != null && commit((p) => setTachieDefaultHeight(p, v))}
            />
          </Labeled>
          {room.tachieAlign === 'position' ? (
            <Labeled label={S.tachieX}>
              <NumCell
                aria-label={S.tachieX}
                value={room.tachieX}
                onCommit={(v) =>
                  set((r) => {
                    r.tachieX = Math.round(v ?? 0);
                  })
                }
              />
            </Labeled>
          ) : null}
          <Labeled label={S.tachieGap}>
            <NumCell
              aria-label={S.tachieGap}
              value={tool.tachieGap}
              onCommit={(v) => useSettings.getState().patch({ tachieGap: v ?? 0 })}
            />
          </Labeled>
        </Row>
        <Hint>{S.tachieDefaultSizeHint}</Hint>
      </div>
      <div
        className="flex flex-col gap-2 border-t border-border pt-2"
        data-testid="project-defaults"
      >
        <button
          type="button"
          className="flex items-center gap-2 text-left text-sm font-semibold"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? '▾' : '▸'} {S.projectDefaults}
          <span className="text-xs font-normal text-muted">
            {own ? S.projectDefaultsOwn : S.projectDefaultsCommon}
          </span>
        </button>
        {open ? (
          <>
            <Row>
              <span className="w-full text-xs text-muted">{S.projectDefaultsRows.size}</span>
              {field('part', tool.defaults.part)}
              {field('panelW', tool.defaults.panelW)}
              {field('tachieH', tool.defaults.tachieH)}
            </Row>
            <Row>
              <span className="w-full text-xs text-muted">{S.projectDefaultsRows.z}</span>
              {field('zPart', tool.defaults.zPart)}
              {field('zPanel', tool.defaults.zPanel)}
              {field('zTachie', tool.defaults.zTachie)}
              {field('zEffect', tool.defaults.zEffect)}
            </Row>
            <Hint>{S.defaultsHint}</Hint>
          </>
        ) : null}
      </div>
    </Card>
  );
}

/* ---------- 畫布 ---------- */

interface Quick {
  id: string;
  mode: 'crop' | 'alpha' | 'flip';
  crop: { left: number; right: number; top: number; bottom: number };
  alpha: number;
  flip: boolean;
  replace: boolean;
}

function RoomCanvas() {
  const p = useProject((s) => s.data);
  const lay = useLayout((s) => s.data);
  const st = useSettings((s) => s.data);
  const sel = useSession((s) => s.roomSel);
  const n = useNotify();
  const confirm = useConfirm();
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<{ move?: BoardMove; resize?: BoardResize }>({});
  const [real, setReal] = useState(false);
  const [help, setHelp] = useState(false);
  const [quick, setQuick] = useState<Quick | null>(null);
  const [phSel, setPhSel] = useState<string | null>(null);
  const room = p.room;
  const ph = placeholderSize(room.tachieHeight);

  const items = useMemo<BoardItem[]>(() => {
    const out: BoardItem[] = p.parts
      .filter((x) => x.visible)
      .map((x) => ({
        id: x.id,
        label: x.name,
        imageUrl: x.imageUrl,
        text: x.text,
        x: x.x,
        y: x.y,
        width: x.width,
        height: x.height,
        z: x.z,
        kind: x.kind,
        locked: x.locked,
        resizable: true,
      }));
    const y = tachieY(room, ph.height, 0);
    for (const h of room.placeholders)
      out.push({
        id: `ph:${h.id}`,
        label: S.placeholder,
        imageUrl: null,
        x: h.x,
        y,
        width: ph.width,
        height: ph.height,
        z: 10000,
        kind: 'placeholder',
        locked: h.locked,
        resizable: true,
      });
    return applyDrag(out, drag);
  }, [p.parts, room, ph.height, ph.width, drag]);

  const zoom = lay.roomZoom;
  const setZoom = (z: number) =>
    patchLayout({ roomZoom: Math.max(0.25, Math.min(2.5, Math.round(z * 100) / 100)) });
  const fitAll = () => {
    setZoom(
      Math.max(0.25, Math.min(1.4, 0.82 * Math.min(40 / room.fieldWidth, 30 / room.fieldHeight))),
    );
    setPan({ x: 0, y: 0 });
  };

  /* 方向鍵移動 1 格（F155） */
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (
        /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) ||
        t.isContentEditable ||
        document.querySelector('[role="dialog"]')
      )
        return;
      const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[
        e.key
      ];
      if (!dir || e.altKey || e.ctrlKey || e.metaKey) return;
      const ids = session().roomSel;
      if (!ids.length) return;
      e.preventDefault();
      commit((d, c) => {
        for (const id of ids) {
          const part = d.parts.find((x) => x.id === id);
          if (part && !part.locked)
            updatePart(d, id, { x: part.x + dir[0], y: part.y + dir[1] }, c);
        }
      });
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  const leaveQuick = async (): Promise<boolean> => {
    if (!quick) return true;
    if (!(await confirm({ title: S.quickDiscard }))) return false;
    setQuick(null);
    return true;
  };

  const select = async (id: string, additive: boolean) => {
    if (id.startsWith('ph:')) {
      setPhSel(id);
      return;
    }
    if (quick && quick.id !== id && !(await leaveQuick())) return;
    const cur = session().roomSel;
    setSession({
      roomSel: additive ? (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]) : [id],
    });
  };

  const onMove = (m: BoardMove) => {
    if (m.phase === 'move') return setDrag({ move: m });
    setDrag({});
    commit((d, c) => {
      for (const id of m.ids) {
        if (id.startsWith('ph:')) {
          const h = d.room.placeholders.find((x) => `ph:${x.id}` === id);
          if (!h) continue;
          h.x = Math.round(h.x + m.dx);
          /* 拖到的位置成為新的基準線（指定位置模式時也改水平位置） */
          const bottom = tachieY(d.room, placeholderSize(d.room.tachieHeight).height, 0) + m.dy;
          const H0 = placeholderSize(d.room.tachieHeight).height;
          const line =
            d.room.tachieAlign === 'top'
              ? bottom - H0 / 2
              : d.room.tachieAlign === 'center'
                ? bottom
                : bottom + H0 / 2;
          d.room.tachieBaseline = Math.round(line);
          if (d.room.tachieAlign === 'position') d.room.tachieX = h.x;
          continue;
        }
        const part = d.parts.find((x) => x.id === id);
        if (part && !part.locked) updatePart(d, id, { x: part.x + m.dx, y: part.y + m.dy }, c);
      }
    });
  };
  const onResize = (r: BoardResize) => {
    if (r.phase === 'move') return setDrag({ resize: r });
    setDrag({});
    commit((d, c) => {
      if (r.id.startsWith('ph:')) return setTachieDefaultHeight(d, r.height);
      const part = d.parts.find((x) => x.id === r.id);
      if (!part) return;
      updatePart(
        d,
        r.id,
        part.lockAspect && imageAspect(part.imageUrl, c.find)
          ? { width: r.width }
          : { width: r.width, height: r.height },
        c,
      );
    });
  };

  const selParts = p.parts.filter((x) => sel.includes(x.id));
  const one = selParts.length === 1 ? selParts[0] : null;

  const align = (op: keyof typeof S.alignOps) => {
    commit((d, c) => {
      const list = d.parts.filter((x) => sel.includes(x.id) && !x.locked);
      if (list.length < 2) return;
      const left = Math.min(...list.map((x) => x.x - x.width / 2));
      const right = Math.max(...list.map((x) => x.x + x.width / 2));
      const top = Math.min(...list.map((x) => x.y - x.height / 2));
      const bottom = Math.max(...list.map((x) => x.y + x.height / 2));
      const cx = (left + right) / 2;
      const cy = (top + bottom) / 2;
      const set = (x: Part, patch: Partial<Part>) => updatePart(d, x.id, patch, c);
      if (op === 'hdist' || op === 'vdist') {
        const k = op === 'hdist' ? 'x' : 'y';
        const sorted = [...list].sort((a, b) => a[k] - b[k]);
        const a = sorted[0][k];
        const b = sorted[sorted.length - 1][k];
        sorted.forEach((x, i) => {
          set(x, { [k]: a + ((b - a) * i) / (sorted.length - 1) });
        });
        return;
      }
      if (op === 'shrink' || op === 'grow') {
        const f = op === 'shrink' ? 0.9 : 1.1;
        for (const x of list)
          set(x, {
            x: cx + (x.x - cx) * f,
            y: cy + (x.y - cy) * f,
            width: x.width * f,
            height: x.height * f,
            lockAspect: false,
          });
        for (const x of list) {
          const orig = useProject.getState().data.parts.find((y) => y.id === x.id);
          if (orig) x.lockAspect = orig.lockAspect;
        }
        return;
      }
      for (const x of list) {
        if (op === 'left') set(x, { x: left + x.width / 2 });
        if (op === 'right') set(x, { x: right - x.width / 2 });
        if (op === 'hcenter') set(x, { x: cx });
        if (op === 'top') set(x, { y: top + x.height / 2 });
        if (op === 'bottom') set(x, { y: bottom - x.height / 2 });
        if (op === 'vcenter') set(x, { y: cy });
      }
    });
  };

  const applyQuick = async () => {
    if (!quick || !one?.imageUrl) return;
    const m = p.materials.find((x) => x.name === one.imageUrl);
    if (!m) return;
    const q = { ...editDefaults(), replace: quick.replace };
    if (quick.mode === 'crop') Object.assign(q, percentCrop(m.width, m.height, quick.crop));
    if (quick.mode === 'alpha') q.opacity = quick.alpha;
    if (quick.mode === 'flip') q.flip = quick.flip;
    const name = await runEdit(m.name, q, n);
    if (name && !quick.replace) commit((d, c) => updatePart(d, one.id, { imageUrl: name }, c));
    setQuick(null);
  };

  const quickStyle = (geo: { left: number; top: number; cell: number }) => {
    if (!quick || !one || quick.mode !== 'crop') return null;
    const W = room.fieldWidth;
    const H = room.fieldHeight;
    const L = geo.left + (one.x - one.width / 2 + W / 2) * geo.cell;
    const T = geo.top + (one.y - one.height / 2 + H / 2) * geo.cell;
    const w = one.width * geo.cell;
    const h = one.height * geo.cell;
    const c = quick.crop;
    return (
      <div
        className="pointer-events-none absolute border-2 border-warning"
        data-testid="quick-crop-box"
        style={{
          left: L + (w * c.left) / 100,
          top: T + (h * c.top) / 100,
          width: (w * (100 - c.left - c.right)) / 100,
          height: (h * (100 - c.top - c.bottom)) / 100,
        }}
      />
    );
  };

  return (
    <Card className="min-w-0">
      <Hint>{S.canvasNote}</Hint>
      <Row>
        <Button
          size="sm"
          variant="ghost"
          aria-label={S.zoomOut}
          onClick={() => setZoom(zoom - 0.1)}
        >
          −
        </Button>
        <span className="text-xs tabular-nums" data-testid="room-zoom">
          {Math.round(zoom * 100)}%
        </span>
        <Button size="sm" variant="ghost" aria-label={S.zoomIn} onClick={() => setZoom(zoom + 0.1)}>
          ＋
        </Button>
        <Button size="sm" onClick={fitAll}>
          {S.zoomFit}
        </Button>
        <Toggle
          checked={st.guides}
          onCheckedChange={(v) => useSettings.getState().patch({ guides: v })}
          aria-label={S.guides}
          label={S.guides}
        />
        <input
          type="color"
          aria-label={S.guideColor}
          value={st.guideColor}
          onChange={(e) => useSettings.getState().patch({ guideColor: e.target.value })}
          className="h-7 w-8 rounded-sm border border-border bg-transparent"
        />
        <Toggle
          checked={lay.roomLayers}
          onCheckedChange={(v) => patchLayout({ roomLayers: v })}
          aria-label={S.layersPanel}
          label={S.layersPanel}
        />
        <Toggle
          checked={real}
          onCheckedChange={setReal}
          aria-label={S.realistic}
          label={S.realistic}
        />
        <Button size="sm" variant="ghost" aria-expanded={help} onClick={() => setHelp(!help)}>
          {S.keysHelp}
        </Button>
      </Row>
      {help ? (
        <ul className="m-0 pl-5 text-xs text-muted">
          {S.keysHelpItems.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      ) : null}
      <div
        className={cn(
          'grid min-w-0 grid-cols-1 gap-2',
          lay.roomLayers && 'md:grid-cols-[minmax(0,1fr)_240px]',
        )}
      >
        <Board
          aria-label={S.roomTitle}
          testId="room-canvas"
          fieldWidth={room.fieldWidth}
          fieldHeight={room.fieldHeight}
          background={room.backgroundUrl}
          foreground={room.foregroundUrl}
          autoCrop
          items={items}
          selected={phSel ? [...sel, phSel] : sel}
          zoom={zoom}
          onZoomChange={setZoom}
          zoomRange={[0.25, 2.5]}
          wheelStep={0.08}
          base="room"
          pan={pan}
          onPanChange={setPan}
          height={420}
          guides={{ on: st.guides, color: st.guideColor }}
          decorations={!real}
          step={1}
          axisRatio={2}
          diagonal="max"
          threshold={3}
          onSelect={(id, add) => void select(id, add)}
          onBlankClick={async () => {
            if (!(await leaveQuick())) return;
            setSession({ roomSel: [] });
            setPhSel(null);
          }}
          onMove={onMove}
          onResize={onResize}
          overlay={(geo) => quickStyle(geo)}
        />
        {lay.roomLayers ? <RoomLayers phSel={phSel} setPhSel={setPhSel} /> : null}
      </div>
      <div className="flex flex-col gap-2 rounded-md bg-surface-2 p-2" data-testid="room-toolbar">
        {!sel.length ? (
          <Hint>{S.selectHint}</Hint>
        ) : (
          <Row>
            <span className="text-xs">{S.selCount(sel.length)}</span>
            {one ? (
              <>
                <Button
                  size="sm"
                  onClick={() =>
                    setSession({ modal: { kind: 'source', ref: { kind: 'part', id: one.id } } })
                  }
                >
                  {S.selDetail}
                </Button>
                {one.imageUrl ? (
                  <>
                    {(['crop', 'alpha', 'flip'] as const).map((mode) => (
                      <Button
                        key={mode}
                        size="sm"
                        variant={quick?.mode === mode ? 'primary' : 'secondary'}
                        onClick={() =>
                          setQuick({
                            id: one.id,
                            mode,
                            crop: { left: 0, right: 0, top: 0, bottom: 0 },
                            alpha: 100,
                            flip: true,
                            replace: false,
                          })
                        }
                      >
                        {mode === 'crop'
                          ? S.quickCrop
                          : mode === 'alpha'
                            ? S.quickAlpha
                            : S.quickFlip}
                      </Button>
                    ))}
                    <Button
                      size="sm"
                      onClick={() =>
                        one.imageUrl &&
                        setSession({
                          modal: {
                            kind: 'edit',
                            name: one.imageUrl,
                            context: { kind: 'room', partId: one.id },
                            stayRoom: one.id,
                          },
                        })
                      }
                    >
                      {S.quickFull}
                    </Button>
                  </>
                ) : null}
              </>
            ) : (
              (Object.keys(S.alignOps) as (keyof typeof S.alignOps)[]).map((op) => (
                <Button
                  key={op}
                  size="sm"
                  disabled={(op === 'hdist' || op === 'vdist') && sel.length < 3}
                  onClick={() => align(op)}
                >
                  {S.alignOps[op]}
                </Button>
              ))
            )}
            <Button size="sm" variant="ghost" onClick={() => setSession({ roomSel: [] })}>
              {S.selClear}
            </Button>
          </Row>
        )}
        {quick && one ? (
          <div className="flex flex-col gap-2" data-testid="quick-edit">
            {quick.mode === 'crop'
              ? (['left', 'right', 'top', 'bottom'] as const).map((k) => (
                  <Labeled key={k} label={`${S.quickCropSides[k]}（%）`}>
                    <Slider
                      value={quick.crop[k]}
                      min={0}
                      max={45}
                      onChange={(v) => {
                        const c = { ...quick.crop, [k]: v };
                        if (c.left + c.right > 95)
                          c[k] = 95 - (k === 'left' ? c.right : k === 'right' ? c.left : 0);
                        if (c.top + c.bottom > 95)
                          c[k] = 95 - (k === 'top' ? c.bottom : k === 'bottom' ? c.top : 0);
                        setQuick({ ...quick, crop: c });
                      }}
                    />
                  </Labeled>
                ))
              : null}
            {quick.mode === 'alpha' ? (
              <Labeled label={S.quickAlpha}>
                <Slider
                  value={quick.alpha}
                  min={0}
                  max={100}
                  unit="%"
                  onChange={(v) => setQuick({ ...quick, alpha: v })}
                />
              </Labeled>
            ) : null}
            {quick.mode === 'flip' ? (
              <Checkbox
                checked={quick.flip}
                onCheckedChange={(v) => setQuick({ ...quick, flip: !!v })}
                aria-label={S.quickFlip}
                label={S.quickFlip}
              />
            ) : null}
            <Row>
              <Checkbox
                checked={quick.replace}
                onCheckedChange={(v) => setQuick({ ...quick, replace: !!v })}
                aria-label={S.quickReplace}
                label={S.quickReplace}
              />
              <Button size="sm" variant="primary" onClick={() => void applyQuick()}>
                {S.quickApply}
              </Button>
              <Button size="sm" onClick={() => setQuick(null)}>
                {S.quickCancel}
              </Button>
            </Row>
          </div>
        ) : null}
      </div>
      <Hint>{S.placeholderNote}</Hint>
    </Card>
  );
}

/* ---------- 圖層面板（F157） ---------- */

function RoomLayers({
  phSel,
  setPhSel,
}: {
  phSel: string | null;
  setPhSel: (v: string | null) => void;
}) {
  const parts = useProject((s) => s.data.parts);
  const phs = useProject((s) => s.data.room.placeholders);
  const sel = useSession((s) => s.roomSel);
  const sorted = [...parts].sort((a, b) => b.z - a.z);
  return (
    <div
      className="flex min-w-0 flex-col gap-1 rounded-md border border-border p-1.5 text-xs"
      data-testid="room-layers"
    >
      <b>{S.layersTitle}</b>
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
        {sorted.map((x) => (
          <li
            key={x.id}
            className={cn(
              'flex items-center gap-1 rounded-sm px-1',
              sel.includes(x.id) && 'bg-accent-soft',
            )}
            data-room-layer={x.id}
          >
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left"
              onClick={(e) => {
                const add = e.shiftKey || e.ctrlKey || e.metaKey;
                setSession({
                  roomSel: add
                    ? sel.includes(x.id)
                      ? sel.filter((y) => y !== x.id)
                      : [...sel, x.id]
                    : [x.id],
                });
              }}
            >
              {x.kind === 'panel' ? '▣ ' : '◆ '}
              {x.name}
            </button>
            <IconButton
              size="sm"
              variant="ghost"
              label={`${x.locked ? S.layerLocked : S.layerUnlocked}：${x.name}`}
              icon={x.locked ? <Lock /> : <Unlock />}
              pressed={x.locked}
              onClick={() =>
                commit((d) => {
                  d.parts.find((y) => y.id === x.id)!.locked = !x.locked;
                })
              }
            />
            <IconButton
              size="sm"
              variant="ghost"
              label={`${S.layerVisible}：${x.name}`}
              icon={x.visible ? <Eye /> : <EyeOff />}
              pressed={x.visible}
              onClick={() =>
                commit((d) => {
                  d.parts.find((y) => y.id === x.id)!.visible = !x.visible;
                })
              }
            />
            <NumCell
              aria-label={`${S.zOrder}：${x.name}`}
              value={x.z}
              className="w-14"
              onCommit={(v) => v != null && commit((d, c) => updatePart(d, x.id, { z: v }, c))}
            />
          </li>
        ))}
        {phs.map((h) => (
          <li
            key={h.id}
            className={cn(
              'flex items-center gap-1 rounded-sm px-1',
              phSel === `ph:${h.id}` && 'bg-accent-soft',
            )}
          >
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left text-muted"
              onClick={() => setPhSel(`ph:${h.id}`)}
            >
              {S.placeholder}
            </button>
            <IconButton
              size="sm"
              variant="ghost"
              label={h.locked ? S.layerLocked : S.layerUnlocked}
              icon={h.locked ? <Lock /> : <Unlock />}
              pressed={h.locked}
              onClick={() =>
                commit((d) => {
                  d.room.placeholders.find((y) => y.id === h.id)!.locked = !h.locked;
                })
              }
            />
            <IconButton
              size="sm"
              variant="ghost"
              label={S.partDelete}
              icon={<Trash2 />}
              onClick={() =>
                commit((d) => {
                  d.room.placeholders = d.room.placeholders.filter((y) => y.id !== h.id);
                })
              }
            />
          </li>
        ))}
        <li className="px-1 text-muted">{S.layerFront}</li>
      </ul>
      <Button
        size="sm"
        onClick={() =>
          commit((d) => {
            const n = d.room.placeholders.length;
            d.room.placeholders.push({ id: `ph${Date.now().toString(36)}`, x: 0, locked: false });
            const w = placeholderSize(d.room.tachieHeight).width;
            const total = (n + 1) * w + n * 2;
            d.room.placeholders.forEach((h, i) => {
              h.x = Math.round(-total / 2 + w / 2 + i * (w + 2));
            });
          })
        }
      >
        {S.placeholderAdd}
      </Button>
    </div>
  );
}

/* ---------- 部件清單（F160～F168） ---------- */

function PartsList() {
  const parts = useProject((s) => s.data.parts);
  const n = useNotify();
  const col = (kind: PartKind) => {
    const list = parts.filter((x) => x.kind === kind);
    return (
      <div className="flex min-w-0 flex-col gap-2" data-testid={`parts-${kind}`}>
        <Row>
          <b>
            {kind === 'marker' ? S.markersCol : S.panelsCol}（{list.length}）
          </b>
        </Row>
        <Hint>{kind === 'marker' ? S.markersHint : S.panelsHint}</Hint>
        <Row>
          <Button
            size="sm"
            variant="primary"
            onClick={() => commit((d, c) => void addPart(d, { kind }, c))}
          >
            {kind === 'marker' ? S.addMarker : S.addPanel}
          </Button>
          {kind === 'marker' ? (
            <Button size="sm" onClick={() => commit((d, c) => void addTachieSizedPart(d, c))}>
              {S.addTachieSized}
            </Button>
          ) : null}
          <Button size="sm" onClick={() => setSession({ modal: { kind: 'multi', for: kind } })}>
            {S.fromMaterials}
          </Button>
          <Button size="sm" onClick={() => setSession({ modal: { kind: 'partTemplates' } })}>
            {S.fromTemplates}
          </Button>
        </Row>
        <DropCreate
          testId={`drop-${kind}`}
          onMaterials={(names) => createFrom(kind, names, n, { stay: true })}
          onFiles={async (files) => {
            const r = await importFiles(files);
            if (r.names.length) createFrom(kind, r.names, n, { stay: true });
          }}
        />
        {!list.length ? <Hint>{S.noParts}</Hint> : null}
        {list.map((x) => (
          <PartCard key={x.id} part={x} />
        ))}
      </div>
    );
  };
  return (
    <Card title={S.partsTitle} sub={S.partsLead}>
      <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
        {col('marker')}
        {col('panel')}
      </div>
    </Card>
  );
}

function PartCard({ part }: { part: Part }) {
  const n = useNotify();
  const choose = useChoice();
  const [ask, node] = usePromptDialog();
  const [open, setOpen] = useState(false);
  const scenes = useProject((s) => s.data.scenes);
  const mat = useProject((s) => s.data.materials.find((m) => m.name === part.imageUrl));
  const sel = useSession((s) => s.roomSel.includes(part.id));
  const upd = (patch: Partial<Part>) => commit((d, c) => updatePart(d, part.id, patch, c));
  const usage = partSceneUsage({ scenes }, part.id);
  const toTemplate = async () => {
    if (!part.imageUrl) return n(S.templateNeedImage, 'warning');
    let name = part.name;
    let replaceId: string | undefined;
    const dup = findPartTemplate(part.kind, name);
    if (dup) {
      const how = await choose({
        title: S.templateOverwrite(name),
        choices: [
          { value: 'overwrite', label: S.templateOverwriteBtn, variant: 'danger' },
          { value: 'rename', label: S.templateRename },
        ],
      });
      if (!how) return;
      if (how === 'overwrite') replaceId = dup.id;
      else {
        const v = await ask(S.templateNewName, S.templateName, `${name}${S.makerCopySuffix}`);
        if (!v?.trim()) return;
        name = v.trim();
        if (findPartTemplate(part.kind, name)) return n(S.templateNameDup(name), 'warning');
      }
    }
    await savePartTemplate(partTemplateFrom(part, name), replaceId);
    n(S.templateSaved, 'success');
  };
  return (
    <article
      className={cn(
        'flex min-w-0 flex-col gap-2 rounded-md border border-border bg-surface-2 p-2',
        !part.visible && 'opacity-60',
        sel && 'border-accent',
      )}
      data-part={part.id}
      aria-label={part.name}
    >
      <Row>
        <Toggle
          checked={part.visible}
          onCheckedChange={(v) => upd({ visible: v })}
          aria-label={`${S.partVisible}：${part.name}`}
        />
        <TextInput
          aria-label={S.partName}
          value={part.name}
          onChange={(e) => upd({ name: e.target.value })}
          className="min-w-0 flex-1"
        />
        <IconButton
          size="sm"
          variant="ghost"
          label={S.partUp}
          icon={<ArrowUp />}
          onClick={() => commit((d) => movePart(d, part.id, -1))}
        />
        <IconButton
          size="sm"
          variant="ghost"
          label={S.partDown}
          icon={<ArrowDown />}
          onClick={() => commit((d) => movePart(d, part.id, 1))}
        />
        <IconButton
          size="sm"
          variant="ghost"
          label={part.kind === 'panel' ? S.toMarker : S.toPanel}
          icon={<Repeat />}
          onClick={() => {
            let k: PartKind | null = null;
            commit((d) => {
              k = switchPartKind(d, part.id);
            });
            n(k === 'panel' ? S.switchedPanel : S.switchedMarker);
          }}
        />
        <IconButton
          size="sm"
          variant="ghost"
          label={S.partCopy}
          icon={<Copy />}
          onClick={() => commit((d) => void duplicatePart(d, part.id))}
        />
        <IconButton
          size="sm"
          variant="ghost"
          label={S.partDelete}
          icon={<Trash2 />}
          onClick={() => commit((d) => deletePart(d, part.id))}
        />
      </Row>
      <Row>
        <div className="flex min-w-0 flex-col gap-1">
          <ImageField
            aria-label={`${S.partImage}：${part.name}`}
            value={part.imageUrl}
            onChange={(v) => upd({ imageUrl: v })}
          />
          {mat ? (
            <span className="text-[11px] text-muted">
              {mat.label} {mat.width ? `${mat.width}×${mat.height}px` : ''}
            </span>
          ) : (
            <span className="text-[11px] text-warning">{S.partNoImage}</span>
          )}
        </div>
        <Checkbox
          checked={part.lockAspect}
          onCheckedChange={(v) => upd({ lockAspect: !!v })}
          aria-label={S.partLockAspect}
          label={S.partLockAspect}
        />
        <Checkbox
          checked={part.locked}
          onCheckedChange={(v) => upd({ locked: !!v })}
          aria-label={S.partLocked}
          label={S.partLocked}
        />
      </Row>
      <Row>
        {(
          [
            ['x', S.posX],
            ['y', S.posY],
            ['z', S.zOrder],
            ['width', S.width],
            ['height', S.height],
          ] as const
        ).map(([k, label]) => (
          <Labeled key={k} label={label}>
            <NumCell
              aria-label={`${label}：${part.name}`}
              value={part[k]}
              onCommit={(v) => v != null && upd({ [k]: v })}
              className="w-16"
            />
          </Labeled>
        ))}
      </Row>
      <button
        type="button"
        className="self-start text-xs text-accent"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? '▾' : '▸'} {S.partDetails}
      </button>
      {open ? (
        <div className="flex flex-col gap-2">
          <div>
            <Button size="sm" onClick={() => void toTemplate()}>
              {S.partToTemplate}
            </Button>
          </div>
          <Labeled label={part.kind === 'panel' ? S.partTextPanel : S.partTextMarker}>
            <textarea
              aria-label={S.partText}
              value={part.text}
              rows={2}
              onChange={(e) => upd({ text: e.target.value })}
              className="w-full rounded-md border border-border-strong bg-surface p-1.5 text-sm text-fg focus-visible:focus-ring"
            />
          </Labeled>
          {part.kind === 'marker' ? (
            <div className="text-xs text-muted" data-testid="part-usage">
              <b>{S.partUsage}：</b>
              {!usage.hidden.length && !usage.image.length && !usage.moved.length ? (
                S.partUsageNone
              ) : (
                <span className="flex flex-wrap gap-2">
                  {(['hidden', 'image', 'moved'] as const).map((k) =>
                    usage[k].length ? (
                      <span key={k} title={usage[k].join('、')}>
                        {S.partUsageKinds[k]} {S.partUsageCount(usage[k].length)}
                      </span>
                    ) : null,
                  )}
                </span>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
      {node}
    </article>
  );
}
