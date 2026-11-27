/**
 * 編輯列：範例與新的、作品名、四種環境（1～4）、淹水、GM 用／PL 用（G）、復原、重做、匯出圖片。
 */
import { Download, LayoutTemplate, Redo2, Undo2, Waves } from 'lucide-react';
import { historyGesture, useUndoRedo } from '@/core/storage';
import { Button, IconButton, Segmented, TextInput, withShortcut } from '@/ui';
import { CAPS, ENV_IDS, type EnvId, RANGES } from '../model/types';
import { S } from '../strings';
import * as act from './actions';
import { openExport } from './ExportDialog';
import { setEditor, useDoc, useEditor } from './store';

const g = historyGesture(useDoc);

export function EditorBar() {
  const { canUndo, canRedo } = useUndoRedo(useDoc);
  const audience = useEditor((s) => s.audience);
  const title = useDoc((s) => s.data.title);
  const env = useDoc((s) => s.data.env);
  const flood = useDoc((s) => s.data.flood);
  const level = useDoc((s) => s.data.floodLevel);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5" data-testid="editor-bar">
      <Button
        size="sm"
        variant="primary"
        icon={<LayoutTemplate />}
        onClick={() => setEditor({ startOpen: true })}
        data-testid="open-start"
      >
        {S.bar.start}
      </Button>
      <TextInput
        value={title}
        maxLength={CAPS.title}
        aria-label={S.bar.title}
        className="h-7 w-44 min-w-0 max-w-full text-sm"
        data-testid="doc-title"
        onFocus={g.begin}
        onBlur={g.commit}
        onChange={(e) =>
          useDoc.getState().update((d) => {
            d.title = e.target.value;
          })
        }
      />
      <Segmented
        size="sm"
        aria-label={S.bar.env}
        value={env}
        onValueChange={(v: EnvId) => act.setEnv(v)}
        options={ENV_IDS.map((v) => ({ value: v, label: S.envs[v] }))}
        className="max-w-full"
      />
      <Button
        size="sm"
        variant={flood ? 'primary' : 'secondary'}
        icon={<Waves />}
        aria-pressed={flood}
        onClick={act.toggleFlood}
        data-testid="flood-toggle"
      >
        {flood ? S.bar.floodPct(level || RANGES.flood.def) : S.bar.flood}
      </Button>
      <div className="ml-auto flex flex-wrap items-center gap-1.5">
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
        <IconButton
          size="sm"
          variant="ghost"
          icon={<Undo2 />}
          label={withShortcut(S.bar.undo, 'mod+z')}
          disabled={!canUndo}
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
        <Button
          size="sm"
          variant="secondary"
          icon={<Download />}
          onClick={(e) => openExport(e.currentTarget)}
          data-testid="export-open"
        >
          {S.bar.export}
        </Button>
      </div>
    </div>
  );
}
