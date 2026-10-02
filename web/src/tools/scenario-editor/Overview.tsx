/**
 * 頁面一覽（F200～F202）：每頁的縮圖與標題、標題一覽。
 */
import { useMemo } from 'react';
import { mmToPx } from '@/core/paged';
import { Button, cn, Segmented, Slider } from '@/ui';
import { pageTitleOf } from './layout';
import { allBlocks } from './model/blocks';
import { rubyPlain } from './model/text';
import type { Block } from './model/types';
import { clickSelect, makeTocHere } from './ops';
import { paperApi } from './Paper';
import { pageSettingAt, type RenderCtx, staticPageHtml } from './render/html';
import { revealSource, useDoc, usePrefs, useUi } from './store';

const PAGE_W = mmToPx(210);
const PAGE_H = mmToPx(297);
const HEADS = new Set(['title', 'h1', 'h2', 'h3']);
const LEVEL: Record<string, number> = { title: 0, h1: 1, h2: 2, h3: 3 };

export function Overview() {
  const d = useDoc((s) => s.data);
  const layout = useUi((s) => s.layout);
  const prefs = usePrefs((s) => s.data);
  const patch = usePrefs((s) => s.patch);
  const pages = layout.pages;
  const thumbs = useMemo(() => {
    if (prefs.overviewMode !== 'thumbs') return [];
    const byId = new Map<string, Block>(allBlocks(d).map((b) => [b.id, b]));
    const ctx: RenderCtx = {
      doc: d,
      edit: false,
      pageOf: (id) => (layout.pageOf[id] == null ? null : layout.pageOf[id] + 1),
      total: pages.length,
    };
    return pages.map((ids, i) => staticPageHtml(i, ids, ctx, byId));
  }, [d, layout, pages, prefs.overviewMode]);

  const goPage = (i: number) => {
    paperApi.showPage(i);
    const first = pages[i]?.[0];
    if (first) {
      clickSelect(first, {}, false);
      revealSource(first);
    }
  };

  const heads = d.blocks.filter((b) => HEADS.has(b.type) && String(b.text ?? '').trim());
  const scale = prefs.thumbW / PAGE_W;
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="se-overview">
      <div className="flex flex-col gap-1 border-b border-border p-2">
        <Segmented
          size="sm"
          fullWidth
          aria-label="頁面一覽的顯示"
          value={prefs.overviewMode}
          onValueChange={(v) => patch({ overviewMode: v })}
          options={[
            { value: 'thumbs', label: '頁面' },
            { value: 'heads', label: '標題' },
          ]}
        />
        {prefs.overviewMode === 'thumbs' ? (
          <Slider
            aria-label="縮圖的寬"
            value={prefs.thumbW}
            min={90}
            max={240}
            unit="px"
            showInput={false}
            onChange={(v) => patch({ thumbW: Math.round(v) })}
          />
        ) : null}
        <p className="m-0 text-xs text-muted">
          {prefs.overviewMode === 'thumbs' ? `共 ${pages.length} 頁` : `共 ${heads.length} 項`}
        </p>
        {prefs.overviewMode === 'heads' ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void makeTocHere()}
            title="在選取的段落之後（沒有選取時在第一段之後）插入目錄與換頁"
          >
            在這個位置建立目錄區塊
          </Button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {prefs.overviewMode === 'thumbs' ? (
          <ol className="m-0 flex list-none flex-col items-center gap-3 p-0">
            {thumbs.map((html, i) => {
              const ids = pages[i] ?? [];
              const types = new Set(ids.map((id) => d.blocks.find((b) => b.id === id)?.type));
              const tags = [
                types.has('cover') ? '封面' : '',
                types.has('colophon') ? '版權頁' : '',
                types.has('toc') ? '目錄' : '',
              ]
                .filter(Boolean)
                .join('・');
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: 頁面以頁碼為身分（分頁後依序重畫）
                <li key={i} style={{ width: prefs.thumbW }}>
                  <button
                    type="button"
                    onClick={() => goPage(i)}
                    className="block w-full rounded-sm text-left focus-visible:outline-2 focus-visible:outline-accent"
                    aria-label={`第 ${i + 1} 頁：${pageTitleOf(d, ids)}`}
                  >
                    <div
                      className="overflow-hidden rounded-sm shadow-1"
                      style={{ width: prefs.thumbW, height: PAGE_H * scale }}
                      aria-hidden
                    >
                      <div
                        // biome-ignore lint/security/noDangerouslySetInnerHtml: 紙面的 HTML 由本工具產生（文字都已跳脫）
                        dangerouslySetInnerHTML={{ __html: html }}
                        style={{
                          width: PAGE_W,
                          transform: `scale(${scale})`,
                          transformOrigin: '0 0',
                          pointerEvents: 'none',
                        }}
                      />
                    </div>
                    <div className="mt-1 flex items-baseline gap-1 text-xs">
                      <span className="font-bold text-accent">P.{i + 1}</span>
                      <span className="text-muted">
                        {pageSettingAt(d, i).cols === 2 ? '雙欄' : '單欄'}
                      </span>
                      {tags ? <span className="text-muted">{tags}</span> : null}
                    </div>
                    <div className="truncate text-xs">{pageTitleOf(d, ids)}</div>
                  </button>
                </li>
              );
            })}
          </ol>
        ) : heads.length ? (
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
            {heads.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => {
                    clickSelect(b.id);
                    revealSource(b.id);
                  }}
                  className={cn(
                    'flex w-full items-baseline gap-2 rounded-sm px-1 py-0.5 text-left text-sm hover:bg-surface-3',
                    LEVEL[b.type] <= 1 && 'font-semibold',
                  )}
                  style={{ paddingLeft: 4 + (LEVEL[b.type] ?? 1) * 10 }}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {rubyPlain(String(b.text).split('\n')[0])}
                  </span>
                  <span className="text-xs text-muted">P.{(layout.pageOf[b.id] ?? 0) + 1}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-sm text-muted">還沒有主標題或標題 1～3。</p>
        )}
      </div>
    </div>
  );
}
