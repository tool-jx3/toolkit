import { Box, PanelsTopLeft, Redo2, Sparkles, Undo2 } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useSaveError, useSaveStatus, useUndoRedo } from '@/core/storage';
import {
  IconButton,
  ProjectMenu,
  type Shortcut,
  Tabs,
  ToolShell,
  UsageSection,
  useToast,
  withShortcut,
} from '@/ui';
import { getEngine, notify, setToaster } from './actions';
import { DioramaTab } from './DioramaTab';
import { type Kind, normalizeKind, TOOL_ID } from './model';
import { Preview } from './Preview';
import { exportPlan } from './plan';
import {
  collectGarbage,
  openProject,
  type ProjectData,
  projectData,
  projectFiles,
  resetAll,
} from './project';
import { ShakerTab } from './ShakerTab';
import { BackgroundSection, LightSection, MaterialSection } from './SharedSections';
import { StandTab } from './StandTab';
import {
  edit,
  kindNow,
  PROJECT_VERSION,
  requestRebuild,
  setKind,
  settingsNow,
  useSession,
  useSettings,
  useView,
} from './store';
import { S } from './strings';

const USAGE = (
  <>
    <ol>
      {S.usage.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ol>
    <p>{S.about}</p>
  </>
);

/** ToolShell 裡的 toast 交給 actions；設定存不進去時提醒 */
function Bootstrap() {
  const toast = useToast();
  const saveError = useSaveError(TOOL_ID);
  useEffect(() => {
    setToaster(toast);
    return () => setToaster(null);
  }, [toast]);
  useEffect(() => {
    if (saveError) toast({ title: S.project.settingsNotSaved, tone: 'warning' });
  }, [saveError, toast]);
  return null;
}

declare global {
  interface Window {
    __acrylicGoods?: unknown;
  }
}

/** 測試與對等驗證用的入口 */
function useTestHook() {
  useEffect(() => {
    const v3 = (v: { x: number; y: number; z: number }) => [v.x, v.y, v.z];
    window.__acrylicGoods = {
      settings: () => settingsNow(),
      kind: () => kindNow(),
      session: () => {
        const { info, error, building, exporting, immersive, seed } = useSession.getState();
        return { info, error, building, exporting, immersive, seed };
      },
      set: (path: string, value: unknown) =>
        edit((d) => {
          const keys = path.split('.');
          // biome-ignore lint/suspicious/noExplicitAny: 測試入口
          let o: any = d;
          for (const k of keys.slice(0, -1)) o = o[k];
          o[keys[keys.length - 1]] = value;
        }),
      plan: (fps: number) => exportPlan(kindNow(), settingsNow().spin, fps),
      engine: () => {
        const e = getEngine();
        if (!e) return null;
        const b = e.build;
        return {
          camera: v3(e.view.camera.position),
          target: v3(e.view.controls.target),
          rotation: b ? v3(b.root.rotation) : null,
          spin: e.spin,
          keyLight: { position: v3(e.key.position), intensity: e.key.intensity },
          ambient: e.ambient.intensity,
          fill: { position: v3(e.fill.position), intensity: e.fill.intensity },
          sides: b?.sides ? { front: b.sides.front.visible, back: b.sides.back.visible } : null,
          parts: b?.shaker?.physics.parts.map((p) => v3(p.body.position)) ?? [],
          gravity: b?.shaker ? v3(b.shaker.physics.world.gravity) : null,
          shake: { ...e.shake },
          gyro: e.gyro,
          layers:
            b?.layers.map((l) => ({
              id: l.id,
              position: v3(l.group.position),
              rotationY: l.group.rotation.y,
            })) ?? [],
          bufferSize: { ...e.view.size },
          outputColorSpace: e.view.renderer.outputColorSpace,
          running: e.view.running,
        };
      },
      /** 停住／繼續預覽的算繪迴圈（截圖用） */
      pause: () => getEngine()?.view.stop(),
      resume: () => getEngine()?.view.start(),
      /** 立刻畫一次，回傳畫布上 (x, y) 的顏色（繪圖緩衝區座標） */
      pixel: (x: number, y: number) => {
        const e = getEngine();
        if (!e) return null;
        e.view.render();
        const c = document.createElement('canvas');
        c.width = e.view.size.width;
        c.height = e.view.size.height;
        const ctx = c.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(e.view.canvas, 0, 0);
        return Array.from(ctx.getImageData(x, y, 1, 1).data);
      },
      resetCamera: () => getEngine()?.resetCamera(),
      orbit: (a: number, p: number) => getEngine()?.view.orbit(a, p),
      shake: (dx: number, dy: number) => getEngine()?.addShake(dx, dy),
      rotateTo: (y: number) => {
        const b = getEngine()?.build;
        if (b) b.root.rotation.y = y;
        getEngine()?.view.invalidate();
      },
    };
    return () => {
      window.__acrylicGoods = undefined;
    };
  }, []);
}

const TAB_ICONS: Record<Kind, React.ReactNode> = {
  stand: <Sparkles aria-hidden />,
  shaker: <PanelsTopLeft aria-hidden />,
  diorama: <Box aria-hidden />,
};

export function App() {
  const savedAt = useSaveStatus(TOOL_ID);
  const { undo, redo, canUndo, canRedo } = useUndoRedo(useSettings);
  const kind = normalizeKind(useView((st) => st.data.kind));
  const exporting = useSession((st) => st.exporting);
  useTestHook();
  useEffect(() => {
    void collectGarbage();
  }, []);

  const shortcuts = useMemo<Shortcut[]>(
    () => [
      { keys: 'mod+z', label: S.keys.undo, group: S.keys.edit, handler: undo },
      { keys: ['shift+mod+z', 'mod+y'], label: S.keys.redo, group: S.keys.edit, handler: redo },
      {
        keys: 'alt+shift+c',
        label: S.keys.resetCamera,
        group: S.keys.view,
        handler: () => getEngine()?.resetCamera(),
      },
      {
        keys: 'alt+shift+g',
        label: S.keys.rebuild,
        group: S.keys.view,
        handler: requestRebuild,
      },
      {
        keys: ['arrowleft', 'arrowright', 'arrowup', 'arrowdown'],
        label: S.keys.orbit,
        group: S.keys.view,
      },
      { keys: ['+', '-'], label: S.keys.zoom, group: S.keys.view },
      { keys: 'home', label: S.keys.resetCamera, group: S.keys.view },
      { keys: 'space', label: S.keys.kick, group: S.keys.view },
    ],
    [undo, redo],
  );

  const tabs: { value: Kind; content: React.ReactNode }[] = [
    { value: 'stand', content: <StandTab /> },
    { value: 'shaker', content: <ShakerTab /> },
    { value: 'diorama', content: <DioramaTab /> },
  ];

  return (
    <ToolShell
      toolId={TOOL_ID}
      usage={USAGE}
      shortcuts={shortcuts}
      headerActions={
        <>
          <IconButton
            label={withShortcut(S.undo, 'mod+z')}
            icon={<Undo2 />}
            onClick={undo}
            disabled={!canUndo || exporting}
          />
          <IconButton
            label={withShortcut(S.redo, 'shift+mod+z')}
            icon={<Redo2 />}
            onClick={redo}
            disabled={!canRedo || exporting}
          />
          <ProjectMenu<ProjectData>
            toolId={TOOL_ID}
            version={PROJECT_VERSION}
            getData={projectData}
            getFiles={projectFiles}
            openAccept=".zip,.json,application/zip,application/json"
            onLoad={async (data, project, files) => {
              const dropped = await openProject(data, project.version, files);
              if (dropped) notify({ title: S.project.missing(dropped), tone: 'warning' });
              return true;
            }}
            onReset={resetAll}
            resetText={{ title: S.project.resetTitle, description: S.project.resetText }}
            resetDisabled={exporting}
            savedAt={savedAt}
          />
        </>
      }
      settings={
        <>
          <Bootstrap />
          <UsageSection persistKey="acrylic-goods">{USAGE}</UsageSection>
          <Tabs<Kind>
            aria-label={S.kindsAria}
            value={kind}
            onValueChange={setKind}
            items={tabs.map((t) => ({
              value: t.value,
              label: S.kinds[t.value],
              icon: TAB_ICONS[t.value],
              content: t.content,
              disabled: exporting && t.value !== kind,
            }))}
          />
          <MaterialSection />
          <LightSection />
          <BackgroundSection />
        </>
      }
      preview={<Preview />}
    />
  );
}
