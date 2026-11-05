/**
 * SF 證件的自組底版（規格 F96～F100；原作的 CONSTRUCTOR）：
 * - 設定欄（「樣式」分頁最上面）：新的自組底版（借目前的範本的外形）、名稱、外形、複製、刪除；在預覽上編輯版面；
 *   加項目（文字、條碼、晶片、帶子、線、警示斜紋、斜線）、項目清單（最上層在前；上一層、下一層、刪除）、選取的項目的設定；
 * - 預覽上的版面編輯層（共用的 LayoutEditor）：每個項目一個虛線框；拖曳移動、拉四個角縮放（吸附 10 原生像素，按著 Alt 不吸附、
 *   Shift 維持比例；晶片一定是正方形）、方向鍵微調（Shift 10）、Delete 刪除、Esc 取消選取。
 */
import { ArrowDown, ArrowUp, Copy, LayoutTemplate, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { Box } from '@/core/layout';
import {
  Button,
  Field,
  IconButton,
  NumberInput,
  Section,
  Segmented,
  Select,
  TextInput,
  Toggle,
  useConfirm,
  useToast,
} from '@/ui';
import { LayoutEditor, type LayoutItem } from '@/ui/LayoutEditor';
import {
  CUSTOM_ADDABLE,
  CUSTOM_CAP_MAX,
  CUSTOM_GRID,
  CUSTOM_ITEM_MAX,
  CUSTOM_MAX,
  CUSTOM_MIN,
  CUSTOM_NAME_MAX,
  type CustomAlign,
  type CustomColor,
  type CustomItem,
  type CustomKind,
  customFieldLabel,
} from './sf/custom';
import { SF_BLANK_IDS, type SfBlankId, sfBlank } from './sf/defs';
import { activeCustom } from './sf/model';
import {
  addCustomBlank,
  addCustomItem,
  type customNow,
  deleteCustom,
  duplicateCustom,
  gesture,
  moveCustomItem,
  patchCustomItem,
  removeCustomItem,
  renameCustom,
  setCustomBase,
  useDoc,
  useUi,
} from './store';
import { S } from './strings';

/** 項目的名稱（清單、無障礙名稱） */
const itemName = (def: ReturnType<typeof customNow>, it: CustomItem): string =>
  it.type === 'text' && def
    ? `${S.ctorTypes.text}：${customFieldLabel(def, it)}`
    : S.ctorTypes[it.type];

/* ======================================================================
 * 設定欄
 * ==================================================================== */

export function SfCtorSection() {
  const sf = useDoc((s) => s.data.sf);
  const def = activeCustom(sf);
  const editing = useUi((u) => u.ctor);
  const sel = useUi((u) => u.ctorItem);
  const confirm = useConfirm();
  const toast = useToast();
  const it = def?.items.find((x) => x.id === sel) ?? null;
  const full = sf.customs.length >= CUSTOM_MAX;
  const create = () => {
    const name = addCustomBlank();
    if (name) toast({ title: S.ctorCreated(name), tone: 'success', replace: true });
    else toast({ title: S.ctorFull(CUSTOM_MAX), tone: 'warning', replace: true });
  };
  return (
    <Section title={S.sectionCtor} persistKey="id-ticket:sf-ctor" description={S.ctorHint}>
      <div className="flex min-w-0 flex-col gap-3" data-testid="sf-ctor">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={<Plus />} disabled={full} onClick={create}>
            {S.ctorNew}
          </Button>
          {def ? (
            <>
              <Button
                size="sm"
                icon={<Copy />}
                disabled={full}
                onClick={() => {
                  const name = duplicateCustom();
                  if (name) toast({ title: S.ctorCreated(name), tone: 'success', replace: true });
                }}
              >
                {S.ctorDuplicate}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<Trash2 />}
                onClick={async () => {
                  const ok = await confirm({
                    title: S.ctorDeleteTitle(def.name),
                    description: S.ctorDeleteDesc,
                    confirmLabel: S.ctorDelete,
                    danger: true,
                  });
                  if (ok) deleteCustom();
                }}
              >
                {S.ctorDelete}
              </Button>
            </>
          ) : null}
        </div>
        {!def ? (
          <p className="m-0 text-xs text-muted">{S.ctorIntro}</p>
        ) : (
          <>
            <div className="grid min-w-0 grid-cols-2 gap-2">
              <Field label={S.ctorName}>
                <TextInput
                  value={def.name}
                  maxLength={CUSTOM_NAME_MAX * 2}
                  data-testid="ctor-name"
                  onFocus={gesture.begin}
                  onBlur={gesture.commit}
                  onChange={(e) => renameCustom(e.target.value)}
                />
              </Field>
              <Field label={S.ctorBase} hint={S.ctorBaseHint}>
                <Select<SfBlankId>
                  value={def.base}
                  onValueChange={setCustomBase}
                  options={SF_BLANK_IDS.map((b) => ({ value: b, label: sfBlank(b).name }))}
                  aria-label={S.ctorBase}
                />
              </Field>
            </div>
            <Toggle
              label={S.ctorEdit}
              checked={editing}
              onCheckedChange={(v) => useUi.setState({ ctor: v, element: null })}
              data-testid="ctor-edit"
            />
            <Field label={S.ctorAdd}>
              <div className="flex min-w-0 flex-wrap gap-1.5">
                {CUSTOM_ADDABLE.map((t) => (
                  <Button
                    key={t}
                    size="sm"
                    variant="ghost"
                    icon={<Plus />}
                    onClick={() => {
                      if (!addCustomItem(t)) {
                        toast({
                          title: S.ctorItemsFull(CUSTOM_ITEM_MAX),
                          tone: 'warning',
                          replace: true,
                        });
                        return;
                      }
                      useUi.setState({ ctor: true });
                    }}
                  >
                    {S.ctorTypes[t]}
                  </Button>
                ))}
              </div>
            </Field>
            <ItemList />
            {it ? <ItemEditor it={it} /> : <p className="m-0 text-xs text-muted">{S.ctorNoItem}</p>}
          </>
        )}
      </div>
    </Section>
  );
}

/** 項目清單（最上層在前） */
function ItemList() {
  const def = useDoc((s) => activeCustom(s.data.sf));
  const sel = useUi((u) => u.ctorItem);
  if (!def) return null;
  const items = def.items;
  return (
    <ul
      className="m-0 flex min-w-0 list-none flex-col gap-1 p-0"
      aria-label={S.ctorItems}
      data-testid="ctor-items"
    >
      {[...items].reverse().map((it) => {
        const i = items.indexOf(it);
        const on = it.id === sel;
        return (
          <li
            key={it.id}
            className={`flex min-h-10 min-w-0 items-center gap-1 rounded-md border px-1 ${on ? 'border-accent' : 'border-border'}`}
            data-ctor-item={it.id}
          >
            <button
              type="button"
              className="focus-visible:focus-ring min-w-0 flex-1 cursor-pointer truncate rounded-sm border-0 bg-transparent px-1 py-1.5 text-left text-sm text-fg"
              aria-pressed={on}
              onClick={() => useUi.setState({ ctorItem: it.id, ctor: true })}
            >
              {itemName(def, it)}
            </button>
            <IconButton
              size="sm"
              label={S.ctorForward(itemName(def, it))}
              icon={<ArrowUp />}
              disabled={i === items.length - 1}
              onClick={() => moveCustomItem(it.id, 1)}
            />
            <IconButton
              size="sm"
              label={S.ctorBackward(itemName(def, it))}
              icon={<ArrowDown />}
              disabled={i === 0}
              onClick={() => moveCustomItem(it.id, -1)}
            />
            <IconButton
              size="sm"
              label={S.ctorRemove(itemName(def, it))}
              icon={<Trash2 />}
              disabled={it.type === 'photo'}
              onClick={() => removeCustomItem(it.id)}
            />
          </li>
        );
      })}
    </ul>
  );
}

/** 選取的項目：X／Y／W／H、顏色；文字的標題、種類、粗細、對齊；帶子的形狀；斜紋的方向 */
function ItemEditor({ it }: { it: CustomItem }) {
  const def = useDoc((s) => activeCustom(s.data.sf));
  if (!def) return null;
  const B = sfBlank(def.base);
  const patch = (p: Partial<CustomItem>) => patchCustomItem(it.id, p);
  const num = (key: 'x' | 'y' | 'w' | 'h', max: number) => (
    <Field label={S.ctorBox[key]}>
      <NumberInput
        value={it[key]}
        min={key === 'x' || key === 'y' ? 0 : it.type === 'rule' ? 2 : CUSTOM_MIN}
        max={max}
        step={1}
        unit="px"
        onChange={gesture.live((v: number) => patch({ [key]: v }))}
        onCommit={gesture.commit}
      />
    </Field>
  );
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="ctor-item">
      <p className="m-0 text-sm font-semibold text-fg">{itemName(def, it)}</p>
      <div className="grid min-w-0 grid-cols-4 gap-2">
        {num('x', B.w)}
        {num('y', B.h)}
        {num('w', B.w)}
        {num('h', B.h)}
      </div>
      {it.type === 'text' ||
      it.type === 'band' ||
      it.type === 'rule' ||
      it.type === 'stripes' ||
      it.type === 'slashes' ? (
        <Field label={S.ctorColor}>
          <Segmented<CustomColor>
            value={it.color}
            onValueChange={(v) => patch({ color: v })}
            options={(['ink', 'accent', 'card'] as const).map((c) => ({
              value: c,
              label: S.ctorColors[c],
            }))}
            fullWidth
          />
        </Field>
      ) : null}
      {it.type === 'text' ? (
        <>
          <Field label={S.ctorCap} hint={S.ctorCapHint}>
            <TextInput
              value={it.cap}
              maxLength={CUSTOM_CAP_MAX * 2}
              data-testid="ctor-cap"
              onFocus={gesture.begin}
              onBlur={gesture.commit}
              onChange={(e) => patch({ cap: e.target.value.replace(/[\r\n]+/g, ' ') })}
            />
          </Field>
          <Field label={S.ctorKind} hint={S.ctorKindHint}>
            <Segmented<CustomKind>
              value={it.kind}
              onValueChange={(v) => patch({ kind: v })}
              options={(['text', 'serial', 'date'] as const).map((k) => ({
                value: k,
                label: S.ctorKinds[k],
              }))}
              fullWidth
            />
          </Field>
          <div className="grid min-w-0 grid-cols-2 gap-2">
            <Field label={S.ctorWeight}>
              <Segmented<string>
                value={String(it.weight)}
                onValueChange={(v) => patch({ weight: v === '400' ? 400 : 700 })}
                options={[
                  { value: '700', label: S.ctorWeights.bold },
                  { value: '400', label: S.ctorWeights.regular },
                ]}
                fullWidth
              />
            </Field>
            <Field label={S.ctorAlign}>
              <Segmented<CustomAlign>
                value={it.align}
                onValueChange={(v) => patch({ align: v })}
                options={(['left', 'center', 'right'] as const).map((a) => ({
                  value: a,
                  label: S.ctorAligns[a],
                }))}
                fullWidth
              />
            </Field>
          </div>
        </>
      ) : null}
      {it.type === 'band' ? (
        <Field label={S.ctorShape}>
          <Segmented<'notch' | 'rect'>
            value={it.shape}
            onValueChange={(v) => patch({ shape: v })}
            options={[
              { value: 'notch', label: S.ctorShapes.notch },
              { value: 'rect', label: S.ctorShapes.rect },
            ]}
            fullWidth
          />
        </Field>
      ) : null}
      {it.type === 'stripes' ? (
        <Toggle label={S.ctorFlip} checked={it.flip} onCheckedChange={(v) => patch({ flip: v })} />
      ) : null}
    </div>
  );
}

/* ======================================================================
 * 預覽上的版面編輯層
 * ==================================================================== */

/** 按鍵的狀態（拖曳時 Alt 不吸附、Shift 維持比例；LayoutEditor 的 onChange 沒有帶按鍵） */
const mods = { alt: false, shift: false };

export function CustomLayer({
  ox,
  oy,
  width,
  height,
}: {
  ox: number;
  oy: number;
  width: number;
  height: number;
}) {
  const def = useDoc((s) => activeCustom(s.data.sf));
  const sel = useUi((u) => u.ctorItem);
  const start = useRef<CustomItem | null>(null);
  /* 真的動了才開始記復原（單純點一下選取不吸附、不多一步，2026-11-05 驗證後） */
  const moved = useRef(false);
  useEffect(() => {
    const track = (e: KeyboardEvent | PointerEvent) => {
      mods.alt = e.altKey;
      mods.shift = e.shiftKey;
    };
    window.addEventListener('pointermove', track, true);
    window.addEventListener('pointerdown', track, true);
    window.addEventListener('keydown', track, true);
    window.addEventListener('keyup', track, true);
    return () => {
      window.removeEventListener('pointermove', track, true);
      window.removeEventListener('pointerdown', track, true);
      window.removeEventListener('keydown', track, true);
      window.removeEventListener('keyup', track, true);
    };
  }, []);
  if (!def) return null;
  const B = sfBlank(def.base);
  /* 選取的那個放最後（在最上面，被別的項目蓋住也拖得到） */
  const ordered = [
    ...def.items.filter((x) => x.id !== sel),
    ...def.items.filter((x) => x.id === sel),
  ];
  const items: LayoutItem[] = ordered.map((it) => ({
    id: it.id,
    label: itemName(def, it),
    box: { x: it.x + ox, y: it.y + oy, width: it.w, height: it.h },
    resizable: true,
    handles: ['nw', 'ne', 'sw', 'se'] as const,
  }));
  const onChange = (id: string, box: Box, ch: { phase: string; op: 'move' | 'resize' }) => {
    const it = def.items.find((x) => x.id === id);
    if (!it) return;
    if (ch.phase === 'start') {
      start.current = { ...it };
      moved.current = false;
      return;
    }
    const b = { x: box.x - ox, y: box.y - oy, w: box.width, h: box.height };
    if (ch.phase === 'nudge') {
      patchCustomItem(id, { x: Math.round(b.x), y: Math.round(b.y) });
      return;
    }
    const st = start.current ?? it;
    const same =
      Math.abs(b.x - st.x) < 1e-6 &&
      Math.abs(b.y - st.y) < 1e-6 &&
      Math.abs(b.w - st.w) < 1e-6 &&
      Math.abs(b.h - st.h) < 1e-6;
    if (same && !moved.current) {
      if (ch.phase === 'end') start.current = null;
      return;
    }
    if (!moved.current) {
      moved.current = true;
      gesture.begin();
    }
    const snap = (v: number) => (mods.alt ? v : Math.round(v / CUSTOM_GRID) * CUSTOM_GRID);
    if (ch.op === 'move') {
      patchCustomItem(id, {
        x: Math.min(B.w - st.w, Math.max(0, snap(b.x))),
        y: Math.min(B.h - st.h, Math.max(0, snap(b.y))),
      });
    } else {
      const min = it.type === 'rule' ? 2 : CUSTOM_MIN;
      const west = Math.abs(b.x - st.x) > 1e-6 && Math.abs(b.x + b.w - (st.x + st.w)) < 1e-6;
      const north = Math.abs(b.y - st.y) > 1e-6 && Math.abs(b.y + b.h - (st.y + st.h)) < 1e-6;
      const ax = west ? st.x + st.w : st.x;
      const ay = north ? st.y + st.h : st.y;
      const ex = Math.min(B.w, Math.max(0, snap(west ? b.x : b.x + b.w)));
      const ey = Math.min(B.h, Math.max(0, snap(north ? b.y : b.y + b.h)));
      let w = Math.max(min, west ? ax - ex : ex - ax);
      let h = Math.max(min, north ? ay - ey : ey - ay);
      if (mods.shift || it.type === 'chip') {
        const q = Math.max(w / st.w, h / st.h);
        w = Math.max(min, st.w * q);
        h = Math.max(min, st.h * q);
      }
      patchCustomItem(id, { w, h, x: west ? ax - w : ax, y: north ? ay - h : ay });
    }
    if (ch.phase === 'end') {
      start.current = null;
      moved.current = false;
      gesture.commit();
    }
  };
  return (
    <div className="absolute inset-0" data-testid="ctor-layer">
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
        viewBox={`0 0 ${width} ${height}`}
      >
        {def.items
          .filter((x) => x.id !== sel)
          .map((x) => (
            <rect
              key={x.id}
              x={x.x + ox}
              y={x.y + oy}
              width={x.w}
              height={x.h}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={3}
              strokeDasharray="10 8"
              opacity={0.7}
            />
          ))}
      </svg>
      <LayoutEditor
        width={width}
        height={height}
        items={items}
        selectedId={sel}
        onSelect={(id) => useUi.setState({ ctorItem: id })}
        onChange={onChange}
        onDelete={removeCustomItem}
        onEscape={() => useUi.setState({ ctorItem: null })}
        nudgeStep={1}
        nudgeShiftStep={CUSTOM_GRID}
        hitPadding={4}
        aria-label={S.ctorLayer}
      />
    </div>
  );
}

/** 「樣式」分頁的入口：版面編輯的提示（沒有自組底版時不顯示） */
export function CtorHint() {
  const on = useUi((u) => u.ctor);
  const has = useDoc((s) => !!s.data.sf.custom);
  if (!on || !has) return null;
  return (
    <p className="m-0 flex items-center gap-1 px-1 text-xs text-muted">
      <LayoutTemplate aria-hidden className="size-3.5" />
      {S.ctorPreviewHint}
    </p>
  );
}
