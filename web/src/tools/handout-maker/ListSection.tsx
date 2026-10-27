/**
 * 道具清單（規格 F01）：每一張的縮圖（同一段程式畫）、點一下切換編輯的那一張、拖曳或 Alt＋↑／↓ 排順序、
 * 新增一張、建立副本、刪除（至少留一張；可以復原）。
 */
import { Copy, Plus } from 'lucide-react';
import { useDeferredValue, useMemo, useRef } from 'react';
import { useAssetBitmaps } from '@/core/assets';
import { Button, Section, ThumbnailList, useToast } from '@/ui';
import { useEnsureFonts, useFontTick } from './fonts';
import { HANDOUT_MAX, type Handout, handoutAssetIds, handoutName } from './model';
import { type AnyCanvas, fontNeeds, renderThumb } from './render';
import {
  addBlank,
  assets,
  duplicateActive,
  historyStep,
  moveHandout,
  removeHandout,
  select,
  useActive,
  useDoc,
} from './store';
import { S } from './strings';

/** 縮圖的長邊（px） */
const THUMB_SIDE = 180;

/** 每一張的縮圖（內容、圖片、字型沒變的不重畫） */
function useThumbs(items: readonly Handout[]): Map<string, AnyCanvas> {
  const ids = useMemo(() => items.flatMap(handoutAssetIds), [items]);
  const { bitmaps } = useAssetBitmaps(assets, ids);
  const needs = useMemo(() => items.flatMap(fontNeeds), [items]);
  useEnsureFonts(needs);
  const tick = useFontTick();
  const cache = useRef(new WeakMap<Handout, { key: string; canvas: AnyCanvas }>());
  return useMemo(() => {
    const out = new Map<string, AnyCanvas>();
    for (const h of items) {
      const img = h.image ? (bitmaps.get(h.image.id) ?? null) : null;
      const bg = h.bg.image ? (bitmaps.get(h.bg.image.id) ?? null) : null;
      const key = `${tick}|${img ? h.image?.id : ''}|${bg ? h.bg.image?.id : ''}`;
      const hit = cache.current.get(h);
      if (hit && hit.key === key) {
        out.set(h.id, hit.canvas);
        continue;
      }
      try {
        const canvas = renderThumb(h, THUMB_SIDE, img, bg);
        cache.current.set(h, { key, canvas });
        out.set(h.id, canvas);
      } catch {
        /* 畫不出來時沒有縮圖（清單仍可操作） */
      }
    }
    return out;
  }, [items, bitmaps, tick]);
}

export function ListSection() {
  const live = useDoc((s) => s.data.items);
  /* 打字時縮圖晚一點跟上，打字不會卡 */
  const items = useDeferredValue(live);
  const active = useActive();
  const thumbs = useThumbs(items);
  const toast = useToast();
  const full = live.length >= HANDOUT_MAX;
  const remove = (id: string) => {
    const gone = removeHandout(id);
    if (gone)
      toast({
        title: S.removed(handoutName(gone) || S.untitled),
        replace: true,
        action: { label: S.undoAction, onClick: () => historyStep('undo') },
      });
  };
  return (
    <Section
      title={S.listTitle}
      actions={
        <span className="text-xs text-muted tabular-nums" data-testid="list-count">
          {S.listCount(live.length, HANDOUT_MAX)}
        </span>
      }
    >
      <ThumbnailList
        aria-label={S.listLabel}
        items={live.map((h) => ({
          id: h.id,
          name: handoutName(h) || S.untitled,
          image: thumbs.get(h.id),
          meta: `${S.themes[h.theme]}・${h.width} × ${h.height}`,
        }))}
        selectedId={active.id}
        onSelect={select}
        onReorder={moveHandout}
        onRemove={remove}
        removeLabel={(it) => S.removeItem(it.name)}
        removeDisabled={live.length <= 1}
        minItemWidth={96}
        thumbAspect={3 / 4}
        className="max-h-[22rem] overflow-y-auto"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          icon={<Plus />}
          disabled={full}
          data-testid="add-handout"
          onClick={() => {
            if (addBlank()) toast({ title: S.added, replace: true });
          }}
        >
          {S.addNew}
        </Button>
        <Button
          size="sm"
          icon={<Copy />}
          disabled={full}
          data-testid="duplicate-handout"
          onClick={() => {
            if (duplicateActive()) toast({ title: S.duplicated, replace: true });
          }}
        >
          {S.duplicate}
        </Button>
        {full ? <span className="text-xs text-muted">{S.listFull(HANDOUT_MAX)}</span> : null}
      </div>
      <p className="m-0 text-xs text-muted">{S.listHint}</p>
    </Section>
  );
}
