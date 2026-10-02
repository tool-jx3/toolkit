/**
 * 文字＋圖形合成圖製作器（F105～F117、3.3.3）：畫布（寬高、背景）、加入元素、元素設定（文字、圖片、圖形、共通）、
 * 圖層清單（選取、顯示、鎖定、前後、複製、刪除）、畫布操作（點選、Shift 加選、拖曳、四角改大小、點空白取消）、
 * 對齊與均分、製作器自己的復原／重做（50 步）、輸出（檔名、品質、預估大小）、製作。
 */
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  EyeOff,
  Lock,
  Redo2,
  Trash2,
  Undo2,
  Unlock,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Button,
  Checkbox,
  ColorField,
  cn,
  Dialog,
  IconButton,
  Segmented,
  Select,
  TextArea,
  TextInput,
  Toggle,
  useConfirm,
} from '@/ui';
import { Hint, ImageField, Labeled, NumCell, Row, useNotify } from '../common';
import { canvasBlob, importFiles } from '../importer';
import {
  type AlignMode,
  alignLayers,
  type Box,
  canvasSize,
  createMakerDoc,
  drawMaker,
  drawSelection,
  handleAt,
  hitLayer,
  LAYER_LABELS,
  MAKER_DEFAULT,
  MAKER_FONTS,
  MAKER_QUALITY,
  type MakerDoc,
  type MakerFontId,
  type MakerLayer,
  type MakerLayerType,
  type MakerQuality,
  makerFileName,
  newLayer,
  resizeLayer,
} from '../maker';
import { formatKb } from '../materials';
import { applyPending, pendingPick } from '../ops';
import { assets, goPage, type MakeContext, setSession, useProject } from '../store';
import { S } from '../strings';

interface Hist {
  list: MakerDoc[];
  index: number;
}

export function MakerDialog({ context, background }: { context: MakeContext; background: string }) {
  const n = useNotify();
  const confirm = useConfirm();
  const materials = useProject((s) => s.data.materials);
  const [doc, setDoc] = useState<MakerDoc>(() => createMakerDoc(background));
  const [hist, setHist] = useState<Hist>(() => ({ list: [createMakerDoc(background)], index: 0 }));
  const [sel, setSel] = useState<string[]>([]);
  const [quality, setQuality] = useState<MakerQuality>('standard');
  const [fileName, setFileName] = useState('');
  const [estimate, setEstimate] = useState(0);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const bounds = useRef<Record<string, Box>>({});
  const bitmaps = useRef(new Map<string, ImageBitmap>());
  const pending = useRef<MakerDoc | null>(null);

  const W = canvasSize(doc.width, MAKER_DEFAULT.width);
  const H = canvasSize(doc.height, MAKER_DEFAULT.height);
  const bmp = useCallback((name: string) => bitmaps.current.get(name) ?? null, []);

  /* 用到的圖先讀好 */
  useEffect(() => {
    const names = [
      doc.backgroundImage,
      ...doc.layers.map((l) => (l.type === 'image' ? l.imageName : '')),
    ].filter(Boolean);
    let alive = true;
    for (const nm of names) {
      if (bitmaps.current.has(nm)) continue;
      void assets.bitmap(nm).then((b) => {
        if (b && alive) {
          bitmaps.current.set(nm, b);
          setTick((t) => t + 1);
        }
      });
    }
    return () => {
      alive = false;
    };
  }, [doc]);

  /* 預覽（含選取框） */
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick＝圖片讀好後要重畫
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    c.width = W;
    c.height = H;
    const cx = c.getContext('2d');
    if (!cx) return;
    bounds.current = drawMaker(cx, doc, bmp);
    drawSelection(cx, doc, bounds.current, sel);
  }, [doc, sel, W, H, bmp, tick]);

  /* 預估大小：變更後約 0.4 秒 */
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick＝圖片讀好後要重算
  useEffect(() => {
    const t = setTimeout(async () => {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const cx = c.getContext('2d');
      if (!cx) return;
      drawMaker(cx, doc, bmp);
      const b = await canvasBlob(c, 'image/webp', MAKER_QUALITY[quality]);
      if (b) setEstimate(b.size);
    }, MAKER_DEFAULT.estimateDelayMs);
    return () => clearTimeout(t);
  }, [doc, quality, W, H, bmp, tick]);

  /** 記一步（一次拖曳、一次欄位編輯、一次按鈕操作各算一步；內容與目前這一步相同時不記） */
  const pushHistory = (next: MakerDoc) =>
    setHist((h) => {
      if (JSON.stringify(h.list[h.index]) === JSON.stringify(next)) return h;
      const list = [...h.list.slice(0, h.index + 1), next].slice(-MAKER_DEFAULT.historyLimit);
      return { list, index: list.length - 1 };
    });
  const change = (next: MakerDoc, record = true) => {
    setDoc(next);
    if (record) pushHistory(next);
  };
  /** 欄位編輯：聚焦到離開算一步 */
  const live = (next: MakerDoc) => {
    setDoc(next);
    pending.current = next;
  };
  const flush = () => {
    if (pending.current) pushHistory(pending.current);
    pending.current = null;
  };
  const undo = () => {
    flush();
    setHist((h) => {
      if (h.index <= 0) return h;
      setDoc(h.list[h.index - 1]);
      return { ...h, index: h.index - 1 };
    });
  };
  const redo = () => {
    flush();
    setHist((h) => {
      if (h.index >= h.list.length - 1) return h;
      setDoc(h.list[h.index + 1]);
      return { ...h, index: h.index + 1 };
    });
  };

  const patchLayer = (id: string, patch: Partial<MakerLayer>, record = false) => {
    const next = {
      ...doc,
      layers: doc.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as MakerLayer) : l)),
    };
    if (record) change(next);
    else live(next);
  };

  const add = (type: MakerLayerType, image?: { name: string; width: number; height: number }) => {
    const l = newLayer(type, doc.layers.length, image);
    change({ ...doc, layers: [l, ...doc.layers] });
    setSel([l.id]);
  };

  const close = () => {
    if (busy) return;
    setSession({ modal: null });
  };
  /** 製作中按 Esc 也照樣關閉（F285）：之後只把成品加進素材，不再放回選圖欄、不換頁 */
  const stillOpen = useRef(true);
  const discard = () => {
    stillOpen.current = false;
    if (context.kind === 'picker') pendingPick.current = null;
    setSession({ modal: null });
  };

  const make = async () => {
    flush();
    setBusy(true);
    try {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const cx = c.getContext('2d');
      if (!cx) throw new Error('canvas');
      drawMaker(cx, doc, bmp);
      const blob = await canvasBlob(c, 'image/webp', MAKER_QUALITY[quality]);
      if (!blob) throw new Error('encode');
      const name = makerFileName(fileName);
      const r = await importFiles([new File([blob], name, { type: 'image/webp' })], {
        preserve: true,
      });
      const out = r.names[0];
      if (!out) throw new Error('import');
      n(S.makerDone, 'success');
      if (!stillOpen.current) return;
      setSession({ modal: null });
      if (context.kind === 'picker') applyPending(out);
      else if (context.kind === 'material') goPage('materials');
    } catch (e) {
      n(S.makerFailed(e instanceof Error ? e.message : String(e)), 'danger');
    } finally {
      setBusy(false);
    }
  };

  /* 製作器開著時 Mod＋Z／Y（或 Shift＋Z）只作用在製作器 */
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const t = e.target as HTMLElement;
      if (/^(INPUT|TEXTAREA)$/.test(t.tagName)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        undo();
      } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
        e.preventDefault();
        e.stopPropagation();
        redo();
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  });

  /* 畫布操作 */
  const point = (e: { clientX: number; clientY: number }) => {
    const c = canvas.current;
    if (!c) return { x: 0, y: 0 };
    const r = c.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) * c.width) / Math.max(1, r.width),
      y: ((e.clientY - r.top) * c.height) / Math.max(1, r.height),
    };
  };
  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    flush();
    const p = point(e);
    const one = sel.length === 1 ? doc.layers.find((l) => l.id === sel[0]) : undefined;
    const corner = one && !one.locked ? handleAt(bounds.current[one.id], p.x, p.y) : null;
    const hit = hitLayer(doc, bounds.current, p.x, p.y);
    const start = doc;
    if (corner && one) {
      const b = bounds.current[one.id];
      let last = start;
      const move = (ev: PointerEvent) => {
        const q = point(ev);
        const patch = resizeLayer({ layer: one, bounds: b, corner }, q.x - p.x, q.y - p.y);
        last = {
          ...start,
          layers: start.layers.map((l) =>
            l.id === one.id ? ({ ...l, ...patch } as MakerLayer) : l,
          ),
        };
        setDoc(last);
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        if (last !== start) pushHistory(last);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      return;
    }
    if (!hit) {
      if (e.shiftKey) return;
      const sx = e.clientX;
      const sy = e.clientY;
      let moved = false;
      const move = (ev: PointerEvent) => {
        if (Math.abs(ev.clientX - sx) > 3 || Math.abs(ev.clientY - sy) > 3) moved = true;
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        if (!moved) setSel([]);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      return;
    }
    let ids = sel;
    if (e.shiftKey) {
      ids = sel.includes(hit.id) ? sel.filter((x) => x !== hit.id) : [...sel, hit.id];
      setSel(ids);
      return;
    }
    if (!sel.includes(hit.id)) {
      ids = [hit.id];
      setSel(ids);
    }
    const movable = start.layers.filter((l) => ids.includes(l.id) && !l.locked);
    if (!movable.length) return;
    let last = start;
    const move = (ev: PointerEvent) => {
      const q = point(ev);
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      last = {
        ...start,
        layers: start.layers.map((l) =>
          movable.some((m) => m.id === l.id)
            ? ({ ...l, x: Math.round(l.x + dx), y: Math.round(l.y + dy) } as MakerLayer)
            : l,
        ),
      };
      setDoc(last);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (last !== start) pushHistory(last);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const align = (mode: AlignMode) => {
    const layers = doc.layers.filter((l) => sel.includes(l.id));
    const moves = alignLayers(layers, bounds.current, mode);
    change({
      ...doc,
      layers: doc.layers.map((l) => (moves[l.id] ? ({ ...l, ...moves[l.id] } as MakerLayer) : l)),
    });
  };

  const selected = sel.length === 1 ? doc.layers.find((l) => l.id === sel[0]) : undefined;
  const dis = !!selected?.locked;

  const moveLayer = (i: number, d: -1 | 1) => {
    const layers = [...doc.layers];
    const j = i + d;
    if (j < 0 || j >= layers.length) return;
    [layers[i], layers[j]] = [layers[j], layers[i]];
    change({ ...doc, layers });
  };

  return (
    <Dialog
      open
      size="xl"
      title={S.makerTitle}
      dismissOnOutside={false}
      onEscapeKeyDown={(e) => {
        e.preventDefault();
        discard();
      }}
      onOpenChange={(o) => {
        if (!o) close();
      }}
      footer={
        <>
          <span className="mr-auto text-xs text-muted" data-testid="maker-estimate">
            {S.makerEstimate(estimate ? formatKb(estimate) : '…')}
          </span>
          <Button variant="primary" loading={busy} onClick={() => void make()}>
            {busy ? S.makerBusy : S.makerGo}
          </Button>
        </>
      }
    >
      <div
        className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_340px]"
        data-testid="maker-dialog"
      >
        <div className="flex min-w-0 flex-col gap-2">
          <Row>
            <IconButton
              size="sm"
              label={S.undo}
              icon={<Undo2 />}
              disabled={hist.index <= 0}
              onClick={undo}
            />
            <IconButton
              size="sm"
              label={S.redo}
              icon={<Redo2 />}
              disabled={hist.index >= hist.list.length - 1}
              onClick={redo}
            />
            <Hint>{S.makerHint}</Hint>
          </Row>
          <div className="checker flex max-w-full items-center justify-center overflow-hidden rounded-md">
            <canvas
              ref={canvas}
              data-testid="maker-canvas"
              onPointerDown={onDown}
              className="max-h-[60dvh] max-w-full touch-none"
            />
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-3 text-sm">
          {/* biome-ignore lint/a11y/noStaticElementInteractions: 只是接住欄位的離開，記成一步復原 */}
          <section className="flex flex-col gap-2" onBlur={flush}>
            <b>{S.makerCanvas}</b>
            <Row>
              <Labeled label={S.makerWidth}>
                <NumCell
                  aria-label={`${S.makerCanvas}：${S.makerWidth}`}
                  value={doc.width}
                  onCommit={(v) =>
                    live({ ...doc, width: canvasSize(v ?? Number.NaN, MAKER_DEFAULT.width) })
                  }
                />
              </Labeled>
              <Labeled label={S.makerHeight}>
                <NumCell
                  aria-label={`${S.makerCanvas}：${S.makerHeight}`}
                  value={doc.height}
                  onCommit={(v) =>
                    live({ ...doc, height: canvasSize(v ?? Number.NaN, MAKER_DEFAULT.height) })
                  }
                />
              </Labeled>
            </Row>
            <Segmented
              size="sm"
              aria-label={S.makerBackground}
              value={doc.background}
              onValueChange={(v) => change({ ...doc, background: v as MakerDoc['background'] })}
              options={(['transparent', 'color', 'image'] as const).map((v) => ({
                value: v,
                label: S.makerBg[v],
              }))}
            />
            {doc.background === 'color' ? (
              <Labeled label={S.makerBgColor}>
                <ColorField
                  aria-label={S.makerBgColor}
                  value={doc.backgroundColor}
                  onChange={(v) => change({ ...doc, backgroundColor: v })}
                />
              </Labeled>
            ) : null}
            {doc.background === 'image' ? (
              <Labeled label={S.makerBgImage}>
                <ImageField
                  aria-label={S.makerBgImage}
                  value={doc.backgroundImage || null}
                  onChange={(v) => change({ ...doc, backgroundImage: v ?? '' })}
                />
              </Labeled>
            ) : null}
          </section>
          <section className="flex flex-col gap-2">
            <b>{S.makerAdd}</b>
            <Row>
              {(['text', 'image', 'rect', 'circle', 'triangle'] as const).map((t) => (
                <Button
                  key={t}
                  size="sm"
                  onClick={() => {
                    if (t !== 'image') return add(t);
                    setSession({
                      picker: {
                        current: null,
                        empty: S.imgEmpty,
                        role: null,
                        apply: (name) => {
                          if (!name) return;
                          const m = materials.find((x) => x.name === name);
                          add('image', { name, width: m?.width || 240, height: m?.height || 180 });
                        },
                      },
                    });
                  }}
                >
                  {LAYER_LABELS[t]}
                </Button>
              ))}
            </Row>
          </section>
          {sel.length > 1 ? (
            <section className="flex flex-col gap-2" data-testid="maker-align">
              <b>{S.makerMulti(sel.length)}</b>
              <Row>
                {(Object.keys(S.makerAlign) as AlignMode[]).map((k) => (
                  <Button
                    key={k}
                    size="sm"
                    disabled={k.startsWith('distribute') && sel.length < 3}
                    onClick={() => align(k)}
                  >
                    {S.makerAlign[k]}
                  </Button>
                ))}
              </Row>
            </section>
          ) : null}
          {/* biome-ignore lint/a11y/noStaticElementInteractions: 只是接住欄位的離開，記成一步復原 */}
          <section className="flex flex-col gap-2" onBlur={flush}>
            {!selected ? (
              <Hint>{S.makerNoLayer}</Hint>
            ) : (
              <LayerFields
                layer={selected}
                disabled={dis}
                patch={(p, rec) => patchLayer(selected.id, p, rec)}
                materials={materials}
              />
            )}
          </section>
          <section className="flex flex-col gap-1">
            <b>{S.makerLayers}</b>
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0" data-testid="maker-layers">
              {doc.layers.map((l, i) => (
                <li
                  key={l.id}
                  className={cn(
                    'flex items-center gap-1 rounded-sm px-1',
                    sel.includes(l.id) && 'bg-accent-soft',
                    !l.visible && 'opacity-60',
                  )}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left"
                    onClick={(e) =>
                      setSel(
                        e.shiftKey
                          ? sel.includes(l.id)
                            ? sel.filter((x) => x !== l.id)
                            : [...sel, l.id]
                          : [l.id],
                      )
                    }
                  >
                    {l.name}
                  </button>
                  <IconButton
                    size="sm"
                    variant="ghost"
                    label={S.makerVisible}
                    icon={l.visible ? <Eye /> : <EyeOff />}
                    onClick={() => patchLayer(l.id, { visible: !l.visible }, true)}
                  />
                  <IconButton
                    size="sm"
                    variant="ghost"
                    label={S.makerLock}
                    icon={l.locked ? <Lock /> : <Unlock />}
                    onClick={() => patchLayer(l.id, { locked: !l.locked }, true)}
                  />
                  <IconButton
                    size="sm"
                    variant="ghost"
                    label={S.makerUp}
                    icon={<ArrowUp />}
                    disabled={!i}
                    onClick={() => moveLayer(i, -1)}
                  />
                  <IconButton
                    size="sm"
                    variant="ghost"
                    label={S.makerDown}
                    icon={<ArrowDown />}
                    disabled={i === doc.layers.length - 1}
                    onClick={() => moveLayer(i, 1)}
                  />
                  <IconButton
                    size="sm"
                    variant="ghost"
                    label={S.makerDuplicate}
                    icon={<Copy />}
                    onClick={() => {
                      const c = {
                        ...l,
                        id: `${l.id}c${Date.now().toString(36)}`,
                        name: `${l.name}${S.makerCopySuffix}`,
                        x: l.x + 16,
                        y: l.y + 16,
                      } as MakerLayer;
                      const layers = [...doc.layers];
                      layers.splice(i, 0, c);
                      change({ ...doc, layers });
                      setSel([c.id]);
                    }}
                  />
                  <IconButton
                    size="sm"
                    variant="ghost"
                    label={S.makerDelete}
                    icon={<Trash2 />}
                    onClick={async () => {
                      if (!(await confirm({ title: S.makerDeleteConfirm, danger: true }))) return;
                      const layers = doc.layers.filter((x) => x.id !== l.id);
                      change({ ...doc, layers });
                      setSel(layers[0] ? [layers[0].id] : []);
                    }}
                  />
                </li>
              ))}
            </ul>
          </section>
          <section className="flex flex-col gap-2">
            <Labeled label={S.makerFile}>
              <TextInput
                aria-label={S.makerFile}
                placeholder={S.makerFilePlaceholder}
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
              />
            </Labeled>
            <Labeled label={S.makerQuality}>
              <Segmented
                size="sm"
                value={quality}
                onValueChange={(v) => setQuality(v as MakerQuality)}
                options={(['high', 'standard', 'light'] as const).map((v) => ({
                  value: v,
                  label: S.makerQualities[v],
                }))}
              />
            </Labeled>
          </section>
        </div>
      </div>
    </Dialog>
  );
}

function LayerFields({
  layer: l,
  disabled,
  patch,
  materials,
}: {
  layer: MakerLayer;
  disabled: boolean;
  patch: (p: Partial<MakerLayer>, record?: boolean) => void;
  materials: { name: string; width: number; height: number }[];
}) {
  /** 數字欄：送出時夾在欄位的範圍內（例如不透明度 0～100，F111）；聚焦到離開記成一步（F115） */
  const num = (
    label: string,
    key: string,
    value: number,
    extra: { min?: number; max?: number; step?: number } = {},
  ) => (
    <Labeled key={key} label={label}>
      <NumCell
        aria-label={`${label}：${l.name}`}
        value={value}
        disabled={disabled}
        {...extra}
        className="w-16"
        onCommit={(v) =>
          v != null &&
          patch({
            [key]: Math.min(extra.max ?? Infinity, Math.max(extra.min ?? -Infinity, v)),
          } as Partial<MakerLayer>)
        }
      />
    </Labeled>
  );
  return (
    <div className="flex flex-col gap-2" data-testid="maker-fields">
      {l.type === 'text' ? (
        <>
          <Labeled label={S.makerText}>
            <TextArea
              aria-label={S.makerText}
              rows={3}
              value={l.text}
              disabled={disabled}
              onChange={(e) => patch({ text: e.target.value })}
            />
          </Labeled>
          <Row>
            <Labeled label={S.makerFont}>
              <Select
                aria-label={S.makerFont}
                disabled={disabled}
                value={l.font}
                onValueChange={(v) => patch({ font: v as MakerFontId }, true)}
                options={MAKER_FONTS.map((f) => ({ value: f.id, label: f.label }))}
              />
            </Labeled>
            {num(S.makerSize, 'fontSize', l.fontSize, { min: 1 })}
            <Labeled label={S.makerColor}>
              <ColorField
                value={l.color}
                disabled={disabled}
                onChange={(v) => patch({ color: v }, true)}
              />
            </Labeled>
          </Row>
          <Row>
            <Labeled label={S.makerWeight}>
              <Segmented
                size="sm"
                value={String(l.weight)}
                onValueChange={(v) => patch({ weight: Number(v) as 400 | 700 }, true)}
                options={[
                  { value: '400', label: S.makerWeights[400], disabled },
                  { value: '700', label: S.makerWeights[700], disabled },
                ]}
              />
            </Labeled>
            <Labeled label={S.makerAlignText}>
              <Segmented
                size="sm"
                value={l.align}
                onValueChange={(v) => patch({ align: v as 'left' | 'center' | 'right' }, true)}
                options={(['left', 'center', 'right'] as const).map((v) => ({
                  value: v,
                  label: S.makerAligns[v],
                  disabled,
                }))}
              />
            </Labeled>
          </Row>
          <Row>
            {num(S.makerLineHeight, 'lineHeight', l.lineHeight, { min: 0.5, max: 3, step: 0.05 })}
            {num(S.makerSpacing, 'letterSpacing', l.letterSpacing)}
          </Row>
          <Row>
            <Toggle
              checked={l.stroke}
              disabled={disabled}
              onCheckedChange={(v) => patch({ stroke: v }, true)}
              aria-label={S.makerStroke}
              label={S.makerStroke}
            />
            <Labeled label={S.makerStrokeColor}>
              <ColorField
                value={l.strokeColor}
                disabled={disabled}
                onChange={(v) => patch({ strokeColor: v }, true)}
              />
            </Labeled>
            {num(S.makerStrokeWidth, 'strokeWidth', l.strokeWidth, { min: 0, max: 30 })}
          </Row>
        </>
      ) : l.type === 'image' ? (
        <>
          <Row>
            <Labeled label={S.makerImage}>
              <ImageField
                aria-label={S.makerImage}
                value={l.imageName || null}
                disabled={disabled}
                onChange={(v) => {
                  const m = materials.find((x) => x.name === v);
                  patch(
                    {
                      imageName: v ?? '',
                      width: m?.width || l.width,
                      height: m?.height || l.height,
                      naturalWidth: m?.width || l.naturalWidth,
                      naturalHeight: m?.height || l.naturalHeight,
                    },
                    true,
                  );
                }}
              />
            </Labeled>
            <Checkbox
              checked={l.lockAspect}
              disabled={disabled}
              onCheckedChange={(v) => patch({ lockAspect: !!v }, true)}
              aria-label={S.makerLockAspect}
              label={S.makerLockAspect}
            />
            <Button
              size="sm"
              disabled={disabled}
              onClick={() =>
                patch(
                  { height: Math.round((l.width * l.naturalHeight) / Math.max(1, l.naturalWidth)) },
                  true,
                )
              }
            >
              {S.makerResetAspect}
            </Button>
          </Row>
          <Row>
            <Labeled label={S.makerWidth}>
              <NumCell
                aria-label={`${S.makerWidth}：${l.name}`}
                value={l.width}
                disabled={disabled}
                className="w-16"
                onCommit={(v) =>
                  v != null &&
                  patch(
                    l.lockAspect
                      ? { width: v, height: Math.round((v * l.height) / Math.max(1, l.width)) }
                      : { width: v },
                  )
                }
              />
            </Labeled>
            <Labeled label={S.makerHeight}>
              <NumCell
                aria-label={`${S.makerHeight}：${l.name}`}
                value={l.height}
                disabled={disabled}
                className="w-16"
                onCommit={(v) =>
                  v != null &&
                  patch(
                    l.lockAspect
                      ? { height: v, width: Math.round((v * l.width) / Math.max(1, l.height)) }
                      : { height: v },
                  )
                }
              />
            </Labeled>
          </Row>
        </>
      ) : (
        <Row>
          <Labeled label={S.makerColor}>
            <ColorField
              value={l.color}
              disabled={disabled}
              onChange={(v) => patch({ color: v }, true)}
            />
          </Labeled>
          {num(S.makerWidth, 'width', l.width, { min: 1 })}
          {num(S.makerHeight, 'height', l.height, { min: 1 })}
        </Row>
      )}
      <Row>
        {num('X', 'x', l.x)}
        {num('Y', 'y', l.y)}
        {num(S.makerOpacity, 'opacity', l.opacity, { min: 0, max: 100 })}
      </Row>
    </div>
  );
}
