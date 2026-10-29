/**
 * 名單（eidolon-ui 的 roster）：每張圖一個棋子；縮圖是目前的外觀畫出來的棋子。點一下切換、拖曳排序、移除、清空（先確認）、
 * 「當參考」把那個棋子畫成預覽上的參考圖。
 */
import { ImagePlus, Replace, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { pickFiles } from '@/core/files';
import { Button, Section, type ThumbnailItem, ThumbnailList, useConfirm, useToast } from '@/ui';
import { type BatchNotice, replaceCurrentImage, tokenAsRef } from './actions';
import { TOKEN_MAX, type TokenItem, tokenBaseName } from './model';
import { useCustomData } from './sources';
import { clearTokens, moveToken, removeToken, selectToken, useDoc } from './store';
import { S } from './strings';
import { onTextureReady } from './textures';
import { drawTokenThumb, useLoadedTokens } from './thumbs';

const THUMB = 128;

interface RosterItem extends ThumbnailItem {
  token: TokenItem;
}

export const tokenLabel = (t: Pick<TokenItem, 'name' | 'image'>): string =>
  t.name.trim() || tokenBaseName(t) || S.untitled;

function useNotice() {
  const toast = useToast();
  return (n: BatchNotice | null) => {
    if (n) toast({ title: n.title, description: n.description, tone: n.tone, replace: true });
  };
}

/** 名單的縮圖（外觀或棋子改了 0.18 秒後重畫） */
function useRosterThumbs(tokens: readonly TokenItem[]): Map<string, HTMLCanvasElement> {
  const look = useDoc((s) => s.data.look);
  const custom = useDoc((s) => s.data.custom);
  const cdata = useCustomData(
    look.frame === 'custom' ? (custom.frame?.id ?? null) : null,
    custom.mask?.id ?? null,
  );
  const loaded = useLoadedTokens(tokens);
  const [texTick, setTexTick] = useState(0);
  const [thumbs, setThumbs] = useState(() => new Map<string, HTMLCanvasElement>());
  useEffect(() => onTextureReady(() => setTexTick((t) => t + 1)), []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: loaded、texTick 讓讀好的圖片、質感重畫
  useEffect(() => {
    /* 還沒有縮圖的棋子（剛加入）馬上畫；外觀改變時等停下來再畫 */
    const delay = tokens.some((t) => !thumbs.has(t.id)) ? 0 : 180;
    const id = setTimeout(() => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const px = Math.round(THUMB * dpr);
      const next = new Map<string, HTMLCanvasElement>();
      for (const t of tokens) {
        const c = document.createElement('canvas');
        c.width = c.height = px;
        const ctx = c.getContext('2d');
        if (!ctx) continue;
        drawTokenThumb(ctx, t, look, px, {
          frame: cdata.frame,
          frameId: custom.frame?.id ?? null,
          mask: cdata.mask,
        });
        next.set(t.id, c);
      }
      setThumbs(next);
    }, delay);
    return () => clearTimeout(id);
  }, [tokens, look, cdata.frame, cdata.mask, loaded, texTick]);
  return thumbs;
}

export function RosterSection({ onAdd }: { onAdd: () => void }) {
  const tokens = useDoc((s) => s.data.tokens);
  const current = useDoc((s) => s.data.current);
  const confirm = useConfirm();
  const notify = useNotice();
  const thumbs = useRosterThumbs(tokens);
  const items = useMemo<RosterItem[]>(
    () =>
      tokens.map((t) => ({
        id: t.id,
        name: tokenLabel(t),
        image: thumbs.get(t.id) ?? null,
        token: t,
      })),
    [tokens, thumbs],
  );
  const cur = tokens.find((t) => t.id === current) ?? null;
  return (
    <Section
      title={S.roster}
      persistKey="token-maker:roster"
      actions={
        <span className="text-xs text-muted" data-testid="roster-count">
          {S.rosterCount(tokens.length, TOKEN_MAX)}
        </span>
      }
    >
      <ThumbnailList<RosterItem>
        aria-label={S.rosterLabel}
        items={items}
        selectedId={current}
        onSelect={selectToken}
        onReorder={moveToken}
        onRemove={removeToken}
        removeLabel={(it) => S.rosterRemove(it.name)}
        minItemWidth={92}
        empty={S.rosterEmpty}
        className="max-h-80 overflow-y-auto"
        renderFields={(it) => (
          <button
            type="button"
            className="cursor-pointer self-start rounded-sm px-1 text-xs text-accent underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none disabled:cursor-default disabled:text-muted"
            title={S.rosterAsRefTitle(it.name)}
            disabled={!it.token.image}
            onClick={async (e) => {
              e.stopPropagation();
              notify(await tokenAsRef(it.token));
            }}
          >
            {S.rosterAsRef}
          </button>
        )}
      />
      {tokens.length ? <p className="m-0 text-xs text-muted">{S.rosterHint}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          icon={<ImagePlus />}
          disabled={tokens.length >= TOKEN_MAX}
          onClick={onAdd}
        >
          {S.rosterAdd}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          icon={<Replace />}
          disabled={!cur}
          title={S.replaceImageTitle}
          onClick={async () => {
            const [f] = await pickFiles({ accept: 'image/*' });
            if (f) notify(await replaceCurrentImage(f));
          }}
        >
          {S.replaceImage}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<Trash2 />}
          disabled={!tokens.length}
          onClick={async () => {
            const ok = await confirm({
              title: S.rosterClearTitle,
              description: S.rosterClearDesc,
              confirmLabel: S.rosterClearConfirm,
              danger: true,
            });
            if (!ok) return;
            clearTokens();
            notify({ title: S.rosterCleared, tone: 'info' });
          }}
        >
          {S.rosterClear}
        </Button>
      </div>
    </Section>
  );
}
