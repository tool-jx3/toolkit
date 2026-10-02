/**
 * 「貼紙」分頁：加入貼紙、清單（上面＝前面；縮圖、拖曳排序、移到前面／後面、刪除）、選取的貼紙的陰影、外框線、出處。
 */
import { ArrowDownToLine, ArrowUpToLine, ImagePlus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { pickFiles } from '@/core/files';
import type { ToolStore } from '@/core/storage';
import { Button, Field, IconButton, LayerList, TextInput, Toggle, useToast } from '@/ui';
import {
  CITE_MAX,
  type Draft,
  IMAGE_TYPES,
  MAX_STICKERS,
  type Sticker,
  type TemplateDef,
} from './model';
import { ImageInputError, readImageFile } from './render';
import { addSticker, moveSticker, patchSticker, removeSticker, stepSticker } from './stickers';
import { assets, useUi } from './store';
import { S } from './strings';
import { activeOf, pagesOf } from './templates/textlog';

/** 加入貼紙（選檔 → 檢查 → 存進圖片庫 → 放在中央、選取） */
export function useAddSticker(def: TemplateDef, store: ToolStore<Draft>) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (store.getState().data.stickers.length >= MAX_STICKERS) {
      toast({ title: S.stickerLimit(MAX_STICKERS), tone: 'warning' });
      return;
    }
    const [file] = await pickFiles({ accept: IMAGE_TYPES.join(',') });
    if (!file) return;
    setBusy(true);
    try {
      const r = await readImageFile(file);
      const saved = await assets.add(r.blob);
      await assets.bitmap(saved.id);
      if (!saved.persisted) toast({ title: S.imageNotSaved, tone: 'warning' });
      const made = addSticker(def, store.getState().data, saved.id, file.name, {
        width: r.width,
        height: r.height,
      });
      if (!made) {
        toast({ title: S.stickerLimit(MAX_STICKERS), tone: 'warning' });
        return;
      }
      store.getState().replace(made.draft);
      useUi.getState().setSticker(made.id);
      toast({ title: S.stickerAdded, tone: 'success' });
    } catch (e) {
      toast({
        title: e instanceof ImageInputError ? e.message : S.imageUnreadable,
        tone: 'danger',
      });
    } finally {
      setBusy(false);
    }
  };
  return { run, busy };
}

/** 選取貼紙（文字記錄：跳到那一頁） */
export function selectSticker(def: TemplateDef, store: ToolStore<Draft>, s: Sticker | null) {
  useUi.getState().setSticker(s?.id ?? null);
  if (!s || def.kind !== 'textlog') return;
  const d = store.getState().data;
  if (d.view !== 'all' && s.page !== activeOf(d)) {
    const t = store.temporal.getState();
    t.pause();
    store.getState().patch({ active: s.page });
    t.resume();
  }
}

export function StickerPanel({
  def,
  store,
  d,
}: {
  def: TemplateDef;
  store: ToolStore<Draft>;
  d: Draft;
}) {
  const selected = useUi((s) => s.sticker);
  const add = useAddSticker(def, store);
  const sel = d.stickers.find((s) => s.id === selected) ?? null;
  const set = (next: Draft) => store.getState().replace(next);
  const pages = pagesOf(d);
  return (
    <div className="flex flex-col gap-3" data-testid="sticker-panel">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" icon={<ImagePlus />} onClick={add.run} loading={add.busy}>
          {S.addSticker}
        </Button>
        <span className="text-xs text-muted">
          {d.stickers.length} / {MAX_STICKERS}
        </span>
      </div>
      <LayerList
        aria-label={S.stickerList}
        items={d.stickers.map((s) => ({
          id: s.id,
          name: s.name,
          thumbnail: assets.peekBitmap(s.asset) ?? null,
          meta:
            def.kind === 'textlog' && s.page !== undefined
              ? S.stickerPage(pages.indexOf(s.page) + 1)
              : undefined,
        }))}
        thumbSize={{ width: 48, height: 48 }}
        mode="drop"
        selectedId={selected}
        onSelect={(id) => selectSticker(def, store, d.stickers.find((s) => s.id === id) ?? null)}
        onMove={(from, to) => set(moveSticker(store.getState().data, from, to))}
        moveButtons={{ up: S.stickerFront, down: S.stickerBack }}
        renderActions={(item) => (
          <IconButton
            size="sm"
            label={`${S.stickerDelete}：${item.name}`}
            icon={<Trash2 />}
            onClick={() => {
              set(removeSticker(store.getState().data, item.id));
              if (useUi.getState().sticker === item.id) useUi.getState().setSticker(null);
            }}
          />
        )}
        empty={<p className="m-0 p-3 text-sm text-muted">{S.stickerEmpty}</p>}
      />
      {sel ? (
        <div
          className="flex flex-col gap-2 rounded-md border border-border bg-surface-2 p-2.5"
          data-testid="sticker-detail"
        >
          <p className="m-0 truncate text-sm font-medium text-fg">{S.stickerName(sel.name)}</p>
          <Field label={S.stickerShadow} layout="inline">
            <Toggle
              checked={sel.shadow}
              onCheckedChange={(on) =>
                set(patchSticker(store.getState().data, sel.id, { shadow: on }))
              }
            />
          </Field>
          <Field label={S.stickerOutline} layout="inline">
            <Toggle
              checked={sel.outline}
              onCheckedChange={(on) =>
                set(patchSticker(store.getState().data, sel.id, { outline: on }))
              }
            />
          </Field>
          <Field label={S.stickerCite}>
            <div className="flex min-w-0 items-center gap-1.5">
              <span aria-hidden className="text-sm text-muted">
                ⓒ
              </span>
              <TextInput
                value={sel.cite}
                maxLength={CITE_MAX}
                placeholder={S.citePlaceholder}
                onChange={(e) =>
                  set(patchSticker(store.getState().data, sel.id, { cite: e.target.value }))
                }
              />
            </div>
          </Field>
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              icon={<ArrowUpToLine />}
              disabled={d.stickers[0]?.id === sel.id}
              onClick={() => set(stepSticker(store.getState().data, sel.id, 'front'))}
            >
              {S.stickerFront}
            </Button>
            <Button
              size="sm"
              icon={<ArrowDownToLine />}
              disabled={d.stickers.at(-1)?.id === sel.id}
              onClick={() => set(stepSticker(store.getState().data, sel.id, 'back'))}
            >
              {S.stickerBack}
            </Button>
            <Button
              size="sm"
              variant="danger"
              icon={<Trash2 />}
              onClick={() => {
                set(removeSticker(store.getState().data, sel.id));
                useUi.getState().setSticker(null);
              }}
            >
              {S.stickerDelete}
            </Button>
          </div>
        </div>
      ) : null}
      <p className="m-0 text-xs text-muted">{S.stickerHint}</p>
    </div>
  );
}
