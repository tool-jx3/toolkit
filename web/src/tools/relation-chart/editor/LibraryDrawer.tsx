/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 檔案庫（原作的 F193 抽屜：setLibDrawer、setLibDrawerTab、LIB_ACTIONS、檢視層級與大小）：
 * 分頁列的「檔案庫」鈕打開／收起。寬畫面放在編輯區下方（頂端把手上下拖＝高度，中間分隔線左右拖＝左欄寬，
 * 都記在這台瀏覽器）；窄畫面蓋滿整個畫面。頂列：頁籤、搜尋、依分頁分組、收起；下方：這個頁籤的模式鈕、
 * 檢視層級（最少／一般／詳細）與項目大小（小／中／大）。
 * 頁籤：角色庫、關係庫、標籤庫、分頁庫｜便利貼庫、快照｜連線總表、設定集（原作的三組；第五批補上分頁庫與快照）。
 * 換頁籤＝模式關掉、搜尋清空。
 */
import { Layers, X } from 'lucide-react';
import { Fragment, type PointerEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { IconButton, Segmented, TextInput } from '@/ui';
import { type LibMode, type LibTab, setPrefs, setUi, usePrefs, useUi } from '../state/store';
import { S } from '../strings';
import { CHAR_ACTIONS, CharLibList, CharLibSide } from './CharLibrary';
import {
  LABEL_ACTIONS,
  LabelList,
  LabelSide,
  type LibAction,
  runLabelAction,
} from './LabelLibrary';
import { NOTE_ACTIONS, NoteLibList, NoteLibSide } from './NoteLibrary';
import { GSET_ACTIONS, GsetList, GsetSide } from './PresetLibrary';
import { REL_ACTIONS, RelLibList, RelLibSide } from './RelLibrary';
import { RelTableList, RelTableSide, TABLE_ACTIONS } from './RelTable';
import { SHEETLIB_ACTIONS, SheetLibList, SheetLibSide } from './SheetLibrary';
import { SnapList, SnapSide } from './SnapLibrary';

const MIN_H = 160;
const MIN_SIDE = 140;
const MIN_LIST = 220;

/** 頁籤（原作的三組：角色庫｜關係庫｜標籤庫｜分頁庫 ‖ 便利貼庫｜快照 ‖ 連線總表｜設定集）；sep＝前面放分隔線 */
const TABS: readonly { key: LibTab; sep?: boolean }[] = [
  { key: 'chars' },
  { key: 'rels' },
  { key: 'labels' },
  { key: 'sheets' },
  { key: 'notes', sep: true },
  { key: 'snaps' },
  { key: 'table', sep: true },
  { key: 'gsets' },
];

const ACTIONS: Record<LibTab, readonly LibAction[]> = {
  chars: CHAR_ACTIONS,
  rels: REL_ACTIONS,
  labels: LABEL_ACTIONS,
  sheets: SHEETLIB_ACTIONS,
  notes: NOTE_ACTIONS,
  snaps: [],
  table: TABLE_ACTIONS,
  gsets: GSET_ACTIONS,
};

/** 有「依分頁分組」的頁籤 */
const GROUPABLE: ReadonlySet<LibTab> = new Set(['chars', 'rels', 'labels']);

/** 模式鈕：標籤庫的「新增」是馬上加；其他＝切換模式（互斥，再按＝關閉） */
function runAction(tab: LibTab, key: LibAction['key']): void {
  if (tab === 'labels') {
    runLabelAction(key);
    return;
  }
  /* 進出模式都保留選取與左欄的詳情：模式中點詳情裡的變體＝對那一件動作（照原作，7.8） */
  const u = useUi.getState();
  setUi({ libMode: u.libMode !== key ? (key as LibMode) : null });
}

export function switchLibTab(tab: LibTab): void {
  setUi({ libTab: tab, libMode: null, libEdit: null, libPick: null, snapPick: null });
}

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
  setUi({ libOpen: false, libMode: null, libEdit: null, libLabelPick: false });
}

export function LibraryDrawer() {
  const open = useUi((u) => u.libOpen);
  const mode = useUi((u) => u.libMode);
  const tab = useUi((u) => u.libTab);
  const prefs = usePrefs((p) => p.data);
  const wide = useWide();
  const [query, setQuery] = useState('');
  /* 換頁籤＝搜尋清空 */
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在換頁籤時清
  useEffect(() => setQuery(''), [tab]);
  const [h, setH] = useState<number | null>(null);
  const [sideW, setSideW] = useState<number | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const drag = useRef<{ kind: 'h' | 'w'; start: number; base: number } | null>(null);
  if (!open) return null;
  const height = clampH(h ?? prefs.libH ?? Math.max(window.innerHeight * 0.4, 300));
  const side = sideW ?? prefs.libSideW;
  const grouped = tab === 'labels' ? prefs.labelsBySheet : prefs.libGroup;
  const sideBody: ReactNode =
    tab === 'chars' ? (
      <CharLibSide />
    ) : tab === 'rels' ? (
      <RelLibSide />
    ) : tab === 'table' ? (
      <RelTableSide query={query} />
    ) : tab === 'notes' ? (
      <NoteLibSide />
    ) : tab === 'gsets' ? (
      <GsetSide />
    ) : tab === 'sheets' ? (
      <SheetLibSide />
    ) : tab === 'snaps' ? (
      <SnapSide />
    ) : (
      <LabelSide />
    );
  const listBody: ReactNode =
    tab === 'chars' ? (
      <CharLibList query={query} />
    ) : tab === 'rels' ? (
      <RelLibList query={query} />
    ) : tab === 'table' ? (
      <RelTableList query={query} />
    ) : tab === 'notes' ? (
      <NoteLibList query={query} />
    ) : tab === 'gsets' ? (
      <GsetList query={query} />
    ) : tab === 'sheets' ? (
      <SheetLibList query={query} />
    ) : tab === 'snaps' ? (
      <SnapList query={query} />
    ) : (
      <LabelList query={query} />
    );

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
      /* 分隔線本身也佔寬：夾限要扣掉它，右欄才真的留得到 220（原作的 applyLibSideWidth） */
      const total = body.current?.clientWidth ?? 800;
      const split = e.currentTarget.getBoundingClientRect().width;
      const max = Math.max(MIN_SIDE, total - MIN_LIST - split);
      setSideW(Math.max(MIN_SIDE, Math.min(max, d.base + e.clientX - d.start)));
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
            <Fragment key={t.key}>
              {t.sep ? <span className="mx-0.5 w-px self-stretch bg-border" aria-hidden /> : null}
              <button
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                className={`rounded-full border px-3 py-0.5 text-sm ${
                  tab === t.key
                    ? 'border-accent font-semibold text-accent'
                    : 'border-border text-muted hover:text-fg'
                }`}
                onClick={() => switchLibTab(t.key)}
                data-testid={`library-tab-${t.key}`}
              >
                {S.lib.tabs[t.key]}
              </button>
            </Fragment>
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
          {!GROUPABLE.has(tab) ? null : (
            <IconButton
              size="sm"
              icon={<Layers />}
              label={S.lib.group}
              pressed={grouped}
              onClick={() =>
                tab === 'labels'
                  ? setPrefs({ labelsBySheet: !prefs.labelsBySheet })
                  : setPrefs({ libGroup: !prefs.libGroup })
              }
              data-testid="library-group"
            />
          )}
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
          {sideBody}
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
        <div className={wide ? 'min-h-0 min-w-0 flex-1 overflow-auto p-3' : 'p-3'}>{listBody}</div>
      </div>
      <footer className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2">
        <fieldset className="m-0 flex items-center gap-1 border-0 p-0" aria-label={S.lib.actions}>
          {ACTIONS[tab].map((a) => (
            <IconButton
              key={a.key}
              size="sm"
              icon={a.icon}
              label={a.tip}
              pressed={a.key === 'add' ? undefined : mode === a.key}
              variant={a.tone === 'danger' && mode === a.key ? 'danger' : undefined}
              onClick={() => runAction(tab, a.key)}
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
