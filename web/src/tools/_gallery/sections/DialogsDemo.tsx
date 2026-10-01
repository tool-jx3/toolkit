import { Copy, Info } from 'lucide-react';
import { useState } from 'react';
import { copyText } from '@/core/files';
import type { ToolEntry } from '@/registry';
import {
  Button,
  Dialog,
  DialogClose,
  GroupTabs,
  Kbd,
  Notice,
  Section,
  ShortcutHelp,
  Tooltip,
  UsageSection,
  useConfirm,
  useToast,
} from '@/ui';

const SAMPLE_TABS: ToolEntry[] = [
  { id: 'demo-a', name: '狀態條', summary: '', group: 'G4', status: 'next' },
  { id: 'demo-b', name: '聊天視窗', summary: '', group: 'G4', status: 'next' },
  { id: 'demo-c', name: '訊息框', summary: '', group: 'G4', status: 'next' },
];

/** 對話框、確認、通知、快捷鍵說明、使用方式、群組分頁 */
export function DialogsDemo() {
  const confirm = useConfirm();
  const toast = useToast();
  const [keys, setKeys] = useState(false);
  const [answer, setAnswer] = useState<string>('（尚未詢問）');
  return (
    <div className="flex flex-col gap-3">
      <Section title="對話框 Dialog／ConfirmDialog">
        <div className="flex flex-wrap gap-2">
          <Dialog
            trigger={<Button>開啟對話框</Button>}
            title="角色資料"
            description="對話框的說明文字。Esc 或右上角關閉。"
            footer={
              <>
                <DialogClose>取消</DialogClose>
                <DialogClose variant="primary">儲存</DialogClose>
              </>
            }
          >
            <p className="m-0">這裡放表單或說明。焦點會鎖在對話框裡，關閉後回到原本的按鈕。</p>
          </Dialog>
          <Button
            onClick={async () =>
              setAnswer(
                (await confirm({
                  title: '套用範本？',
                  description: '目前的設定會被取代。',
                  confirmLabel: '套用',
                }))
                  ? '套用'
                  : '取消',
              )
            }
          >
            確認（一般）
          </Button>
          <Button
            variant="danger"
            onClick={async () =>
              setAnswer(
                (await confirm({
                  title: '刪除這個角色？',
                  description: '刪除後無法復原。',
                  confirmLabel: '刪除',
                  danger: true,
                }))
                  ? '刪除'
                  : '取消',
              )
            }
          >
            確認（危險）
          </Button>
        </div>
        <p className="m-0 text-xs text-muted" data-testid="confirm-answer">
          上次的回答：{answer}
        </p>
      </Section>
      <Section title="通知 Toast">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => toast({ title: '一般通知' })}>一般</Button>
          <Button
            onClick={() =>
              toast({ title: '已儲存', description: '專案檔已下載。', tone: 'success' })
            }
          >
            成功
          </Button>
          <Button onClick={() => toast({ title: '檔案超過 5 MB', tone: 'warning' })}>警告</Button>
          <Button
            onClick={() =>
              toast({ title: '匯出失敗', description: '記憶體不足。', tone: 'danger' })
            }
          >
            錯誤
          </Button>
        </div>
      </Section>
      <Section title="狀態訊息 Notice">
        <Notice>已載入 3 個檔案。</Notice>
        <Notice tone="progress">處理中（2／3）…</Notice>
        <Notice tone="success">完成！可以下載了。</Notice>
        <Notice tone="warning">有 1 個檔案超過 5 MB。</Notice>
        <Notice tone="danger" action={<Button size="sm">重試</Button>}>
          無法讀取「立繪.png」，檔案可能已損壞。
        </Notice>
        <Button
          icon={<Copy />}
          onClick={async () => {
            const ok = await copyText('┌──────┐\n│　大成功　│\n└──────┘');
            toast({ title: ok ? '已複製到剪貼簿' : '無法複製', tone: ok ? 'success' : 'danger' });
          }}
        >
          複製文字（copyText）
        </Button>
      </Section>
      <Section title="快捷鍵 ShortcutHelp／Kbd">
        <p className="m-0 text-sm">
          在頁面任何地方按 <Kbd>?</Kbd> 開啟快捷鍵說明；<Kbd>空白鍵</Kbd> 播放／暫停示範動畫。
        </p>
        <Button onClick={() => setKeys(true)}>開啟快捷鍵說明（自訂清單）</Button>
        <ShortcutHelp
          open={keys}
          onOpenChange={setKeys}
          shortcuts={[
            { keys: 'mod+s', label: '存成專案檔', group: '檔案' },
            { keys: 'mod+e', label: '匯出', group: '檔案' },
            /* allowInInput：在輸入框裡也作用，說明裡會標示出來 */
            { keys: 'mod+shift+enter', label: '切換編號', group: '檔案', allowInInput: true },
            { keys: ['arrowleft', 'arrowright'], label: '上一格／下一格', group: '播放' },
          ]}
        />
      </Section>
      <Section title="提示 Tooltip">
        <Tooltip content="提示文字：滑鼠停留或鍵盤聚焦時出現。">
          <Button icon={<Info />}>停在我上面</Button>
        </Tooltip>
      </Section>
      <Section title="群組分頁 GroupTabs">
        <p className="m-0 text-xs text-muted">
          實際使用時從 registry 讀同群組的工具；這裡用示範資料。
        </p>
        <GroupTabs toolId="demo-b" tools={SAMPLE_TABS} />
      </Section>
      <UsageSection persistKey="_gallery:demo">
        <ol>
          <li>拖入立繪圖片，或按 Ctrl＋V 貼上。</li>
          <li>調整左邊的設定，右邊即時預覽。</li>
          <li>選格式後按「匯出」，完成後下載。</li>
        </ol>
      </UsageSection>
    </div>
  );
}
