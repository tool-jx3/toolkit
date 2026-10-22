/**
 * 範本對話框：分類篩選、縮圖卡片（樓層數與說明）、空白地圖；載入選項「只載入格局」「放入隱藏線索」。
 * 2026-10 第三批：搜尋欄（名稱或 `#標籤`，F235；共用 TemplateGallery 的 `search`）。
 * 2026-10 第三批後半：13 類（一個範本可以在好幾類，分類按鈕換行）；範本變多，縮圖捲到看得到的地方才畫
 * （一次畫一張，畫好的留著），樓層數也只算一次（D55）。
 */
import { Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  Field,
  TemplateGallery,
  type TemplateItem,
  type TemplateSearch,
  Toggle,
} from '@/ui';
import { exportLayout, renderImage } from '../draw/export';
import { composeFloors } from '../model/interior';
import { matchesQuery, queryWords, type TagId, tagSuggestions } from '../model/tags';
import { S } from '../strings';
import {
  instantiateTemplate,
  TEMPLATE_GROUPS,
  TEMPLATES,
  type TemplateGroupId,
  templateGroups,
} from '../templates';
import { templateTags } from '../templates/tags';
import { loadTemplate, newMap } from './actions';
import { setEditor, useEditor } from './store';

const thumbs = new Map<string, string>();

/**
 * 縮圖的長邊約 480 px（卡片約 140～170 px 寬，高解析度螢幕的兩倍再多一點）：每格 3～10 px。
 * 原本固定每格 10 px，三層的範本會畫成 2000 px 寬的圖再縮小顯示，畫與轉 PNG 都慢（D55）。
 */
const THUMB_LONG_SIDE = 480;

function thumbnail(id: string): string | null {
  const hit = thumbs.get(id);
  if (hit) return hit;
  const floors = instantiateTemplate(id);
  if (!floors) return null;
  try {
    const composed = composeFloors(floors);
    const opts = {
      theme: 'clean',
      px: 1,
      showSize: 'none',
      hideNames: false,
      playerView: false,
      hideClues: false,
      grid: false,
      transparent: false,
      margin: 1,
    } as const;
    const L = exportLayout(composed, opts);
    const px = Math.min(10, Math.max(3, THUMB_LONG_SIDE / Math.max(L.width, (L.height * 4) / 3)));
    const canvas = renderImage(composed, { ...opts, px });
    const url = canvas.toDataURL('image/png');
    thumbs.set(id, url);
    return url;
  } catch {
    return null;
  }
}

/**
 * 縮圖的佇列：卡片捲到看得到的地方（上下多 300 px）才排進來，一次畫一張（每張之間讓出主執行緒），
 * 對話框打開、捲動、換分類都不會卡住。
 */
const waiting = new Map<string, (url: string | null) => void>();
let pumping = false;

function pump(): void {
  const next = waiting.entries().next();
  if (next.done) {
    pumping = false;
    return;
  }
  const [id, done] = next.value;
  waiting.delete(id);
  done(thumbnail(id));
  setTimeout(pump, 0);
}

function requestThumbnail(id: string, done: (url: string | null) => void): () => void {
  waiting.set(id, done);
  if (!pumping) {
    pumping = true;
    setTimeout(pump, 0);
  }
  return () => {
    if (waiting.get(id) === done) waiting.delete(id);
  };
}

const IMG_CLASS = 'max-h-full max-w-full object-contain';

/** 範本的縮圖：看得到時才畫（畫過的直接用） */
function TemplateThumb({ id }: { id: string }) {
  const [url, setUrl] = useState(() => thumbs.get(id) ?? null);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (url) return;
    let cancel: (() => void) | null = null;
    const start = () => {
      cancel ??= requestThumbnail(id, setUrl);
    };
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      start();
      return () => cancel?.();
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          start();
        }
      },
      { rootMargin: '300px 0px' },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancel?.();
    };
  }, [id, url]);
  return url ? (
    <img src={url} alt="" className={IMG_CLASS} />
  ) : (
    <span
      ref={ref}
      aria-hidden
      className="flex size-full items-center justify-center bg-surface-2 text-xs text-muted"
    >
      …
    </span>
  );
}

/** 範本的樓層數（第一次用到時算一次） */
const floorCounts = new Map<string, number>();
const floorCount = (id: string, build: () => unknown[]): number => {
  let n = floorCounts.get(id);
  if (n === undefined) {
    n = build().length;
    floorCounts.set(id, n);
  }
  return n;
};

const groupName = (id: TemplateGroupId) => TEMPLATE_GROUPS.find((g) => g.id === id)?.name ?? '';

/** 搜尋：名稱、說明、分類名稱或 `#標籤`（空白地圖只有名稱） */
const searchText = (id: string): { text: string[]; tags: readonly TagId[] } => {
  if (id === 'blank') return { text: [S.tpl.blank], tags: [] };
  const t = TEMPLATES.find((x) => x.id === id);
  return t
    ? {
        text: [t.name, t.description, ...templateGroups(t).map(groupName), t.id],
        tags: templateTags(t.id),
      }
    : { text: [], tags: [] };
};

const GROUP_NAMES = TEMPLATE_GROUPS.map((g) => g.name);

const USED_TAGS: ReadonlySet<TagId> = new Set(TEMPLATES.flatMap((t) => templateTags(t.id)));

const SEARCH: TemplateSearch<string> = {
  label: S.tpl.search,
  placeholder: S.tpl.searchHint,
  empty: S.tpl.noResult,
  suggestLabel: S.lib.tagSuggest,
  match: (t, q) => matchesQuery(searchText(t.data), queryWords(q)),
  suggest: (q) => {
    const s = tagSuggestions(q, USED_TAGS);
    return s ? s.tags.map((t) => ({ label: `#${t.name}`, value: `${s.prefix}#${t.name} ` })) : [];
  },
};

export function TemplateDialog() {
  const open = useEditor((s) => s.templatesOpen);
  const [structureOnly, setStructureOnly] = useState(false);
  const [clues, setClues] = useState(false);
  const items = useMemo<TemplateItem<string>[]>(() => {
    if (!open) return [];
    const list: TemplateItem<string>[] = TEMPLATES.map((t) => ({
      id: t.id,
      name: t.name,
      description: `${S.tpl.floors(floorCount(t.id, t.build))}・${t.description}`,
      thumbnail: <TemplateThumb id={t.id} />,
      tags: templateGroups(t).map(groupName),
      data: t.id,
    }));
    /* 空白地圖在每個分類（含「全部」）都是最後一張 */
    list.push({
      id: 'blank',
      name: S.tpl.blank,
      description: S.tpl.blankDesc,
      thumbnail: (
        <span className="flex size-full items-center justify-center bg-surface-2 text-muted">
          <Plus aria-hidden className="size-8" />
        </span>
      ),
      tags: GROUP_NAMES,
      data: 'blank',
    });
    return list;
  }, [open]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => setEditor({ templatesOpen: o })}
      title={S.tpl.title}
      description={S.tpl.intro}
      size="xl"
    >
      <div className="flex flex-col gap-3" data-testid="template-dialog">
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <Field label={S.tpl.structureOnly} layout="inline">
            <Toggle checked={structureOnly} onCheckedChange={setStructureOnly} />
          </Field>
          <Field label={S.tpl.clues} layout="inline">
            <Toggle checked={clues} onCheckedChange={setClues} />
          </Field>
        </div>
        <TemplateGallery
          aria-label={S.tpl.gallery}
          templates={items}
          search={SEARCH}
          wrapFilter
          tagOrder={GROUP_NAMES}
          confirm={false}
          onApply={(t) => {
            if (t.data === 'blank') newMap();
            else loadTemplate(t.data, { structureOnly, clues });
          }}
        />
      </div>
    </Dialog>
  );
}
