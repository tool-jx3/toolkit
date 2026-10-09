/**
 * 編輯畫面的版面：上方編輯列；寬畫面左邊素材、中間畫布（下方樓層列）、右邊屬性；窄畫面依序往下排（畫布在上）。
 */
import { useEffect } from 'react';
import { useConfirm, useToast, WindowDrop } from '@/ui';
import { S } from '../strings';
import { bindUi, bindView, notify } from './actions';
import { CanvasArea } from './CanvasArea';
import { editor } from './controller';
import { EditorBar } from './EditorBar';
import { ExportDialog } from './ExportDialog';
import { FloorBar } from './FloorBar';
import { openFile } from './files';
import { handleKeyDown, handleKeyUp } from './keys';
import { Library } from './Library';
import { PropsPanel } from './PropsPanel';
import { onPersistError } from './store';
import { TemplateDialog } from './TemplateDialog';
import { installTestHook } from './testHook';

export function Editor() {
  const toast = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    bindUi(toast, confirm);
    bindView({ fit: () => editor.fitView(), reset: () => editor.resetView() });
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
      bindView(null);
      onPersistError(null);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [toast, confirm]);

  return (
    <div className="flex min-w-0 flex-col gap-2" data-testid="floor-plan">
      <WindowDrop
        accept=".json,.zip,.trpgmap,application/json,application/zip"
        label={S.project.dropHint}
        onDrop={(files) => {
          if (files[0]) void openFile(files[0]);
        }}
      />
      <EditorBar />
      <div className="grid min-w-0 grid-cols-1 gap-2 lg:h-[calc(100dvh-9.5rem)] lg:min-h-[36rem] lg:grid-cols-[15rem_minmax(0,1fr)_17rem] xl:grid-cols-[17rem_minmax(0,1fr)_19rem]">
        <section
          aria-label={S.lib.label}
          className="order-3 flex min-h-0 min-w-0 flex-col lg:order-1"
        >
          <Library />
        </section>
        <section
          aria-label="畫布"
          className="order-1 flex min-h-0 min-w-0 flex-col gap-2 lg:order-2"
        >
          <CanvasArea />
          <FloorBar />
        </section>
        <section
          aria-label={S.props.label}
          className="order-2 flex min-h-0 min-w-0 flex-col lg:order-3"
        >
          <PropsPanel />
        </section>
      </div>
      <TemplateDialog />
      <ExportDialog />
    </div>
  );
}
