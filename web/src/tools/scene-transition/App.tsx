import { Redo2, Undo2 } from 'lucide-react';
import { useUndoRedo } from '@/core/storage';
import { IconButton, type Shortcut, ToolShell, withShortcut } from '@/ui';
import { PreviewPane } from './Preview';
import {
  AdvancedSection,
  CaptionSection,
  EffectSection,
  LookSection,
  ShapeSection,
  TimeSection,
} from './panels';
import { TOOL_ID } from './settings';
import { redo, undo, useSt } from './store';
import { S } from './strings';

const USAGE = (
  <ul>
    {S.usage.map((line) => (
      <li key={line}>{line}</li>
    ))}
  </ul>
);

/* Ctrl／⌘＋Z 復原；Ctrl／⌘＋Y、Ctrl／⌘＋Shift＋Z 重做（文字欄、對話框裡不作用，規格 F63） */
const SHORTCUTS: Shortcut[] = [
  { keys: 'mod+z', label: S.undo, group: '編輯', handler: undo },
  { keys: ['mod+y', 'shift+mod+z'], label: S.redo, group: '編輯', handler: redo },
];

export function App() {
  const { canUndo, canRedo } = useUndoRedo(useSt);
  return (
    <ToolShell
      toolId={TOOL_ID}
      usage={USAGE}
      shortcuts={SHORTCUTS}
      headerActions={
        <>
          <IconButton
            label={withShortcut(S.undo, 'mod+z')}
            icon={<Undo2 />}
            onClick={undo}
            disabled={!canUndo}
          />
          <IconButton
            label={withShortcut(S.redo, 'mod+y')}
            icon={<Redo2 />}
            onClick={redo}
            disabled={!canRedo}
          />
        </>
      }
      settings={
        <>
          <EffectSection />
          <LookSection />
          <ShapeSection />
          <TimeSection />
          <CaptionSection />
          <AdvancedSection />
        </>
      }
      preview={<PreviewPane />}
    />
  );
}
