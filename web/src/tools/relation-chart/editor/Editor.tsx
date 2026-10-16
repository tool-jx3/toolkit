/**
 * 編輯畫面的版面：上方編輯列；寬畫面左邊角色與關係類型清單、中間畫布（下方分頁列）、右邊編輯面板／分頁設定，
 * 打開檔案庫時在最下面（編輯區跟著變矮）；窄畫面依序往下排（畫布在上；打開編輯面板時面板緊接在畫布下面），檔案庫蓋滿畫面。
 */
import { useEffect } from 'react';
import { useChoice, useConfirm, useToast, WindowDrop } from '@/ui';
import { assets, onPersistError, referencedImages, useProject, useUi } from '../state/store';
import { S } from '../strings';
import { CanvasView } from './CanvasView';
import { CharList } from './CharList';
import { AlignDialog, LayoutDialog } from './dialogs/ArrangeDialogs';
import { AvatarCropDialog } from './dialogs/AvatarCropDialog';
import { BatchCreateDialog } from './dialogs/BatchCreateDialog';
import { CanvasDialog } from './dialogs/CanvasDialog';
import { ExportDialog } from './dialogs/ExportDialog';
import { CopyTableDialog, PasteTableDialog, SamplesDialog } from './dialogs/TableDialogs';
import { EditorBar } from './EditorBar';
import { FontsDialog } from './FontUi';
import { FramesDialog } from './FrameUi';
import { bindFileUi, OPEN_ACCEPT, openDroppedFile } from './files';
import { useFontFaces } from './fontFaces';
import { Inspector } from './Inspector';
import { handleKeyDown } from './keys';
import { LibraryDrawer } from './LibraryDrawer';
import { RadarCompareDialog, RadarTplDialog } from './RadarUi';
import { SheetBar } from './SheetBar';
import { stopSim, watchReheat } from './sim';
import { TypeList } from './TypeList';

export function Editor() {
  const toast = useToast();
  const confirm = useConfirm();
  const choose = useChoice();
  const panelOpen = useUi((u) => u.panel !== null || u.sel.length >= 2);
  /* 唯讀瀏覽：左右兩欄與檔案庫藏起來（只留畫布與分頁列） */
  const readonly = useUi((u) => u.readonly);
  /* 匯入的字型註冊成 FontFace（畫布、清單、面板都用得到） */
  useFontFaces(useProject((s) => s.data.fonts));

  useEffect(() => {
    bindFileUi({ toast, confirm, choose });
    let warned = false;
    onPersistError(() => {
      if (warned) return;
      warned = true;
      toast({ title: S.project.storageFull, tone: 'warning', duration: 8000 });
    });
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      bindFileUi(null);
      onPersistError(null);
      window.removeEventListener('keydown', handleKeyDown);
      stopSim();
    };
  }, [toast, confirm, choose]);

  useEffect(() => watchReheat(), []);

  /* 開頁的整理：以前留下、沒人用的圖（狀態與復原紀錄都沒用到）刪掉 */
  useEffect(() => {
    const t = setTimeout(() => {
      void assets.gcStale(referencedImages()).catch(() => {});
    }, 3000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex min-w-0 flex-col gap-2" data-testid="relation-chart">
      <WindowDrop
        accept={OPEN_ACCEPT}
        label={S.project.dropHint}
        onDrop={(files) => {
          if (files[0]) void openDroppedFile(files[0]);
        }}
      />
      <EditorBar />
      <div className="flex min-w-0 flex-col gap-2 lg:h-[calc(100dvh-9.5rem)] lg:min-h-[36rem]">
        <div
          className={
            readonly
              ? 'grid min-w-0 grid-cols-1 gap-2 lg:min-h-[14rem] lg:flex-1'
              : 'grid min-w-0 grid-cols-1 gap-2 lg:min-h-[14rem] lg:flex-1 lg:grid-cols-[15rem_minmax(0,1fr)_19rem] xl:grid-cols-[16rem_minmax(0,1fr)_21rem]'
          }
          data-readonly={readonly ? '' : undefined}
        >
          {readonly ? null : (
            <section
              aria-label={`${S.chars.title}、${S.types.title}`}
              className={`flex min-h-0 min-w-0 flex-col gap-2 lg:order-1 ${panelOpen ? 'order-3' : 'order-2'}`}
            >
              <div className="flex min-h-0 flex-col rounded-lg border border-border bg-surface p-2 lg:flex-[3]">
                <CharList />
              </div>
              <div className="flex min-h-0 flex-col rounded-lg border border-border bg-surface p-2 lg:flex-[2]">
                <TypeList />
              </div>
            </section>
          )}
          <section
            aria-label={S.view.canvasLabel}
            className="order-1 flex min-h-0 min-w-0 flex-col gap-2 lg:order-2"
          >
            <CanvasView />
            <SheetBar />
          </section>
          {readonly ? null : (
            <section
              aria-label={S.panel.title}
              className={`flex min-h-0 min-w-0 flex-col lg:order-3 ${panelOpen ? 'order-2' : 'order-3'}`}
            >
              <Inspector />
            </section>
          )}
        </div>
        {readonly ? null : <LibraryDrawer />}
      </div>
      <BatchCreateDialog />
      <PasteTableDialog />
      <CopyTableDialog />
      <SamplesDialog />
      <LayoutDialog />
      <AlignDialog />
      <CanvasDialog />
      <ExportDialog />
      <AvatarCropDialog />
      <FramesDialog />
      <FontsDialog />
      <RadarCompareDialog />
      <RadarTplDialog />
    </div>
  );
}
