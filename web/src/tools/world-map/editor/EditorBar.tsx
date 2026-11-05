/**
 * 編輯列：地圖的標題、範本與自動產生、復原、重做、編輯用／公開預覽、匯出圖片。
 */
import { Download, LayoutTemplate, Redo2, Undo2 } from 'lucide-react';
import { historyGesture, useUndoRedo } from '@/core/storage';
import { Button, IconButton, Segmented, TextInput, withShortcut } from '@/ui';
import { LIMITS } from '../model/types';
import { S } from '../strings';
import * as act from './actions';
import { setEditor, useDoc, useEditor } from './store';

const g = historyGesture(useDoc);

export function EditorBar() {
  const { canUndo, canRedo } = useUndoRedo(useDoc);
  const audience = useEditor((s) => s.audience);
  const draft = useEditor((s) => s.draftCount);
  const title = useDoc((s) => s.data.title);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5" data-testid="editor-bar">
      <Button
        size="sm"
        variant="primary"
        icon={<LayoutTemplate />}
        onClick={() => setEditor({ samplesOpen: true })}
        data-testid="open-samples"
      >
        {S.bar.samples}
      </Button>
      <TextInput
        value={title}
        maxLength={LIMITS.title}
        aria-label={S.bar.title}
        className="h-7 w-48 min-w-0 max-w-full text-sm"
        data-testid="map-title"
        onFocus={g.begin}
        onBlur={g.commit}
        onChange={(e) =>
          useDoc.getState().update((d) => {
            d.title = e.target.value;
          })
        }
      />
      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        <IconButton
          size="sm"
          variant="ghost"
          icon={<Undo2 />}
          label={withShortcut(S.bar.undo, 'mod+z')}
          disabled={!canUndo && !draft}
          onClick={act.undo}
          data-testid="undo"
        />
        <IconButton
          size="sm"
          variant="ghost"
          icon={<Redo2 />}
          label={withShortcut(S.bar.redo, 'shift+mod+z')}
          disabled={!canRedo}
          onClick={act.redo}
          data-testid="redo"
        />
        <Segmented
          size="sm"
          aria-label={S.bar.view}
          value={audience}
          onValueChange={(v) => act.setAudience(v)}
          options={[
            { value: 'gm', label: S.bar.gm },
            { value: 'player', label: S.bar.pl },
          ]}
        />
        <Button
          size="sm"
          variant="secondary"
          icon={<Download />}
          onClick={() => setEditor({ exportOpen: true })}
          data-testid="export-open"
        >
          {S.bar.export}
        </Button>
      </div>
    </div>
  );
}
