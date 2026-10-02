/**
 * 流程圖的編輯（F130～F139）：方框的新增、選取、移動（0.5 mm 吸附，Alt 不吸附）、改大小、連線、框選、對齊、刪除。
 * 圖以紙面的排法放大顯示；座標都是 mm。
 */
import { Minus, Plus } from 'lucide-react';
import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { MM_PX } from '@/core/paged';
import {
  Button,
  Dialog,
  DialogClose,
  Field,
  FieldRow,
  IconButton,
  NativeNumberInput,
  Select,
  TextArea,
  TextInput,
} from '@/ui';
import { findBlock } from '../model/blocks';
import {
  edgeGeom,
  FLOW_ALIGNS,
  FLOW_KINDS,
  FLOW_MAX_H,
  FLOW_MAX_W,
  FLOW_MIN_H,
  FLOW_MIN_W,
  flowAddNode,
  flowAlign,
  flowDeleteNodes,
  flowDupNodes,
  flowFit,
  flowFitContent,
  flowNode,
  halfMm,
} from '../model/flow';
import { BOX_COLORS } from '../model/proc';
import { uid } from '../model/text';
import type { Flow, FlowKind, FlowNode } from '../model/types';
import { flowHtml } from '../render/html';
import { editBlock, say, setUi, useDoc, useUi } from '../store';
import { escapeLeavesField } from './PopupDialog';

const ZMIN = 0.4;
const ZMAX = 3;

function editFlow(id: string, fn: (f: Flow) => void): void {
  editBlock(id, (b) => {
    if (b.flow) fn(b.flow);
  });
}

/** 點到線段的距離 */
function segDist(px: number, py: number, a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / L)) : 0;
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}

export function FlowDialog() {
  const id = useUi((s) => s.flowEdit);
  const b = useDoc((s) => (id ? findBlock(s.data, id)?.b : null));
  const base = useDoc((s) => s.data.base);
  const f = b?.flow;
  const [sel, setSel] = useState<string[]>([]);
  const [edge, setEdge] = useState<string | null>(null);
  const [z, setZ] = useState(1);
  const [linking, setLinking] = useState<string | null>(null);
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const area = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);

  /* 開啟時依視窗寬決定倍率（0.4～1.6） */
  useEffect(() => {
    if (!id) return;
    setSel([]);
    setEdge(null);
    setLinking(null);
    requestAnimationFrame(() => {
      const w = wrap.current?.clientWidth ?? 600;
      const fw = (findBlock(useDoc.getState().data, id)?.b.flow?.w ?? 105) * MM_PX;
      setZ(Math.max(ZMIN, Math.min(1.6, Math.round(((w - 24) / fw) * 10) / 10)));
    });
  }, [id]);

  const html = useMemo(() => (f ? flowHtml(f, true) : ''), [f]);
  /* Delete／Backspace：刪除選取的方框或線（F138；在欄位裡打字時除外） */
  const delRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('input,textarea,select,[role="combobox"],[role="alertdialog"]')) return;
      e.preventDefault();
      e.stopPropagation();
      delRef.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [id]);
  if (!id || !f) return null;
  const close = () => setUi({ flowEdit: null });
  const s = MM_PX * z;
  const nodes = sel.map((x) => flowNode(f, x)).filter((n): n is FlowNode => !!n);
  const one = nodes.length === 1 ? nodes[0] : null;
  const curEdge = edge ? f.edges.find((e) => e.id === edge) : null;

  const toMm = (e: { clientX: number; clientY: number }) => {
    const r = area.current?.getBoundingClientRect();
    return r ? { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s } : { x: 0, y: 0 };
  };

  const add = (kind: FlowKind) => {
    let made = '';
    editFlow(id, (fl) => {
      const baseN = one ? flowNode(fl, one.id) : null;
      made = flowAddNode(fl, kind, baseN).id;
    });
    setSel([made]);
    setEdge(null);
  };

  const link = (from: string, to: string) => {
    if (from === to) return;
    editFlow(id, (fl) => {
      if (!fl.edges.some((e) => e.a === from && e.b === to))
        fl.edges.push({ id: uid(), a: from, b: to, lb: '' });
    });
    setLinking(null);
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    const t = e.target as HTMLElement;
    const p = toMm(e);
    if (t.dataset.link) {
      e.preventDefault();
      setLinking(t.dataset.link);
      return;
    }
    if (t.dataset.resize) {
      e.preventDefault();
      startResize(t.dataset.resize, p);
      return;
    }
    const nodeEl = t.closest<HTMLElement>('[data-fnode]');
    if (nodeEl?.dataset.fnode) {
      const nid = nodeEl.dataset.fnode;
      if (linking) {
        link(linking, nid);
        return;
      }
      let next = sel;
      if (e.shiftKey || e.ctrlKey || e.metaKey)
        next = sel.includes(nid) ? sel.filter((x) => x !== nid) : [...sel, nid];
      else if (!sel.includes(nid)) next = [nid];
      setSel(next);
      setEdge(null);
      if (next.includes(nid)) startMove(next, p);
      return;
    }
    if (linking) {
      setLinking(null);
      return;
    }
    /* 線的附近 */
    for (const ed of f.edges) {
      const g = edgeGeom(f, ed);
      if (g && segDist(p.x, p.y, g.p1, g.p2) < 1.6) {
        setEdge(ed.id);
        setSel([]);
        return;
      }
    }
    startMarquee(p, e.shiftKey || e.ctrlKey || e.metaKey);
  };

  function track(
    onMove: (p: { x: number; y: number }, alt: boolean) => void,
    onEnd?: (moved: boolean) => void,
  ) {
    let moved = false;
    const mv = (ev: PointerEvent) => {
      moved = true;
      onMove(toMm(ev), ev.altKey);
    };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      onEnd?.(moved);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  }

  function startMove(ids: string[], p0: { x: number; y: number }) {
    const start = new Map(ids.map((x) => [x, { ...(flowNode(f as Flow, x) as FlowNode) }]));
    track((p, alt) => {
      let dx = p.x - p0.x;
      let dy = p.y - p0.y;
      if (!alt) {
        dx = halfMm(dx);
        dy = halfMm(dy);
      }
      editFlow(id as string, (fl) => {
        for (const [nid, o] of start) {
          const n = flowNode(fl, nid);
          if (!n) continue;
          n.x = Math.max(0, Math.min(fl.w - n.w, o.x + dx));
          n.y = Math.max(0, Math.min(fl.h - n.h, o.y + dy));
          if (!alt) {
            n.x = halfMm(n.x);
            n.y = halfMm(n.y);
          }
        }
      });
    });
  }

  function startResize(nid: string, p0: { x: number; y: number }) {
    const o = { ...(flowNode(f as Flow, nid) as FlowNode) };
    track((p, alt) => {
      let w = o.w + (p.x - p0.x);
      let h = o.h + (p.y - p0.y);
      if (!alt) {
        w = halfMm(w);
        h = halfMm(h);
      }
      editFlow(id as string, (fl) => {
        const n = flowNode(fl, nid);
        if (!n) return;
        n.w = Math.max(FLOW_MIN_W, Math.min(fl.w - n.x, w));
        n.h = Math.max(FLOW_MIN_H, Math.min(fl.h - n.y, h));
      });
    });
  }

  function startMarquee(p0: { x: number; y: number }, add: boolean) {
    const base0 = add ? sel : [];
    track(
      (p) => {
        const r = {
          x: Math.min(p0.x, p.x),
          y: Math.min(p0.y, p.y),
          w: Math.abs(p.x - p0.x),
          h: Math.abs(p.y - p0.y),
        };
        setBox(r);
        const hit = (f as Flow).nodes
          .filter((n) => n.x < r.x + r.w && n.x + n.w > r.x && n.y < r.y + r.h && n.y + n.h > r.y)
          .map((n) => n.id);
        setSel([...new Set([...base0, ...hit])]);
      },
      (moved) => {
        setBox(null);
        if (!moved && !add) {
          setSel([]);
          setEdge(null);
        }
      },
    );
  }

  const del = () => {
    if (sel.length) {
      const ids = new Set(sel);
      editFlow(id, (fl) => flowDeleteNodes(fl, ids));
      setSel([]);
      return;
    }
    if (edge) {
      editFlow(id, (fl) => {
        fl.edges = fl.edges.filter((e) => e.id !== edge);
      });
      setEdge(null);
      return;
    }
    say('請先選取要刪除的方框或線。', 'warn');
  };

  delRef.current = del;

  const setNodes = (fn: (n: FlowNode, fl: Flow) => void) =>
    editFlow(id, (fl) => {
      for (const x of sel) {
        const n = flowNode(fl, x);
        if (n) {
          fn(n, fl);
          flowFit(fl, n);
        }
      }
    });

  const num = (v: string) => Math.round((+v || 0) * 2) / 2;

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && close()}
      title="流程圖"
      size="xl"
      className="max-w-[min(1300px,calc(100vw-2rem))]"
      onEscapeKeyDown={escapeLeavesField}
      footer={<DialogClose>完成</DialogClose>}
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]" data-testid="se-flow-dialog">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1">
            <Button size="sm" variant="secondary" onClick={() => add('box')}>
              ＋方框
            </Button>
            <Button size="sm" variant="secondary" onClick={() => add('round')}>
              ＋圓角
            </Button>
            <Button size="sm" variant="secondary" onClick={() => add('diamond')}>
              ＋菱形
            </Button>
            <Button size="sm" variant="secondary" onClick={() => add('term')}>
              ＋圓端
            </Button>
            <span className="mx-1 h-5 w-px bg-border" aria-hidden />
            <IconButton
              size="sm"
              variant="ghost"
              label="縮小"
              icon={<Minus />}
              onClick={() => setZ((v) => Math.max(ZMIN, Math.round((v - 0.2) * 10) / 10))}
            />
            <span className="w-12 text-center text-xs tabular-nums">{Math.round(z * 100)}%</span>
            <IconButton
              size="sm"
              variant="ghost"
              label="放大"
              icon={<Plus />}
              onClick={() => setZ((v) => Math.min(ZMAX, Math.round((v + 0.2) * 10) / 10))}
            />
            {linking ? (
              <span className="text-xs text-accent">按另一個方框連線（按空白處取消）</span>
            ) : null}
          </div>
          <div ref={wrap} className="max-h-[62dvh] overflow-auto rounded-md bg-surface-2 p-3">
            <div
              ref={area}
              className="relative"
              style={{
                width: f.w * s,
                height: f.h * s,
                background: '#f7f3ea',
                touchAction: 'none',
              }}
              onPointerDown={onPointerDown}
            >
              <div
                className="pg"
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: `${f.w}mm`,
                  height: `${f.h}mm`,
                  transform: `scale(${z})`,
                  transformOrigin: '0 0',
                  boxShadow: 'none',
                  overflow: 'visible',
                }}
              >
                <div
                  className="b t-flow"
                  style={{ fontSize: `${base}pt`, margin: 0 }}
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: 紙面的 HTML 由本工具產生（文字都已跳脫）
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              </div>
              {f.edges.map((ed) => {
                if (ed.id !== edge) return null;
                const g = edgeGeom(f, ed);
                if (!g) return null;
                return (
                  <svg
                    key={ed.id}
                    className="pointer-events-none absolute inset-0"
                    width={f.w * s}
                    height={f.h * s}
                    aria-hidden
                  >
                    <line
                      x1={g.p1[0] * s}
                      y1={g.p1[1] * s}
                      x2={g.p2[0] * s}
                      y2={g.p2[1] * s}
                      stroke="var(--accent)"
                      strokeWidth={4}
                      opacity={0.6}
                    />
                  </svg>
                );
              })}
              {nodes.map((n) => (
                <div
                  key={n.id}
                  className="pointer-events-none absolute border-2 border-accent"
                  style={{
                    left: n.x * s - 2,
                    top: n.y * s - 2,
                    width: n.w * s + 4,
                    height: n.h * s + 4,
                  }}
                >
                  {one ? (
                    <>
                      <span
                        data-link={n.id}
                        title="按住這裡，再按另一個方框連線"
                        className="pointer-events-auto absolute -top-2 left-1/2 size-3.5 -translate-x-1/2 cursor-crosshair rounded-full bg-[#c0392b] ring-2 ring-white"
                      />
                      <span
                        data-resize={n.id}
                        title="拖曳改大小"
                        className="pointer-events-auto absolute -right-1.5 -bottom-1.5 size-3 cursor-nwse-resize bg-accent ring-1 ring-white"
                      />
                    </>
                  ) : null}
                </div>
              ))}
              {box ? (
                <div
                  className="pointer-events-none absolute border border-accent bg-accent-soft"
                  style={{ left: box.x * s, top: box.y * s, width: box.w * s, height: box.h * s }}
                />
              ) : null}
            </div>
          </div>
          <p className="m-0 text-xs text-muted">
            按方框選取（Shift／Ctrl 追加），拖曳移動（每 0.5 mm 吸附，按住 Alt
            不吸附）；右下角改大小、上緣的紅點連線；空白處拖曳框選；Delete 刪除。
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {one ? (
            <NodeProps
              id={id}
              n={one}
              onLink={() => setLinking(one.id)}
              onDup={(ids) => setSel(ids)}
              onDelete={del}
            />
          ) : nodes.length > 1 ? (
            <div className="flex flex-col gap-2">
              <p className="m-0 text-sm">已選取 {nodes.length} 個方框。</p>
              <div className="grid grid-cols-2 gap-1">
                {FLOW_ALIGNS.map((a) => (
                  <Button
                    key={a.k}
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      editFlow(id, (fl) => {
                        flowAlign(
                          fl,
                          sel.map((x) => flowNode(fl, x)).filter((n): n is FlowNode => !!n),
                          a.k,
                        );
                      })
                    }
                  >
                    {a.name}
                  </Button>
                ))}
              </div>
              <ShapeColor
                value={nodes[0]}
                onKind={(k) => setNodes((n) => (n.kind = k))}
                onCol={(c) => setNodes((n) => (n.col = c as FlowNode['col']))}
              />
              <FieldRow columns={3}>
                <Field label="寬">
                  <NativeNumberInput
                    value=""
                    unit="mm"
                    placeholder="—"
                    onChange={(v) => v !== '' && setNodes((n) => (n.w = num(v)))}
                  />
                </Field>
                <Field label="高">
                  <NativeNumberInput
                    value=""
                    unit="mm"
                    placeholder="—"
                    onChange={(v) => v !== '' && setNodes((n) => (n.h = num(v)))}
                  />
                </Field>
                <Field label="間距">
                  <NativeNumberInput
                    value=""
                    unit="mm"
                    placeholder="—"
                    min={0}
                    max={20}
                    onChange={(v) =>
                      v !== '' && setNodes((n) => (n.pad = Math.max(0, Math.min(20, +v || 0))))
                    }
                  />
                </Field>
              </FieldRow>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    let made: string[] = [];
                    editFlow(id, (fl) => {
                      made = flowDupNodes(
                        fl,
                        sel.map((x) => flowNode(fl, x)).filter((n): n is FlowNode => !!n),
                      ).map((n) => n.id);
                    });
                    setSel(made);
                  }}
                >
                  一起複製
                </Button>
                <Button size="sm" variant="danger" onClick={del}>
                  一起刪除
                </Button>
              </div>
            </div>
          ) : curEdge ? (
            <div className="flex flex-col gap-2">
              <Field label="線的標籤">
                <TextInput
                  value={curEdge.lb}
                  onChange={(e) =>
                    editFlow(id, (fl) => {
                      const x = fl.edges.find((y) => y.id === curEdge.id);
                      if (x) x.lb = e.target.value;
                    })
                  }
                />
              </Field>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    editFlow(id, (fl) => {
                      const x = fl.edges.find((y) => y.id === curEdge.id);
                      if (x) [x.a, x.b] = [x.b, x.a];
                    })
                  }
                >
                  反轉方向
                </Button>
                <Button size="sm" variant="danger" onClick={del}>
                  刪除線
                </Button>
              </div>
            </div>
          ) : (
            <p className="m-0 text-sm text-muted">選取方框或線來修改。</p>
          )}
          <hr className="my-1 border-border" />
          <FieldRow columns={2}>
            <Field label="圖的寬">
              <NativeNumberInput
                value={String(f.w)}
                min={30}
                max={FLOW_MAX_W}
                unit="mm"
                onChange={(v) =>
                  v !== '' &&
                  editFlow(
                    id,
                    (fl) => (fl.w = Math.max(30, Math.min(FLOW_MAX_W, Math.round(+v || 105)))),
                  )
                }
              />
            </Field>
            <Field label="圖的高">
              <NativeNumberInput
                value={String(f.h)}
                min={20}
                max={FLOW_MAX_H}
                unit="mm"
                onChange={(v) =>
                  v !== '' &&
                  editFlow(
                    id,
                    (fl) => (fl.h = Math.max(20, Math.min(FLOW_MAX_H, Math.round(+v || 170)))),
                  )
                }
              />
            </Field>
          </FieldRow>
          <Button size="sm" variant="secondary" onClick={() => editFlow(id, flowFitContent)}>
            配合內容
          </Button>
          <p className="m-0 text-xs text-muted">
            方框 {f.nodes.length} 個、線 {f.edges.length} 條。
          </p>
        </div>
      </div>
    </Dialog>
  );
}

function ShapeColor({
  value,
  onKind,
  onCol,
}: {
  value: FlowNode;
  onKind: (k: FlowKind) => void;
  onCol: (c: string) => void;
}) {
  return (
    <FieldRow columns={2}>
      <Field label="形狀">
        <Select
          size="sm"
          value={value.kind}
          onValueChange={(v) => onKind(v as FlowKind)}
          options={FLOW_KINDS.map((k) => ({ value: k.k, label: k.name }))}
        />
      </Field>
      <Field label="顏色">
        <Select
          size="sm"
          value={value.col || 'default'}
          onValueChange={(v) => onCol(v === 'default' ? '' : v)}
          options={[
            { value: 'default', label: '預設（墨）' },
            ...BOX_COLORS.map((c) => ({ value: c.k, label: c.name })),
          ]}
        />
      </Field>
    </FieldRow>
  );
}

function NodeProps({
  id,
  n,
  onLink,
  onDup,
  onDelete,
}: {
  id: string;
  n: FlowNode;
  onLink: () => void;
  onDup: (ids: string[]) => void;
  onDelete: () => void;
}) {
  const set = (fn: (x: FlowNode, fl: Flow) => void) =>
    editFlow(id, (fl) => {
      const x = flowNode(fl, n.id);
      if (x) {
        fn(x, fl);
        flowFit(fl, x);
      }
    });
  const num = (v: string) => Math.round((+v || 0) * 2) / 2;
  return (
    <div className="flex flex-col gap-2">
      <Field label="文字">
        <TextArea rows={2} value={n.t} onChange={(e) => set((x) => (x.t = e.target.value))} />
      </Field>
      <Field label="第 2 段" hint="有填時方框分成上下兩段。">
        <TextArea rows={2} value={n.t2} onChange={(e) => set((x) => (x.t2 = e.target.value))} />
      </Field>
      <ShapeColor
        value={n}
        onKind={(k) => set((x) => (x.kind = k))}
        onCol={(c) => set((x) => (x.col = c as FlowNode['col']))}
      />
      <FieldRow columns={2}>
        <Field label="寬">
          <NativeNumberInput
            value={String(n.w)}
            unit="mm"
            step={0.5}
            onChange={(v) => v !== '' && set((x) => (x.w = num(v)))}
          />
        </Field>
        <Field label="高">
          <NativeNumberInput
            value={String(n.h)}
            unit="mm"
            step={0.5}
            onChange={(v) => v !== '' && set((x) => (x.h = num(v)))}
          />
        </Field>
        <Field label="距左">
          <NativeNumberInput
            value={String(n.x)}
            unit="mm"
            step={0.5}
            onChange={(v) => v !== '' && set((x) => (x.x = num(v)))}
          />
        </Field>
        <Field label="距上">
          <NativeNumberInput
            value={String(n.y)}
            unit="mm"
            step={0.5}
            onChange={(v) => v !== '' && set((x) => (x.y = num(v)))}
          />
        </Field>
      </FieldRow>
      <Field label="內側間距">
        <NativeNumberInput
          value={String(n.pad)}
          min={0}
          max={20}
          step={0.5}
          unit="mm"
          onChange={(v) => v !== '' && set((x) => (x.pad = Math.max(0, Math.min(20, +v || 0))))}
        />
      </Field>
      <div className="flex flex-wrap gap-1">
        <Button size="sm" variant="secondary" onClick={onLink}>
          從這裡拉線
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            let made: string[] = [];
            editFlow(id, (fl) => {
              const x = flowNode(fl, n.id);
              if (x) made = flowDupNodes(fl, [x]).map((y) => y.id);
            });
            onDup(made);
          }}
        >
          複製
        </Button>
        <Button size="sm" variant="danger" onClick={onDelete}>
          刪除方框
        </Button>
      </div>
    </div>
  );
}
