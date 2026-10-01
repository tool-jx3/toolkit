import { Redo2, Undo2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSaveStatus, useUndoRedo } from '@/core/storage';
import {
  IconButton,
  ProjectMenu,
  type Shortcut,
  Tabs,
  ToolShell,
  UsageSection,
  usePlayback,
} from '@/ui';
import { DemoPreview } from './DemoPreview';
import { createDemoSource, DEMO_DEFAULTS, type DemoSettings } from './demo';
import { ObsPreview } from './obs/ObsPreview';
import { ColorsFontsDemo } from './sections/ColorsFontsDemo';
import { ControlsDemo } from './sections/ControlsDemo';
import { DemoSettingsPanel } from './sections/DemoSettingsPanel';
import { DialogsDemo } from './sections/DialogsDemo';
import { ImagesDemo } from './sections/ImagesDemo';
import { ModulesDemo } from './sections/ModulesDemo';
import { ObsDemo } from './sections/ObsDemo';
import { TemplatesDemo } from './sections/TemplatesDemo';
import { useDemo } from './store';
import { S } from './strings';

export function App() {
  const settings = useDemo((s) => s.data);
  const savedAt = useSaveStatus('_gallery');
  const { undo, redo, canUndo, canRedo } = useUndoRedo(useDemo);
  const source = useMemo(() => createDemoSource(settings), [settings]);
  const playback = usePlayback({ duration: source.duration });
  /* 「OBS 疊加」分頁時，預覽欄換成 CSS 預覽 */
  const [tab, setTab] = useState('demo');

  const shortcuts: Shortcut[] = [
    { keys: 'space', label: '播放／暫停', group: '播放', handler: () => playback.toggle() },
    { keys: 'r', label: '重播', group: '播放', handler: () => playback.onRestart() },
    { keys: 'mod+z', label: '復原', group: '編輯', handler: undo },
    { keys: ['shift+mod+z', 'mod+y'], label: '重做', group: '編輯', handler: redo },
  ];

  return (
    <ToolShell
      toolId="_gallery"
      shortcuts={shortcuts}
      usage={<p>{S.usage}</p>}
      headerActions={
        <>
          <IconButton label="復原（Ctrl＋Z）" icon={<Undo2 />} onClick={undo} disabled={!canUndo} />
          <IconButton
            label="重做（Ctrl＋Shift＋Z）"
            icon={<Redo2 />}
            onClick={redo}
            disabled={!canRedo}
          />
          <ProjectMenu<DemoSettings>
            toolId="_gallery"
            getData={() => useDemo.getState().data}
            onLoad={(data) => useDemo.getState().replace({ ...DEMO_DEFAULTS, ...data })}
            onReset={() => useDemo.getState().reset()}
            savedAt={savedAt}
            fileName="元件展示"
          />
        </>
      }
      settings={
        <>
          <UsageSection persistKey="_gallery" defaultOpen>
            <p>{S.usage}</p>
          </UsageSection>
          <Tabs
            aria-label="展示分類"
            value={tab}
            onValueChange={setTab}
            items={[
              { value: 'demo', label: '示範動畫', content: <DemoSettingsPanel /> },
              { value: 'controls', label: '控制項', content: <ControlsDemo /> },
              { value: 'colors', label: '顏色與字型', content: <ColorsFontsDemo /> },
              { value: 'images', label: '圖片', content: <ImagesDemo /> },
              { value: 'dialogs', label: '對話框', content: <DialogsDemo /> },
              { value: 'templates', label: '範本', content: <TemplatesDemo /> },
              { value: 'modules', label: '模組', content: <ModulesDemo /> },
              { value: 'obs', label: 'OBS 疊加', content: <ObsDemo /> },
            ]}
          />
        </>
      }
      preview={tab === 'obs' ? <ObsPreview /> : <DemoPreview source={source} playback={playback} />}
    />
  );
}
