/**
 * 配色卡（規格 1.2）：設定欄（每一張照片的來源——清單裡的角色或只放在卡上的照片、色票的來源、代表色；
 * 標題、照片比例、自動取幾色、色名、混色帶、GIF 畫質）與預覽欄（卡片；照片上拖曳移動、滾輪或兩指縮放；
 * 空的照片框點一下選照片；存成 PNG、GIF，複製 HEX）。
 */
import { Clipboard, Download, Film, ImagePlus, Plus, Trash2 } from 'lucide-react';
import { type PointerEvent, useEffect, useMemo, useRef, useState, type WheelEvent } from 'react';
import { addImageFile, loadAssetBitmaps, useAssetBitmaps } from '@/core/assets';
import { copyText, downloadBlob, fileNameWithExt, pickFiles } from '@/core/files';
import {
  clampPlacement,
  type FramePlacement,
  kmeansPalette,
  type PaletteColor,
  placedCrop,
  regionPixels,
} from '@/core/image';
import {
  Button,
  cn,
  createPointerGesture,
  Field,
  IconButton,
  Notice,
  ProgressBar,
  Section,
  Segmented,
  Select,
  Stage,
  TextInput,
  Toggle,
  useStageScale,
  useToast,
} from '@/ui';
import {
  cardCopyText,
  cardFileBase,
  cardNames,
  columnColorsMode,
  hexOf,
  layoutCard,
  photoPatch,
  type ResolvedColumn,
  ratioValue,
  resolveColumn,
} from './card';
import {
  type CardPaint,
  drawCard,
  drawCardPhoto,
  renderCardGif,
  renderCardPng,
} from './cardRender';
import { startJob } from './flow';
import { type Bar, type CardColumn, type CardRatio, type CardSettings, LIMITS } from './logic';
import { actions, assets, cardOf, gesture, settingsNow, useSettings } from './store';
import { S } from './strings';

type Status = { tone: 'success' | 'warning' | 'danger' | 'info'; text: string } | null;

const nameOf = (bar: Bar, i: number) => (bar.name ?? '').trim() || S.characterN(i + 1);

const columnImage = (col: CardColumn, bars: readonly Bar[]) =>
  col.source === 'photo' ? col.image : (bars.find((b) => b.id === col.characterId)?.image ?? null);

const CENTERED: FramePlacement = { zoom: 1, x: 0, y: 0, turns: 0 };

/** 照片露出來的範圍（原圖座標）：框的比例＝欄寬 ÷ 照片高 */
const visibleRect = (
  img: { width: number; height: number },
  ratio: CardRatio,
  p: FramePlacement,
) => {
  /* 照片比例換過之後，舊的位置可能露出照片框：夾回蓋滿的範圍（和畫的時候相同） */
  const box = { width: 1, height: ratioValue(ratio) };
  const r = placedCrop(img, box, clampPlacement(img, box, p, LIMITS.cardZoom));
  return { x: r.x, y: r.y, width: r.width, height: r.height };
};

/** 選一張照片放進這一欄（照片欄的「選擇照片」、預覽上空的照片框） */
async function choosePhotoFor(col: CardColumn, toast: ReturnType<typeof useToast>): Promise<void> {
  const [f] = await pickFiles({ accept: 'image/*' });
  if (!f) return;
  try {
    const { ref, persisted } = await addImageFile(assets, f, { maxSide: LIMITS.imageSide });
    if (!persisted) toast({ title: S.imageNotSaved, tone: 'warning' });
    actions.patchColumn(
      col.id,
      photoPatch(col, { id: ref.id, width: ref.width, height: ref.height }, f.name),
    );
  } catch {
    toast({ title: S.decodeError(f.name), tone: 'danger' });
  }
}

/**
 * 每一欄自動取的顏色（k-means）：照片或位置變了之後才重算（拖曳中不算，放開後 150 ms 再算）。
 */
function useAutoColors(
  card: CardSettings,
  bars: readonly Bar[],
  bitmaps: ReadonlyMap<string, ImageBitmap>,
  dragging: boolean,
): Map<string, PaletteColor[]> {
  const [out, setOut] = useState<Map<string, PaletteColor[]>>(() => new Map());
  const first = useRef(true);
  const key = card.columns
    .map((c) => {
      const img = columnImage(c, bars);
      const mode = columnColorsMode(c, bars.find((b) => b.id === c.characterId) ?? null);
      return `${c.id}:${img?.id ?? ''}:${bitmaps.has(img?.id ?? '') ? 1 : 0}:${mode}:${c.placement.zoom},${c.placement.x},${c.placement.y},${c.placement.turns}`;
    })
    .join('|');
  // biome-ignore lint/correctness/useExhaustiveDependencies: key 已經包含用到的內容
  useEffect(() => {
    if (dragging) return;
    const run = () => {
      const m = new Map<string, PaletteColor[]>();
      for (const c of card.columns) {
        const img = columnImage(c, bars);
        const bmp = img ? bitmaps.get(img.id) : undefined;
        if (!img || !bmp) continue;
        const px = regionPixels(bmp, img, visibleRect(img, card.ratio, c.placement), 150);
        m.set(c.id, kmeansPalette(px, card.count));
      }
      setOut(m);
    };
    if (first.current) {
      first.current = false;
      run();
      return;
    }
    const t = setTimeout(run, 150);
    return () => clearTimeout(t);
  }, [key, card.count, card.ratio, dragging]);
  return out;
}

/** 預覽要用的全部內容（解析過的每一欄、版面、色名） */
export function useCardPaint(dragging = false): CardPaint & { ready: boolean } {
  const bars = useSettings((s) => s.data.bars);
  const card = useSettings((s) => cardOf(s.data));
  const ids = card.columns.map((c) => columnImage(c, bars)?.id).filter((x): x is string => !!x);
  const { bitmaps, pending, missing } = useAssetBitmaps(assets, ids);
  const auto = useAutoColors(card, bars, bitmaps, dragging);
  const missingKey = missing.join(',');
  // biome-ignore lint/correctness/useExhaustiveDependencies: missingKey 就是 missing 的內容
  const resolved = useMemo(
    () =>
      card.columns.map((c) => {
        const img = columnImage(c, bars);
        return resolveColumn(c, bars, auto.get(c.id) ?? null, !!img && missing.includes(img.id));
      }),
    [card.columns, bars, auto, missingKey],
  );
  const layout = useMemo(() => layoutCard(card, resolved), [card, resolved]);
  const names = useMemo(() => cardNames(resolved, layout.blend), [resolved, layout.blend]);
  /* 同一份內容時回傳同一個物件：頁面其他地方重畫時預覽不必整張重畫（拖曳中只重畫那一張照片） */
  const ready = !pending;
  return useMemo(
    () => ({ card, columns: card.columns, layout, resolved, names, bitmaps, ready }),
    [card, layout, resolved, names, bitmaps, ready],
  );
}

/* ---------- 設定欄 ---------- */

function ColumnCard({
  col,
  index,
  r,
  names,
  count,
}: {
  col: CardColumn;
  index: number;
  r: ResolvedColumn | undefined;
  names: readonly string[];
  count: number;
}) {
  const bars = useSettings((s) => s.data.bars);
  const toast = useToast();
  const bar =
    col.source === 'character' ? (bars.find((b) => b.id === col.characterId) ?? null) : null;
  const mode = columnColorsMode(col, bar);
  const keyHex = r?.key ? hexOf(r.key) : null;
  return (
    <section
      aria-label={S.cardColumnN(index + 1)}
      className="flex min-w-0 flex-col gap-2 rounded-md border border-border bg-surface-2 p-2.5"
      data-column={index}
    >
      <div className="flex items-center gap-2">
        <h4 className="m-0 flex-1 text-sm font-semibold text-fg">{S.cardColumnN(index + 1)}</h4>
        {count > 1 ? (
          <IconButton
            label={S.cardRemoveColumn(index + 1)}
            icon={<Trash2 />}
            size="sm"
            onClick={() => actions.removeColumn(col.id)}
          />
        ) : null}
      </div>
      <Segmented<'character' | 'photo'>
        aria-label={`${S.cardColumnN(index + 1)}${S.cardSource}`}
        size="sm"
        value={col.source}
        onValueChange={(source) => actions.patchColumn(col.id, { source, key: null })}
        options={[
          { value: 'character', label: S.cardSourceCharacter },
          { value: 'photo', label: S.cardSourcePhoto },
        ]}
      />
      {col.source === 'character' ? (
        <Select<string>
          aria-label={`${S.cardColumnN(index + 1)}${S.cardPickCharacter}`}
          value={col.characterId ?? ''}
          placeholder={bars.length ? S.cardPickCharacter : S.cardNoCharacter}
          disabled={!bars.length}
          onValueChange={(id) =>
            actions.patchColumn(col.id, { characterId: id, placement: CENTERED })
          }
          options={bars.map((b, i) => ({ value: b.id, label: nameOf(b, i) }))}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" icon={<ImagePlus />} onClick={() => void choosePhotoFor(col, toast)}>
            {S.cardPhotoChoose}
          </Button>
          <TextInput
            aria-label={`${S.cardColumnN(index + 1)}${S.cardPhotoName}`}
            value={col.name}
            maxLength={LIMITS.cardName}
            placeholder={S.cardPhotoName}
            className="h-7 min-w-0 flex-1 text-xs"
            onFocus={gesture.begin}
            onBlur={gesture.commit}
            onChange={(e) => actions.patchColumn(col.id, { name: e.target.value, autoName: false })}
          />
        </div>
      )}
      {col.source === 'character' && bar ? (
        r?.imageMissing ? (
          <p className="m-0 text-xs text-warning" data-testid={`card-image-missing-${index}`}>
            {S.cardImageMissing}
          </p>
        ) : bar.image ? (
          <Segmented<'auto' | 'parts'>
            aria-label={`${S.cardColumnN(index + 1)}${S.cardColors}`}
            size="sm"
            value={mode}
            onValueChange={(colors) => actions.patchColumn(col.id, { colors })}
            options={[
              { value: 'auto', label: S.cardColorsAuto },
              { value: 'parts', label: S.cardColorsParts },
            ]}
          />
        ) : (
          <p className="m-0 text-xs text-muted">{S.cardColorsPartsOnly}</p>
        )
      ) : null}
      {r?.swatches.length ? (
        <>
          <ul
            className="m-0 flex list-none flex-col gap-1 p-0"
            aria-label={S.cardSwatches(index + 1)}
            data-testid={`card-swatches-${index}`}
          >
            {r.swatches.map((s, j) => {
              const hex = s.color.toUpperCase();
              const isKey = r.keyIndex === j;
              const name = names[j] ?? '';
              return (
                <li key={s.color}>
                  <button
                    type="button"
                    aria-label={S.cardSwatch(name, hex, isKey)}
                    title={S.cardSwatchTitle(name, hex, s.share)}
                    aria-pressed={isKey}
                    data-hex={s.color}
                    data-share={s.share.toFixed(3)}
                    className={cn(
                      'flex h-7 w-full items-center gap-2 rounded-sm border bg-surface px-1 text-xs text-fg outline-none focus-visible:ring-2 focus-visible:ring-focus',
                      isKey ? 'border-accent ring-1 ring-accent' : 'border-border',
                    )}
                    onClick={() => {
                      if (bar) actions.patchCharacter(bar.id, { theme: s.color });
                      else actions.patchColumn(col.id, { key: s.color });
                    }}
                  >
                    <span
                      aria-hidden
                      className="flex size-5 shrink-0 items-center justify-center rounded-sm border border-black/10"
                      style={{ background: s.color }}
                    >
                      {isKey ? (
                        <span className="block size-2 rounded-full border-2 border-[#26231f] bg-white" />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-left">{name}</span>
                    <span className="font-mono tabular-nums text-muted">{hex}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {keyHex ? (
            <p
              className="m-0 flex flex-wrap items-center gap-1.5 text-xs text-muted"
              data-testid={`card-key-${index}`}
              data-key={keyHex}
              data-in-swatches={r.keyInSwatches}
            >
              <span>{S.themeColor}</span>
              <span
                aria-hidden
                className="flex size-4 items-center justify-center rounded-sm border border-black/10"
                style={{ background: keyHex }}
              >
                <span className="block size-1.5 rounded-full border border-[#26231f] bg-white" />
              </span>
              <span className="font-mono tabular-nums text-fg">{keyHex}</span>
              {r.keyInSwatches ? null : <span>{S.cardKeyNotInSwatches}</span>}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">{S.cardKeyHint}</span>
            {r.keyChosen ? (
              <Button
                size="sm"
                onClick={() => {
                  if (bar) actions.patchCharacter(bar.id, { theme: null });
                  else actions.patchColumn(col.id, { key: null });
                }}
              >
                {S.cardKeyAuto}
              </Button>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}

export function CardSettingsPanel({
  resolved,
  names,
}: {
  resolved: readonly ResolvedColumn[];
  names: CardPaint['names'];
}) {
  const card = useSettings((s) => cardOf(s.data));
  const n = card.columns.length;
  return (
    <>
      <Section
        title={
          <>
            {S.cardColumns}{' '}
            <span className="text-xs font-normal text-muted tabular-nums">{`${n}／${LIMITS.cardColumns}`}</span>
          </>
        }
        fixed
        description={S.cardPhotoHint}
        actions={
          <Button
            size="sm"
            variant="primary"
            icon={<Plus />}
            disabled={n >= LIMITS.cardColumns}
            onClick={() => actions.addColumn()}
          >
            {S.cardAddColumn}
          </Button>
        }
      >
        {card.columns.map((c, i) => (
          <ColumnCard
            key={c.id}
            col={c}
            index={i}
            r={resolved[i]}
            names={names.swatch[i] ?? []}
            count={n}
          />
        ))}
      </Section>
      <Section title={S.sectionCard} fixed>
        <Field label={S.cardTitle}>
          <TextInput
            value={card.title}
            maxLength={LIMITS.cardTitle}
            placeholder={S.cardTitlePlaceholder}
            onFocus={gesture.begin}
            onBlur={gesture.commit}
            onChange={(e) => actions.patchCard({ title: e.target.value })}
          />
        </Field>
        <Field label={S.cardRatio}>
          <Segmented<CardRatio>
            value={card.ratio}
            onValueChange={(ratio) => actions.patchCard({ ratio })}
            options={[
              { value: '1:1', label: '1:1' },
              { value: '4:5', label: '4:5' },
              { value: '3:4', label: '3:4' },
            ]}
          />
        </Field>
        <Field label={S.cardCount}>
          <Segmented<string>
            value={String(card.count)}
            onValueChange={(v) => actions.patchCard({ count: Number(v) })}
            options={LIMITS.cardCounts.map((k) => ({ value: String(k), label: String(k) }))}
          />
        </Field>
        <Field label={S.cardShowNames} layout="inline">
          <Toggle
            checked={card.showNames}
            onCheckedChange={(showNames) => actions.patchCard({ showNames })}
          />
        </Field>
        <Field label={S.cardShowMix} hint={S.cardShowMixHint} layout="inline">
          <Toggle
            checked={card.showMix}
            onCheckedChange={(showMix) => actions.patchCard({ showMix })}
          />
        </Field>
        <Field label={S.cardGif}>
          <Segmented<string>
            value={String(card.gifWidth)}
            onValueChange={(v) => actions.patchCard({ gifWidth: Number(v) })}
            options={LIMITS.gifWidths.map((w, i) => ({
              value: String(w),
              label: `${S.cardGifLabels[i]}（${w}）`,
            }))}
          />
        </Field>
      </Section>
    </>
  );
}

/* ---------- 預覽欄 ---------- */

/**
 * 照片上的拖曳、滾輪與兩指縮放（疊在 Stage 裡的 canvas 上，以卡片座標定位）。
 * 拖曳與捏合中只把那一張照片重畫在預覽上（每個畫面最多一次），放開時才寫進設定（一步復原）、再重新取色。
 * 還沒放照片的框是按鈕：點一下選照片。
 */
function PhotoAreas({
  paint,
  onDragging,
  redrawPhoto,
}: {
  paint: CardPaint;
  onDragging: (v: boolean) => void;
  redrawPhoto: (i: number, p: FramePlacement) => void;
}) {
  const scale = useStageScale() || 1;
  const toast = useToast();
  const gestureRef = useRef(createPointerGesture());
  const live = useRef<{
    col: string;
    i: number;
    start: FramePlacement;
    cur: FramePlacement;
    raf: number;
  } | null>(null);
  const bars = useSettings((s) => s.data.bars);
  const { layout: L, columns, card } = paint;
  const boxOf = (i: number) => ({ x: L.cols[i].x, y: L.photoY, w: L.cols[i].w, h: L.photoH });

  /* 卸載時停掉還沒畫的那一格 */
  useEffect(() => () => cancelAnimationFrame(live.current?.raf ?? 0), []);

  return (
    <>
      {L.cols.map((_, i) => {
        const col = columns[i];
        if (!col) return null;
        const img = columnImage(col, bars);
        const b = boxOf(i);
        const style = { left: b.x, top: b.y, width: b.w, height: b.h, borderRadius: 22 };
        if (!img) {
          const bar =
            col.source === 'character' ? bars.find((x) => x.id === col.characterId) : undefined;
          return (
            <button
              key={col.id}
              type="button"
              aria-label={bar ? S.cardPickCharacterImage(i + 1) : S.cardPhotoPick(i + 1)}
              data-photo={i}
              data-empty
              className="absolute cursor-pointer rounded-[22px] outline-none hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-focus"
              style={style}
              onClick={async () => {
                if (bar) {
                  /* 選了角色、角色還沒有立繪：選的圖片當成這位角色的立繪（接著圈頭像） */
                  const [f] = await pickFiles({ accept: 'image/*' });
                  if (f) startJob({ kind: 'image', barId: bar.id, file: f });
                } else await choosePhotoFor(col, toast);
              }}
            />
          );
        }
        const fitCover = (p: FramePlacement) =>
          clampPlacement(img, { width: b.w, height: b.h }, p, LIMITS.cardZoom);
        const show = (p: FramePlacement) => {
          const s = live.current;
          if (!s) return;
          s.cur = p;
          if (s.raf) return;
          s.raf = requestAnimationFrame(() => {
            const now = live.current;
            if (!now) return;
            now.raf = 0;
            redrawPhoto(now.i, now.cur);
          });
        };
        const down = (e: PointerEvent<HTMLDivElement>) => {
          if (e.button !== 0) return;
          if (live.current && live.current.col !== col.id) return;
          e.preventDefault();
          e.stopPropagation();
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* 合成的指標事件（測試）沒有真的指標可以捕捉 */
          }
          if (!gestureRef.current.down(e.pointerId, e.clientX, e.clientY)) return;
          if (!live.current) {
            live.current = { col: col.id, i, start: col.placement, cur: col.placement, raf: 0 };
            onDragging(true);
          } else live.current.start = live.current.cur;
        };
        const move = (e: PointerEvent<HTMLDivElement>) => {
          const s = live.current;
          if (!s || s.col !== col.id) return;
          const g = gestureRef.current.move(e.pointerId, e.clientX, e.clientY);
          if (!g) return;
          const p0 = s.start;
          if (g.kind === 'pan') {
            show(fitCover({ ...p0, x: p0.x + g.dx / scale / b.w, y: p0.y + g.dy / scale / b.h }));
            return;
          }
          /* 兩指：以開始時兩指的中點為中心縮放，再跟著中點平移 */
          const r = e.currentTarget.getBoundingClientRect();
          const u = (g.originX - r.left) / r.width - 0.5;
          const v = (g.originY - r.top) / r.height - 0.5;
          const z = Math.min(LIMITS.cardZoom, Math.max(1, p0.zoom * g.scale));
          const k = z / p0.zoom;
          show(
            fitCover({
              ...p0,
              zoom: z,
              x: u - (u - p0.x) * k + g.dx / r.width,
              y: v - (v - p0.y) * k + g.dy / r.height,
            }),
          );
        };
        const up = (e: PointerEvent<HTMLDivElement>) => {
          const s = live.current;
          if (!s || s.col !== col.id) return;
          if (gestureRef.current.up(e.pointerId)) {
            s.start = s.cur;
            return;
          }
          if (gestureRef.current.active()) return;
          cancelAnimationFrame(s.raf);
          live.current = null;
          actions.patchColumn(col.id, { placement: s.cur });
          onDragging(false);
        };
        const wheel = (e: WheelEvent<HTMLDivElement>) => {
          if (e.ctrlKey || e.metaKey || live.current) return;
          e.stopPropagation();
          const r = e.currentTarget.getBoundingClientRect();
          const u = (e.clientX - r.left) / r.width - 0.5;
          const v = (e.clientY - r.top) / r.height - 0.5;
          const p = col.placement;
          const z = Math.min(LIMITS.cardZoom, Math.max(1, p.zoom * Math.exp(-e.deltaY * 0.0016)));
          const k = z / p.zoom;
          actions.patchColumn(col.id, {
            placement: fitCover({ ...p, zoom: z, x: u - (u - p.x) * k, y: v - (v - p.y) * k }),
          });
        };
        return (
          <div
            key={col.id}
            role="application"
            aria-label={S.cardPhotoArea(i + 1)}
            data-photo={i}
            data-placement={`${col.placement.zoom.toFixed(3)},${col.placement.x.toFixed(4)},${col.placement.y.toFixed(4)}`}
            className="absolute cursor-grab touch-none active:cursor-grabbing"
            style={style}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            onWheel={wheel}
            data-ratio={card.ratio}
          />
        );
      })}
    </>
  );
}

/** 卡片上的滾輪縮放：舞台不要跟著捲動頁面 */
function useNoPageScroll(el: HTMLElement | null) {
  useEffect(() => {
    if (!el) return;
    const stop = (e: globalThis.WheelEvent) => {
      if ((e.target as Element | null)?.closest?.('[data-photo]') && !e.ctrlKey && !e.metaKey)
        e.preventDefault();
    };
    el.addEventListener('wheel', stop, { passive: false });
    return () => el.removeEventListener('wheel', stop);
  }, [el]);
}

export function CardPreview({
  paint,
  onDragging,
}: {
  paint: CardPaint & { ready: boolean };
  onDragging: (v: boolean) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState<'png' | 'gif' | null>(null);
  const [progress, setProgress] = useState(0);
  const toast = useToast();
  const { layout: L } = paint;
  useNoPageScroll(host);

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    drawCard(ctx, paint, 1);
  }, [paint]);

  /** 拖曳中：只重畫那一張照片 */
  const redrawPhoto = (i: number, p: FramePlacement) => {
    const ctx = canvas.current?.getContext('2d');
    if (ctx) drawCardPhoto(ctx, paint, i, p, 1);
  };

  const anyColor = paint.resolved.some((r) => r.swatches.length);
  const fileBase = () => cardFileBase(paint.card, paint.resolved, S.cardFile);
  const exportPaint = async (): Promise<CardPaint> => {
    const ids = paint.columns
      .map((c) => columnImage(c, settingsNow().bars)?.id)
      .filter((x): x is string => !!x);
    const bitmaps = await loadAssetBitmaps(assets, ids);
    return { ...paint, bitmaps };
  };

  const savePng = async () => {
    if (!anyColor) {
      setStatus({ tone: 'warning', text: S.cardNothing });
      return;
    }
    setBusy('png');
    try {
      const out = await renderCardPng(await exportPaint());
      const name = fileNameWithExt(fileBase(), 'png', { fallback: S.cardFile });
      downloadBlob(out.blob, name);
      setStatus({ tone: 'success', text: S.savedFile(name, out.width, out.height) });
    } catch {
      setStatus({ tone: 'danger', text: S.saveFailedImage });
    } finally {
      setBusy(null);
    }
  };
  const saveGif = async () => {
    if (!anyColor) {
      setStatus({ tone: 'warning', text: S.cardNothing });
      return;
    }
    setBusy('gif');
    setProgress(0);
    try {
      const out = await renderCardGif(await exportPaint(), { onProgress: setProgress });
      const name = fileNameWithExt(fileBase(), 'gif', { fallback: S.cardFile });
      downloadBlob(out.blob, name);
      setStatus({ tone: 'success', text: S.cardGifDone(name, out.width, out.height, out.frames) });
    } catch {
      setStatus({ tone: 'danger', text: S.saveFailedImage });
    } finally {
      setBusy(null);
    }
  };
  const copy = async () => {
    if (!anyColor) {
      setStatus({ tone: 'warning', text: S.cardNothing });
      return;
    }
    const text = cardCopyText(paint.resolved, paint.names, L.blend, S.cardBlend);
    const ok = await copyText(text);
    toast(
      ok
        ? { title: S.cardCopied, tone: 'success', replace: true }
        : { title: S.copyFailed, tone: 'danger', replace: true },
    );
  };

  return (
    <div className="flex min-w-0 flex-col gap-3" ref={setHost}>
      <Stage width={L.width} height={L.height} backgrounds={[]} aria-label={S.cardStage}>
        <canvas
          ref={canvas}
          width={L.width}
          height={L.height}
          className="block size-full"
          data-testid="card-canvas"
        />
        <PhotoAreas paint={paint} onDragging={onDragging} redrawPhoto={redrawPhoto} />
      </Stage>
      <p className="m-0 text-xs text-muted tabular-nums" data-testid="card-size">
        {`${L.width * 2} × ${L.height * 2} px`}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          icon={<Download />}
          loading={busy === 'png'}
          disabled={!!busy}
          onClick={() => void savePng()}
        >
          {S.cardSavePng}
        </Button>
        <Button
          icon={<Film />}
          loading={busy === 'gif'}
          disabled={!!busy}
          onClick={() => void saveGif()}
        >
          {S.cardSaveGif}
        </Button>
        <Button icon={<Clipboard />} disabled={!!busy} onClick={() => void copy()}>
          {S.cardCopy}
        </Button>
      </div>
      {busy === 'gif' ? (
        <div className="flex flex-col gap-1">
          <ProgressBar value={progress} label={S.cardGifBusy(Math.round(progress * 100))} />
          <span className="text-xs text-muted">{S.cardGifBusy(Math.round(progress * 100))}</span>
        </div>
      ) : null}
      {status ? (
        <Notice tone={status.tone}>
          <span data-testid="card-status">{status.text}</span>
        </Notice>
      ) : null}
    </div>
  );
}
