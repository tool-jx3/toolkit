/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 檔案庫（原作的 F193 抽屜：setLibDrawer、setLibDrawerTab、LIB_ACTIONS、檢視層級與大小）：
 * 分頁列的「檔案庫」鈕打開／收起。寬畫面放在編輯區下方（頂端把手上下拖＝高度，中間分隔線左右拖＝左欄寬，
 * 都記在這台瀏覽器）；窄畫面蓋滿整個畫面。頂列：頁籤、搜尋、依分頁分組、收起；下方：這個頁籤的模式鈕、
 * 檢視層級（最少／一般／詳細）與項目大小（小／中／大）。
 * 這一批只有「標籤庫」一個頁籤（其他的庫隨之後的批次加進 TABS；沒有內容的頁籤不顯示）。
 */
import { Layers, X } from 'lucide-react';
import { type PointerEvent, useEffect, useRef, useState } from 'react';
import { IconButton, Segmented, TextInput } from '@/ui';
import { setPrefs, setUi, usePrefs, useUi } from '../state/store';
import { S } from '../strings';
import { LABEL_ACTIONS, LabelList, LabelSide, runLabelAction } from './LabelLibrary';

const MIN_H = 160;
const MIN_SIDE = 140;
const MIN_LIST = 220;

/** 頁籤（之後的批次在這裡加：角色庫、關係庫、分頁庫…） */
const TABS = [{ key: 'labels', label: S.lib.tabs.labels }] as const;

/** 寬畫面（≥ 1024 px）：抽屜放在編輯區下方；窄畫面蓋滿畫面 */
function useWide(): boolean {
  const q = '(min-width: 1024px)';
  const [wide, setWide] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches,
  );
  useEffect(() => {
    const m = window.matchMedia?.(q);
    if (!m) return;
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

const maxH = () => Math.max(MIN_H, Math.round(window.innerHeight - 380));
const clampH = (h: number) => Math.max(MIN_H, Math.min(maxH(), h));

export function closeLibrary(): void {
  setUi({ libOpen: false, libMode: null, libEdit: null });
}

export function LibraryDrawer() {
  const open = useUi((u) => u.libOpen);
  const mode = useUi((u) => u.libMode);
  const prefs = usePrefs((p) => p.data);
  const wide = useWide();
  const [query, setQuery] = useState('');
  const [h, setH] = useState<number | null>(null);
  const [sideW, setSideW] = useState<number | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const drag = useRef<{ kind: 'h' | 'w'; start: number; base: number } | null>(null);
  if (!open) return null;
  const height = clampH(h ?? prefs.libH ?? Math.max(window.innerHeight * 0.4, 300));
  const side = sideW ?? prefs.libSideW;

  const down = (kind: 'h' | 'w') => (e: PointerEvent<HTMLElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      kind,
      start: kind === 'h' ? e.clientY : e.clientX,
      base: kind === 'h' ? height : side,
    };
  };
  const move = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === 'h') setH(clampH(d.base + (d.start - e.clientY)));
    else {
      const total = body.current?.clientWidth ?? 800;
      setSideW(Math.max(MIN_SIDE, Math.min(total - MIN_LIST, d.base + e.clientX - d.start)));
    }
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.kind === 'h' && h !== null) setPrefs({ libH: h });
    if (d.kind === 'w' && sideW !== null) setPrefs({ libSideW: Math.round(sideW) });
  };

  return (
    <section
      aria-label={S.lib.title}
      className={
        wide
          ? 'relative flex min-h-0 shrink-0 flex-col rounded-lg border border-border bg-surface'
          : 'fixed inset-0 z-40 flex flex-col bg-surface'
      }
      style={wide ? { height } : undefined}
      data-testid="library"
    >
      {wide ? (
        // biome-ignore lint/a11y/useSemanticElements: 可以拖曳的分隔把手（hr 不能放內容、不能拖）
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label={S.lib.resizeH}
          title={S.lib.resizeH}
          className="absolute inset-x-0 -top-1.5 z-10 flex h-3 cursor-ns-resize touch-none items-center justify-center"
          onPointerDown={down('h')}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          data-testid="library-resize"
        >
          <span className="h-1 w-10 rounded-full bg-border-strong" />
        </div>
      ) : null}
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold">{S.lib.title}</h2>
        <div role="tablist" aria-label={S.lib.tabsLabel} className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected
              className="rounded-full border border-accent px-3 py-0.5 text-sm font-semibold text-accent"
              data-testid={`library-tab-${t.key}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-1">
          <TextInput
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={S.lib.search}
            aria-label={S.lib.search}
            className="h-8 w-36 min-w-0 text-sm sm:w-48"
            data-testid="library-search"
          />
          {query ? (
            <IconButton size="sm" icon={<X />} label={S.lib.clear} onClick={() => setQuery('')} />
          ) : null}
          <IconButton
            size="sm"
            icon={<Layers />}
            label={S.lib.group}
            pressed={prefs.labelsBySheet}
            onClick={() => setPrefs({ labelsBySheet: !prefs.labelsBySheet })}
            data-testid="library-group"
          />
          <IconButton
            size="sm"
            icon={<X />}
            label={S.lib.close}
            onClick={closeLibrary}
            data-testid="library-close"
          />
        </div>
      </header>
      <div
        ref={body}
        className={wide ? 'flex min-h-0 flex-1' : 'flex min-h-0 flex-1 flex-col overflow-auto'}
      >
        <aside
          className={wide ? 'min-h-0 shrink-0 overflow-auto p-3' : 'border-b border-border p-3'}
          style={wide ? { width: side } : undefined}
          data-testid="library-side"
        >
          <LabelSide />
        </aside>
        {wide ? (
          // biome-ignore lint/a11y/useSemanticElements: 可以拖曳的分隔線
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={S.lib.resizeW}
            title={S.lib.resizeW}
            className="w-1.5 shrink-0 cursor-ew-resize touch-none border-x border-border bg-surface-2 hover:bg-accent/30"
            onPointerDown={down('w')}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            data-testid="library-divider"
          />
        ) : null}
        <div className={wide ? 'min-h-0 min-w-0 flex-1 overflow-auto p-3' : 'p-3'}>
          <LabelList query={query} />
        </div>
      </div>
      <footer className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2">
        <fieldset className="m-0 flex items-center gap-1 border-0 p-0" aria-label={S.lib.actions}>
          {LABEL_ACTIONS.map((a) => (
            <IconButton
              key={a.key}
              size="sm"
              icon={a.icon}
              label={a.tip}
              pressed={a.key === 'add' ? undefined : mode === a.key}
              variant={a.tone === 'danger' && mode === a.key ? 'danger' : undefined}
              onClick={() => runLabelAction(a.key)}
              data-testid={`library-act-${a.key}`}
            />
          ))}
        </fieldset>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Segmented
            size="sm"
            value={prefs.libLevel}
            onValueChange={(v) => setPrefs({ libLevel: v })}
            aria-label={S.lib.level}
            options={(['min', 'normal', 'detail'] as const).map((v) => ({
              value: v,
              label: S.lib.levels[v],
              ariaLabel: S.lib.levelTips[v],
            }))}
          />
          <Segmented
            size="sm"
            value={prefs.libSize}
            onValueChange={(v) => setPrefs({ libSize: v })}
            aria-label={S.lib.size}
            options={(['sm', 'md', 'lg'] as const).map((v) => ({
              value: v,
              label: S.lib.sizes[v],
            }))}
          />
        </div>
      </footer>
    </section>
  );
}
