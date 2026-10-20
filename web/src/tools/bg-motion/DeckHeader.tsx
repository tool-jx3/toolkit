/**
 * 圖片切換模式的頁首按鈕（規格 F136、F137）：復原、重做，以及「專案」選單（存成專案檔、開啟、重設）。
 */
import { Redo2, Undo2 } from 'lucide-react';
import { useEffect } from 'react';
import { useSaveError, useSaveStatus, useUndoRedo } from '@/core/storage';
import { IconButton, ProjectMenu, useToast, withShortcut } from '@/ui';
import { deckAssetIds, initialDeck } from './deck';
import { importDeckProject } from './deckProject';
import {
  assets,
  DECK_TOOL_ID,
  DECK_VERSION,
  deckNow,
  historyStep,
  resetDeck,
  useDeck,
} from './deckStore';
import { TOOL_ID } from './store';
import { DECK } from './strings';

/** 自動儲存失敗時通知一次 */
export function DeckSaveErrorNotice() {
  const toast = useToast();
  const failed = !!useSaveError(DECK_TOOL_ID);
  useEffect(() => {
    if (failed) toast({ title: DECK.saveFailed, tone: 'warning' });
  }, [failed, toast]);
  return null;
}

function ProjectActions() {
  const toast = useToast();
  const savedAt = useSaveStatus(DECK_TOOL_ID);
  const saveError = useSaveError(DECK_TOOL_ID);
  return (
    <ProjectMenu<unknown>
      toolId={TOOL_ID}
      version={DECK_VERSION}
      getData={() => deckNow()}
      getFiles={() => assets.exportFiles(deckAssetIds(deckNow()))}
      confirmOpen={{
        title: DECK.openConfirmTitle,
        description: DECK.openConfirmDesc,
        confirmLabel: DECK.openConfirmLabel,
      }}
      onLoad={async (data, _file, files) => {
        const r = await importDeckProject(data, files);
        resetDeck(r.state);
        return { warnings: [r.notSaved && DECK.projectNotSaved] };
      }}
      onNotify={(n) => {
        if (n.kind === 'opened')
          toast(
            n.warnings
              ? { title: DECK.projectOpened, description: n.warnings.join(''), tone: 'warning' }
              : { title: DECK.projectOpened, description: n.fileName, tone: 'success' },
          );
        else if (n.kind === 'saved')
          toast({ title: DECK.projectSaved, description: n.fileName, tone: 'success' });
        else if (n.kind === 'open-failed')
          toast({ title: DECK.projectOpenFailed, description: n.message, tone: 'danger' });
        else toast({ title: DECK.projectReset });
      }}
      onReset={() => resetDeck(initialDeck())}
      resetText={{ title: DECK.resetTitle, description: DECK.resetDesc }}
      savedAt={savedAt}
      statusText={saveError ? DECK.saveFailed : undefined}
    />
  );
}

export function DeckHeaderActions() {
  const { canUndo, canRedo } = useUndoRedo(useDeck);
  return (
    <>
      <IconButton
        label={withShortcut(DECK.undo, 'mod+z')}
        icon={<Undo2 />}
        onClick={() => historyStep('undo')}
        disabled={!canUndo}
      />
      <IconButton
        label={withShortcut(DECK.redo, 'shift+mod+z')}
        icon={<Redo2 />}
        onClick={() => historyStep('redo')}
        disabled={!canRedo}
      />
      <ProjectActions />
    </>
  );
}
