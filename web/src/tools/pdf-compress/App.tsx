import { FileUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { type Shortcut, ToolShell, WindowDrop } from '@/ui';
import { addFiles, startAll } from './actions';
import { CompareDialog } from './CompareDialog';
import { MainColumn } from './FileList';
import { SettingsPanel, Usage } from './Panels';
import { TOOL_ID } from './store';
import { S } from './strings';

export function App() {
  const [compareId, setCompareId] = useState<string | null>(null);

  const shortcuts = useMemo<Shortcut[]>(
    () => [
      {
        keys: 'mod+enter',
        label: S.keys.start,
        group: S.keys.group,
        handler: () => void startAll(),
      },
      { keys: 'mod+v', label: S.keys.paste, group: S.keys.group },
    ],
    [],
  );

  return (
    <ToolShell
      toolId={TOOL_ID}
      usage={<Usage />}
      shortcuts={shortcuts}
      settings={<SettingsPanel />}
      preview={
        <>
          <MainColumn onCompare={setCompareId} />
          {/* 對話框與全視窗拖放放在外框裡（要外框的提示、通知等 Provider） */}
          <WindowDrop
            accept="application/pdf,.pdf"
            readNow={false}
            icon={<FileUp />}
            label={S.dropLabel}
            onDrop={(files) => void addFiles(files)}
            onReject={(files) => void addFiles(files)}
          />
          <CompareDialog id={compareId} onClose={() => setCompareId(null)} />
        </>
      }
    />
  );
}
