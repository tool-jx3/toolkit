/**
 * 預覽（規格 F44～F47）：兩頁 A4 角色卡放在可縮放的檢視區（PagedViewport）；配合寬度、縮小、放大；
 * 排好後量每個會被截掉的欄位（data-fit），有文字放不下時提醒。
 */
import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { mmToPx, stepZoom } from '@/core/paged';
import { Button, IconButton, Notice, PagedViewport, type PagedViewportHandle } from '@/ui';
import { type Sheet, SKILL_SLOTS, WEAPON_SLOTS } from './model';
import { usePortraitUrl } from './portrait';
import { SheetView } from './SheetView';
import { SCREEN_CSS, SHEET_CSS } from './sheetCss';
import { useView } from './store';
import { S } from './strings';

const ZOOM_MIN = 0.2;
const ZOOM_MAX = 3;
const FIT_MAX = 1.5;

/** 預覽排好的頁面（列印、匯出 PNG 用） */
export const previewApi: { pages: () => HTMLElement[] } = { pages: () => [] };

/** 放不下的欄位（名稱，依頁面上的順序） */
export const useOverflow = create<{ fields: string[] }>(() => ({ fields: [] }));

function useSheetStyle(): void {
  useLayoutEffect(() => {
    let el = document.getElementById('coc-sheet-style') as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement('style');
      el.id = 'coc-sheet-style';
      document.head.appendChild(el);
    }
    el.textContent = `${SHEET_CSS}\n${SCREEN_CSS}`;
  }, []);
}

/** 量 data-fit 的元素：內容比框大（超過 1 px；`data-fit-axis` 決定量寬、高或兩者）的列出來 */
export function overflowingFields(root: ParentNode): string[] {
  const out: string[] = [];
  for (const el of root.querySelectorAll<HTMLElement>('[data-fit]')) {
    const axis = el.dataset.fitAxis ?? 'xy';
    const x = axis.includes('x') && el.scrollWidth > el.clientWidth + 1;
    const y = axis.includes('y') && el.scrollHeight > el.clientHeight + 1;
    if (x || y) {
      const label = el.dataset.fitLabel ?? el.dataset.fit ?? '';
      if (label && !out.includes(label)) out.push(label);
    }
  }
  return out;
}

export function Preview({ sheet }: { sheet: Sheet }) {
  useSheetStyle();
  const zoomSetting = useView((v) => v.data.zoom);
  const vp = useRef<PagedViewportHandle>(null);
  const host = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(1);
  const portraitUrl = usePortraitUrl(sheet.portrait);
  const overflow = useOverflow((s) => s.fields);

  useEffect(() => {
    previewApi.pages = () => [...(host.current?.querySelectorAll<HTMLElement>('.cs-page') ?? [])];
    return () => {
      previewApi.pages = () => [];
    };
  }, []);

  /* 配合寬度的倍率：檢視區寬度改變時重算 */
  useLayoutEffect(() => {
    const s = vp.current?.scroller;
    if (!s) return;
    const measure = () => {
      if (s.clientWidth > 0) setFit(vp.current?.fitWidthZoom(ZOOM_MIN, FIT_MAX) ?? 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(s);
    return () => ro.disconnect();
  }, []);

  /* 排好之後量放不下的欄位；字型載入後再量一次 */
  // biome-ignore lint/correctness/useExhaustiveDependencies: 角色卡或頭像改變就重量
  useLayoutEffect(() => {
    const h = host.current;
    if (!h) return;
    const measure = () => useOverflow.setState({ fields: overflowingFields(h) });
    measure();
    const fonts = document.fonts;
    fonts?.addEventListener?.('loadingdone', measure);
    return () => fonts?.removeEventListener?.('loadingdone', measure);
  }, [sheet, portraitUrl]);

  const z = zoomSetting === 'fit' ? fit : zoomSetting;
  const setZoom = (v: number | 'fit') => useView.getState().patch({ zoom: v });
  const step = (dir: number) => {
    const next = stepZoom(z, dir);
    if (next !== null) setZoom(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, next)));
  };

  const notices: string[] = [];
  if (sheet.skills.length > SKILL_SLOTS) notices.push(S.skills.printLimit(sheet.skills.length));
  if (sheet.weapons.length > WEAPON_SLOTS) notices.push(S.combat.printLimit(sheet.weapons.length));
  if (overflow.length) notices.push(S.preview.overflow(overflow.join('、')));

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label={S.preview.zoom}>
        <IconButton
          label={S.preview.zoomOut}
          icon={<ZoomOut />}
          size="sm"
          onClick={() => step(-1)}
          disabled={z <= ZOOM_MIN + 0.001}
        />
        <span className="w-12 text-center text-sm tabular-nums" data-testid="zoom-value">
          {Math.round(z * 100)}%
        </span>
        <IconButton
          label={S.preview.zoomIn}
          icon={<ZoomIn />}
          size="sm"
          onClick={() => step(1)}
          disabled={z >= ZOOM_MAX - 0.001}
        />
        <Button
          size="sm"
          variant={zoomSetting === 'fit' ? 'secondary' : 'ghost'}
          icon={<Maximize2 />}
          aria-pressed={zoomSetting === 'fit'}
          onClick={() => setZoom('fit')}
        >
          {S.preview.fit}
        </Button>
      </div>
      {notices.length ? (
        <Notice tone="warning">
          <span data-testid="print-warnings">
            {notices.map((t) => (
              <span key={t} className="block">
                {t}
              </span>
            ))}
          </span>
        </Notice>
      ) : null}
      <PagedViewport
        ref={vp}
        zoom={z}
        onZoomChange={(nz) => setZoom(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, nz)))}
        contentWidth={mmToPx(210)}
        minZoom={ZOOM_MIN}
        maxZoom={ZOOM_MAX}
        padding={12}
        aria-label={S.preview.region}
        className="h-[60dvh] rounded-md bg-surface-2 lg:h-[calc(100dvh-21rem)] lg:min-h-80"
      >
        <div ref={host} data-testid="sheet-paper">
          <SheetView sheet={sheet} portraitUrl={portraitUrl} screen />
        </div>
      </PagedViewport>
    </div>
  );
}
