/**
 * 編輯畫面的版面：上方編輯列；寬畫面左邊三個分頁、中間畫布、右邊屬性；窄畫面依序往下排（畫布、屬性、分頁）。
 */
import { useEffect } from 'react';
import { useConfirm, useToast, WindowDrop } from '@/ui';
import { S } from '../strings';
import { bindUi, notify } from './actions';
import { CanvasArea } from './CanvasArea';
import { EditorBar } from './EditorBar';
import { ExportDialog } from './ExportDialog';
import { openFile, PROJECT_ACCEPT } from './files';
import { Inspector } from './Inspector';
import { handleKeyDown, handleKeyUp } from './keys';
import { LeftPanel } from './LeftPanel';
import { StartDialog } from './StartDialog';
import { onPersistError } from './store';
import { installTestHook } from './testHook';

export function Editor() {
  const toast = useToast();
  const confirm = useConfirm();
  useEffect(() => {
    bindUi(toast, confirm);
    let warned = false;
    onPersistError(() => {
      if (warned) return;
      warned = true;
      notify(S.msg.storageFull, 'warning', { duration: 6000 });
    });
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    installTestHook();
    return () => {
      bindUi(null, null);
      onPersistError(null);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [toast, confirm]);

  return (
    <div className="flex min-w-0 flex-col gap-2" data-testid="cross-section">
      <WindowDrop
        accept={PROJECT_ACCEPT}
        label={S.project.dropHint}
        onDrop={(files) => {
          if (files[0]) void openFile(files[0]);
        }}
      />
      <EditorBar />
      <div className="grid min-w-0 grid-cols-1 gap-2 lg:h-[calc(100dvh-9.5rem)] lg:min-h-[36rem] lg:grid-cols-[17rem_minmax(0,1fr)_16rem] xl:grid-cols-[19rem_minmax(0,1fr)_18rem]">
        <section
          aria-label={S.tabs.build}
          className="order-3 flex min-h-0 min-w-0 flex-col lg:order-1"
        >
          <LeftPanel />
        </section>
        <section aria-label={S.canvas} className="order-1 flex min-h-0 min-w-0 flex-col lg:order-2">
          <CanvasArea />
        </section>
        <section
          aria-label={S.inspector.label}
          className="order-2 flex min-h-0 min-w-0 flex-col lg:order-3"
        >
          <Inspector />
        </section>
      </div>
      <ExportDialog />
      <StartDialog />
    </div>
  );
}
