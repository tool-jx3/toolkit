/**
 * 預覽的立繪（2026-11-20，規格 F74～F78）：疊在預覽背景之上、轉場圖層之下（照 CCFOLIA 的順序：背景 → 立繪 → 轉場），
 * 只在預覽，不進匯出。
 * - 加入：選一張圖（透明 PNG 也可以），預設高度 90%、左右置中、腳底貼齊下緣；
 * - 移動：在預覽上拖曳；選取後用方向鍵（Shift 一次多移一點），Esc 取消選取；
 * - 大小：滑桿（畫面高的 10%～200%）或拖四個角（長寬比不變）；
 * - 換一張、拿掉。圖片存在這個瀏覽器（IndexedDB），重新整理後還在（previewStore.ts）。
 */
import { ImagePlus, Move, Trash2, UserRound } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { addImageFile } from '@/core/assets';
import { Button, IconButton, Slider } from '@/ui';
import { LayoutEditor } from '@/ui/LayoutEditor';
import {
  assets,
  keptAssetIds,
  newPortrait,
  PORTRAIT_HEIGHT,
  type Portrait,
  placePortrait,
  portraitWidth,
  resizePortrait,
  usePreview,
} from './previewStore';
import { PREVIEW_SIZE } from './render';
import { S } from './strings';

const setPortrait = (p: Portrait | null) =>
  usePreview.getState().update((d) => {
    d.portrait = p;
  });

/** 圖片 id → 網址；讀不回來時是 null（undefined＝還在讀） */
export function useAssetUrl(id: string | null | undefined): string | null | undefined {
  const [state, setState] = useState<{ id: string; url: string | null } | null>(null);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    assets.url(id).then(
      (url) => alive && setState({ id, url: url ?? null }),
      () => alive && setState({ id, url: null }),
    );
    return () => {
      alive = false;
    };
  }, [id]);
  if (!id) return null;
  return state?.id === id ? state.url : undefined;
}

/** 放在 Stage 裡、canvas 之前：立繪本身（超出畫面的部分裁掉） */
export function PortraitImage({ portrait, url }: { portrait: Portrait; url: string }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <img
        src={url}
        alt=""
        draggable={false}
        data-testid="st-portrait"
        className="absolute block max-w-none select-none"
        style={{
          left: `${portrait.x}%`,
          top: `${portrait.y}%`,
          width: `${portraitWidth(portrait)}%`,
          height: `${portrait.height}%`,
        }}
      />
    </div>
  );
}

/** 放在 Stage 裡、canvas 之後：拖曳、拖角調大小、方向鍵 */
export function PortraitHandles({
  portrait,
  selected,
  onSelect,
}: {
  portrait: Portrait;
  selected: boolean;
  onSelect: (v: boolean) => void;
}) {
  const width = portraitWidth(portrait);
  const ratio = width / portrait.height;
  return (
    <LayoutEditor
      width={PREVIEW_SIZE.width}
      height={PREVIEW_SIZE.height}
      units="percent"
      aria-label={S.portrait.layer}
      items={[
        {
          id: 'portrait',
          label: S.portrait.item,
          box: { x: portrait.x, y: portrait.y, width, height: portrait.height },
          resizable: true,
          handles: ['nw', 'ne', 'sw', 'se'],
          limits: {
            minHeight: PORTRAIT_HEIGHT.min,
            maxHeight: PORTRAIT_HEIGHT.max,
            minWidth: PORTRAIT_HEIGHT.min * ratio,
            maxWidth: PORTRAIT_HEIGHT.max * ratio,
            keepAspect: true,
          },
        },
      ]}
      selectedId={selected ? 'portrait' : null}
      onSelect={(id) => onSelect(id === 'portrait')}
      onChange={(_id, box) => {
        const cur = usePreview.getState().data.portrait;
        if (!cur) return;
        setPortrait(placePortrait({ ...cur, x: box.x, y: box.y, height: box.height }));
      }}
      onEscape={() => onSelect(false)}
      nudgeStep={0.5}
      nudgeShiftStep={5}
      guides={false}
    />
  );
}

/** 預覽下方的一列：加入、大小、選取（方向鍵移動）、換一張、拿掉 */
export function PortraitControls({
  portrait,
  missing,
  selected,
  onSelect,
}: {
  portrait: Portrait | null;
  /** 存下的立繪讀不回來 */
  missing: boolean;
  selected: boolean;
  onSelect: (v: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const labelId = useId();
  const [note, setNote] = useState<{ tone: 'warning' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (file: File) => {
    setBusy(true);
    setNote(null);
    try {
      const { ref, persisted } = await addImageFile(assets, file, { maxSide: 2048 });
      const prev = usePreview.getState().data.portrait;
      setPortrait(
        prev
          ? resizePortrait({ ...prev, id: ref.id, aspect: ref.width / ref.height }, prev.height)
          : newPortrait(ref.id, ref.width / ref.height),
      );
      onSelect(true);
      if (!persisted) setNote({ tone: 'warning', text: S.portrait.notSaved });
      void assets.gc(keptAssetIds());
    } catch {
      setNote({ tone: 'danger', text: S.portrait.unreadable(file.name) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-surface px-3 py-2"
      data-testid="st-portrait-controls"
    >
      <span id={labelId} className="inline-flex items-center gap-1.5 text-sm font-medium">
        <UserRound aria-hidden className="size-4 text-muted" />
        {S.portrait.title}
      </span>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void pick(f);
        }}
      />
      {portrait ? (
        <>
          <div className="flex min-w-40 flex-1 items-center gap-2">
            <span className="shrink-0 text-xs text-muted">{S.portrait.size}</span>
            <Slider
              className="min-w-0 flex-1"
              value={Math.round(portrait.height)}
              min={PORTRAIT_HEIGHT.min}
              max={PORTRAIT_HEIGHT.max}
              step={PORTRAIT_HEIGHT.step}
              unit="%"
              aria-label={S.portrait.sizeLabel}
              onChange={(v) => setPortrait(resizePortrait(portrait, v))}
            />
          </div>
          <div className="flex items-center gap-1">
            <IconButton
              label={S.portrait.move}
              icon={<Move />}
              size="sm"
              variant="ghost"
              pressed={selected}
              onClick={() => onSelect(!selected)}
            />
            <IconButton
              label={S.portrait.replace}
              icon={<ImagePlus />}
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => input.current?.click()}
            />
            <IconButton
              label={S.portrait.remove}
              icon={<Trash2 />}
              size="sm"
              variant="ghost"
              onClick={() => {
                onSelect(false);
                setPortrait(null);
                setNote(null);
                void assets.gc(keptAssetIds());
              }}
            />
          </div>
        </>
      ) : (
        <Button
          size="sm"
          icon={<ImagePlus />}
          loading={busy}
          aria-describedby={labelId}
          onClick={() => input.current?.click()}
        >
          {S.portrait.add}
        </Button>
      )}
      <p className="m-0 w-full text-xs text-muted">
        {portrait ? S.portrait.hint : S.portrait.emptyHint}
      </p>
      {note || missing ? (
        <p
          role="status"
          className={
            note?.tone === 'danger'
              ? 'm-0 w-full text-xs text-danger'
              : 'm-0 w-full text-xs text-warning'
          }
        >
          {note ? note.text : S.portrait.missing}
        </p>
      ) : null}
    </div>
  );
}
