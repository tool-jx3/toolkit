/**
 * 效果一覽：用目前的文字與樣式，把每種效果做成小動畫同時循環播放；點一下就套用。
 */
import { useEffect, useRef, useState } from 'react';
import { cn, Dialog, DialogClose } from '@/ui';
import { type GalleryKind, galleryVariant, PICKERS } from './actions';
import { scaleSettings } from './exporter';
import { loadFonts } from './fonts';
import { HOLD, INTRO, OUTRO } from './motion';
import { buildScene, type Scene, sceneFontLoads } from './scene';
import { FLOW_NAMES, type Settings } from './settings';
import { S } from './strings';

const TILE_W = 288;

function itemsFor(kind: GalleryKind): [string, string, string][] {
  switch (kind) {
    case 'intro':
      return Object.entries(INTRO).map(([id, d]) => [
        id,
        d.name,
        d.unit === 'block' ? S.gallery.block : S.gallery.glyph,
      ]);
    case 'outro':
      return Object.entries(OUTRO).map(([id, d]) => [
        id,
        d.name,
        d.unit === 'block' ? S.gallery.block : S.gallery.glyph,
      ]);
    case 'hold':
      return Object.entries(HOLD).map(([id, d]) => [id, d.name, '']);
    case 'char':
      return Object.entries(INTRO)
        .filter(([, d]) => d.unit === 'glyph' && !d.shortOnly)
        .map(([id, d]) => [id, d.name, '']);
    case 'flow':
      return Object.entries(FLOW_NAMES).map(([id, name]) => [id, name, '']);
  }
}

function currentOf(kind: GalleryKind, c: Settings): string {
  return {
    intro: c.intro.fx,
    outro: c.outro.fx,
    hold: c.hold.fx,
    char: c.flow.charFx,
    flow: c.flow.kind,
  }[kind];
}

export function EffectGallery({
  kind,
  cfg,
  onClose,
}: {
  kind: GalleryKind | null;
  cfg: Settings;
  onClose: () => void;
}) {
  const open = kind !== null;
  const [snapshot, setSnapshot] = useState<{ kind: GalleryKind; cfg: Settings } | null>(null);
  /* 打開的那一刻固定住設定（套用後關閉） */
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;
  useEffect(() => {
    if (kind) setSnapshot({ kind, cfg: cfgRef.current });
  }, [kind]);
  const items = snapshot ? itemsFor(snapshot.kind) : [];
  const canvases = useRef(new Map<string, HTMLCanvasElement>());

  useEffect(() => {
    if (!open || !snapshot) return;
    let alive = true;
    const scenes = new Map<string, Scene>();
    const base = snapshot.cfg;
    const ratio = TILE_W / base.canvasW;
    const t0 = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      if (!alive) return;
      for (const [id, sc] of scenes) {
        const cv = canvases.current.get(id);
        const ctx = cv?.getContext('2d');
        if (!ctx) continue;
        const D = sc.duration + 0.35;
        const tt = ((now - t0) / 1000) % D;
        sc.draw(ctx, Math.min(tt, sc.duration));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    (async () => {
      /* 一個一個建，讓畫面保持流暢 */
      for (const [id] of itemsFor(snapshot.kind)) {
        if (!alive) return;
        try {
          const c = scaleSettings(galleryVariant(snapshot.kind, id, base), ratio);
          await loadFonts(sceneFontLoads(c), 4000);
          if (!alive) return;
          scenes.set(id, buildScene(c));
        } catch (e) {
          console.warn(e);
        }
        await new Promise((r) => setTimeout(r, 0));
      }
    })();
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [open, snapshot]);

  const current = snapshot ? currentOf(snapshot.kind, snapshot.cfg) : '';
  const w = snapshot ? Math.round(snapshot.cfg.canvasW * (TILE_W / snapshot.cfg.canvasW)) : TILE_W;
  const h = snapshot ? Math.round(snapshot.cfg.canvasH * (TILE_W / snapshot.cfg.canvasW)) : 162;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={snapshot ? S.gallery.titles[snapshot.kind] : S.gallery.open}
      description={S.gallery.note}
      size="xl"
      footer={<DialogClose />}
    >
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-2 p-0">
        {items.map(([id, name, tag]) => (
          <li key={id}>
            <button
              type="button"
              data-effect={id}
              aria-pressed={id === current}
              onClick={() => {
                if (snapshot) PICKERS[snapshot.kind](id);
                onClose();
              }}
              className={cn(
                'flex w-full flex-col overflow-hidden rounded-md border bg-surface-2 text-left transition-colors hover:border-accent',
                id === current ? 'border-accent ring-1 ring-accent' : 'border-border',
              )}
            >
              <span className="checker block w-full">
                <canvas
                  ref={(el) => {
                    if (el) canvases.current.set(id, el);
                    else canvases.current.delete(id);
                  }}
                  width={w}
                  height={h}
                  className="block h-auto w-full"
                />
              </span>
              <span className="flex items-center justify-between gap-2 px-2 py-1.5">
                <span className="truncate text-sm font-medium text-fg">{name}</span>
                {tag ? <span className="shrink-0 text-xs text-muted">{tag}</span> : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
