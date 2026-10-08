/**
 * 編輯畫面（規格 1.2～1.18）：編輯列、工具列、屬性面板、畫布（動作列、確定／取消列、匯出範圍）、狀態列、圖層面板。
 * 畫布由 MapEngine（Fabric）管理；這裡負責版面、開啟與儲存、右鍵選單、拖放圖片。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, ContextMenu, type ContextMenuState, Notice, WindowDrop } from '@/ui';
import { addImageFile, cancelExport } from './actions';
import { ActionBar } from './editor/ActionBar';
import { EditorBar } from './editor/EditorBar';
import { ExportDialog } from './editor/ExportDialog';
import { contextItems } from './editor/menu';
import { StatusBar } from './editor/StatusBar';
import { ToolRail } from './editor/ToolRail';
import { MapEngine } from './engine/engine';
import { renderRegion } from './engine/export';
import { toggleTextStyle } from './engine/ops';
import { LayersPanel } from './panels/LayersPanel';
import { SidePanel } from './panels/SidePanel';
import { getEngine, setRuntime, useRuntime } from './runtime';
import { MapSession } from './session';
import { getMapData, getMeta } from './storage';
import { INITIAL_EDITOR, setEditor, useEditor } from './stores';
import { S } from './strings';

declare global {
  interface Window {
    /** 測試與對等驗證用 */
    __mapEditor?: MapEditorTestHook;
  }
}

interface MapEditorTestHook {
  engine: MapEngine | null;
  session: MapSession | null;
  /** 匯出範圍畫成 PNG（data URL；對等驗證用） */
  exportPng: (
    rect: { x: number; y: number; w: number; h: number },
    opts?: { scale?: number; background?: 'transparent' | 'white'; grid?: boolean },
  ) => string | null;
}

function testHook(engine: MapEngine | null, session: MapSession | null): MapEditorTestHook {
  return {
    engine,
    session,
    exportPng: (rect, opts = {}) =>
      engine
        ? renderRegion(engine.canvas, rect, {
            scale: opts.scale ?? 1,
            background: opts.background ?? 'transparent',
            grid: opts.grid ?? true,
            setExporting: (v) => engine.setExporting(v),
          }).toDataURL('image/png')
        : null,
  };
}

export interface EditorProps {
  id: string;
  onBack: () => void;
  onMissing: () => void;
}

export function Editor({ id, onBack, onMissing }: EditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const missingRef = useRef(onMissing);
  missingRef.current = onMissing;
  const exportMode = useEditor((s) => s.exportMode);
  const mapName = useEditor((s) => s.mapName);
  const finish = useEditor((s) => s.finish);
  const tool = useEditor((s) => s.tool);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let session: MapSession | null = null;
    useEditor.setState({ ...INITIAL_EDITOR });
    const eng = new MapEngine(host);
    eng.onContextMenu = (p) => setMenu({ ...p, items: contextItems(eng) });
    setRuntime({ engine: eng, session: null });
    window.__mapEditor = testHook(eng, null);
    const ro = new ResizeObserver(() => eng.resize(host.clientWidth, host.clientHeight));
    ro.observe(host);
    void (async () => {
      try {
        const meta = await getMeta(id);
        const data = meta ? await getMapData(id) : null;
        if (disposed) return;
        if (!meta || !data) {
          missingRef.current();
          return;
        }
        setEditor({ mapId: id, mapName: meta.name, gridType: data.gridType });
        await eng.load(data);
        if (disposed) return;
        session = new MapSession(meta, eng);
        setRuntime({ session });
        window.__mapEditor = testHook(eng, session);
        setState('ready');
      } catch {
        if (!disposed) setState('error');
      }
    })();
    return () => {
      disposed = true;
      ro.disconnect();
      const s = session;
      if (s) void s.flush().finally(() => s.dispose());
      eng.dispose();
      if (useRuntime.getState().engine === eng) setRuntime({ engine: null, session: null });
      if (window.__mapEditor?.engine === eng) window.__mapEditor = testHook(null, null);
    };
  }, [id]);

  /* 分頁標題（F021） */
  useEffect(() => {
    if (mapName) document.title = S.docTitle(mapName);
  }, [mapName]);

  /* Ctrl＋B／I／U：只在選取或編輯文字時作用（其他時候交給瀏覽器） */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      const k = e.key.toLowerCase();
      const style = k === 'b' ? 'bold' : k === 'i' ? 'italic' : k === 'u' ? 'underline' : null;
      const eng = getEngine();
      if (!style || !eng) return;
      if (toggleTextStyle(eng, style)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const back = useCallback(async () => {
    await useRuntime.getState().session?.flush();
    onBack();
  }, [onBack]);

  const onDropFiles = useCallback(
    async (files: File[], at: { clientX: number; clientY: number }) => {
      const eng = getEngine();
      const host = hostRef.current;
      if (!eng || !host) return;
      const r = host.getBoundingClientRect();
      const inside =
        at.clientX >= r.left &&
        at.clientX <= r.right &&
        at.clientY >= r.top &&
        at.clientY <= r.bottom;
      for (const f of files)
        await addImageFile(f, inside ? eng.clientToWorld(at.clientX, at.clientY) : undefined);
    },
    [],
  );

  return (
    <div className="flex min-w-0 flex-col gap-2" data-testid="map-editor">
      <WindowDrop
        accept="image/*"
        onDrop={(f, at) => void onDropFiles(f, at)}
        label={S.image.pick}
      />
      <EditorBar onBack={() => void back()} />
      {state === 'error' ? <Notice tone="danger">{S.editor.loadFailed}</Notice> : null}
      <div
        className="grid min-w-0 grid-cols-1 gap-2 lg:h-[calc(100dvh-9.5rem)] lg:min-h-[34rem] lg:grid-cols-[auto_18rem_minmax(0,1fr)] xl:grid-cols-[auto_18rem_minmax(0,1fr)_16rem]"
        data-tool={tool}
      >
        <ToolRail className="order-1 lg:order-1" />
        <SidePanel className="order-3 lg:order-2 lg:min-h-0" />
        <section
          aria-label="畫布"
          className="order-2 flex min-h-0 min-w-0 flex-col gap-1 lg:order-3"
        >
          <div className="relative h-[58dvh] min-h-[18rem] w-full min-w-0 overflow-hidden rounded-md border border-border lg:h-auto lg:flex-1">
            <div
              ref={hostRef}
              className="checker absolute inset-0 touch-none select-none"
              data-testid="map-canvas"
            />
            {state === 'loading' ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted">
                {S.editor.loading}
              </div>
            ) : null}
            <ActionBar />
            {exportMode === 'pick' ? (
              <div
                className="absolute top-2 left-1/2 flex max-w-[calc(100%-1rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-sm shadow-2"
                data-testid="export-banner"
              >
                <span>{S.exportDialog.pickBanner}</span>
                <Button size="sm" variant="ghost" onClick={cancelExport}>
                  {S.exportDialog.cancel}
                </Button>
              </div>
            ) : null}
            {finish.active ? <FinishBar canFinish={finish.canFinish} /> : null}
          </div>
          <StatusBar />
        </section>
        <LayersPanel className="order-4 hidden min-h-0 xl:order-4 xl:flex" />
      </div>
      <ExportDialog />
      <ContextMenu state={menu} onClose={() => setMenu(null)} aria-label={S.context.label} />
    </div>
  );
}

function FinishBar({ canFinish }: { canFinish: boolean }) {
  return (
    <div
      role="toolbar"
      aria-label={S.finish.bar}
      className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2 rounded-md border border-border bg-surface p-1.5 shadow-2"
      data-testid="finish-bar"
    >
      <Button size="sm" onClick={() => getEngine()?.cancelDraw()}>
        {S.finish.cancel}
      </Button>
      <Button
        size="sm"
        variant="primary"
        disabled={!canFinish}
        onClick={() => getEngine()?.finishDraw()}
      >
        {S.finish.ok}
      </Button>
    </div>
  );
}
