/**
 * 專案選單：存成專案檔（.json）、開啟專案檔、重設；旁邊顯示自動存檔狀態。
 * 檔名、重設的確認文字可以換；存檔／開啟的結果也會通知工具（onSaved、onLoad 的第三個參數、onLoadError），
 * 讓工具寫進自己的狀態列。
 * 專案檔格式見 core/storage/project.ts。
 */
import { ChevronDown, FolderOpen, RotateCcw, Save } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import type { ReactNode } from 'react';
import { downloadText, fileNameWithExt, pickFiles } from '@/core/files';
import {
  type ProjectFile,
  ProjectFileError,
  parseProject,
  serializeProject,
} from '@/core/storage/project';
import { buttonClass } from './Button';
import { cn } from './cn';
import { type ConfirmOptions, useConfirm } from './Dialog';
import { useToast } from './Toast';

export interface ProjectMenuProps<T> {
  /** 工具 id（寫進專案檔，開啟時檢查） */
  toolId: string;
  /** 專案資料的版本（資料結構改變時加 1） */
  version?: number;
  /** 取得要存的資料 */
  getData: () => T;
  /** 開啟專案檔後套用（回傳 false 表示資料不合用，會顯示錯誤）；source 是使用者選的檔案（狀態列顯示檔名用） */
  onLoad: (data: T, file: ProjectFile<T>, source: File) => unknown;
  onReset: () => void;
  /** 最後自動存檔時間（毫秒）；null 表示還沒存過 */
  savedAt?: number | null;
  /** 專案檔名（不含副檔名，預設工具 id）；存檔時加上「_YYYYMMDD.json」 */
  fileName?: string;
  /** 完整檔名（含副檔名，例：`messagebox.message-box.json`）；給了就照用，不加日期 */
  exactFileName?: string;
  /** 存好專案檔之後（例如寫進工具自己的狀態列） */
  onSaved?: (fileName: string) => void;
  /** 開啟專案檔失敗時（訊息可直接顯示） */
  onLoadError?: (message: string) => void;
  /** 重設的確認對話框（覆寫預設的標題、說明、按鈕文字；例如「全部重來」並清空復原紀錄時） */
  resetConfirm?: Partial<ConfirmOptions>;
  /** 選單上重設項目的文字（預設「重設…」） */
  resetLabel?: ReactNode;
  /** 額外的選單項目 */
  extraItems?: ReactNode;
  className?: string;
}

const itemClass =
  'flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-fg outline-none data-highlighted:bg-accent-soft [&_svg]:size-4 [&_svg]:text-muted';

/** 選單項目（給 extraItems 用） */
export function ProjectMenuItem({
  children,
  onSelect,
  icon,
}: {
  children: ReactNode;
  onSelect: () => void;
  icon?: ReactNode;
}) {
  return (
    <DropdownMenu.Item className={itemClass} onSelect={onSelect}>
      {icon}
      {children}
    </DropdownMenu.Item>
  );
}

const time = (ms: number) =>
  new Date(ms).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });

export function ProjectMenu<T>({
  toolId,
  version = 1,
  getData,
  onLoad,
  onReset,
  savedAt,
  fileName,
  exactFileName,
  onSaved,
  onLoadError,
  resetConfirm,
  resetLabel = '重設…',
  extraItems,
  className,
}: ProjectMenuProps<T>) {
  const confirm = useConfirm();
  const toast = useToast();

  const save = () => {
    const stamp = new Date();
    const name =
      exactFileName ??
      fileNameWithExt(
        `${fileName ?? toolId}_${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, '0')}${String(stamp.getDate()).padStart(2, '0')}`,
        'json',
      );
    downloadText(serializeProject(toolId, version, getData(), stamp), name, 'application/json');
    toast({ title: '已存成專案檔', description: name, tone: 'success' });
    onSaved?.(name);
  };

  const open = async () => {
    const [file] = await pickFiles({ accept: '.json,application/json' });
    if (!file) return;
    try {
      const project = parseProject<T>(await file.text(), toolId);
      const ok = await confirm({
        title: '開啟專案檔？',
        description: `目前的設定會被「${file.name}」取代。`,
        confirmLabel: '開啟',
      });
      if (!ok) return;
      if (onLoad(project.data, project, file) === false)
        throw new ProjectFileError('專案檔的內容無法使用。');
      toast({ title: '已開啟專案檔', description: file.name, tone: 'success' });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast({ title: '無法開啟專案檔', description: message, tone: 'danger' });
      onLoadError?.(message);
    }
  };

  const reset = async () => {
    const ok = await confirm({
      title: '重設所有設定？',
      description: '會回到預設值（可以用「復原」回來）。',
      confirmLabel: '重設',
      danger: true,
      ...resetConfirm,
    });
    if (ok) {
      onReset();
      toast({ title: '已重設' });
    }
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span role="status" className="hidden text-xs text-muted sm:inline">
        {savedAt ? `已自動儲存（${time(savedAt)}）` : '設定會自動儲存'}
      </span>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger className={buttonClass('secondary', 'sm')}>
          專案
          <ChevronDown aria-hidden className="size-3.5" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={6}
            className="z-50 min-w-48 rounded-md border border-border bg-surface p-1 shadow-2"
          >
            <DropdownMenu.Item className={itemClass} onSelect={save}>
              <Save aria-hidden />
              存成專案檔…
            </DropdownMenu.Item>
            <DropdownMenu.Item className={itemClass} onSelect={open}>
              <FolderOpen aria-hidden />
              開啟專案檔…
            </DropdownMenu.Item>
            {extraItems}
            <DropdownMenu.Separator className="my-1 h-px bg-border" />
            <DropdownMenu.Item
              className={cn(itemClass, 'text-danger [&_svg]:text-danger')}
              onSelect={reset}
            >
              <RotateCcw aria-hidden />
              {resetLabel}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}
