import { Copy, Info, Lock, Pencil, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { diagnosticText } from '@/core/diagnostics';
import { copyText } from '@/core/files';
import {
  interactiveFileName,
  scriptJson,
  standaloneDocument,
  styleText,
  widgetId,
} from '@/core/interactive';
import { encodeShareHash, shareTooLong } from '@/core/share';
import type { ToolEntry } from '@/registry';
import {
  Button,
  ContextMenu,
  type ContextMenuState,
  CopyDiagnostics,
  contextMenuPoint,
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
import { GuidedTour } from '@/ui/GuidedTour';
import { InteractiveHtmlDialog, ShareLinkDialog } from '@/ui/InteractiveHtmlDialog';

const SAMPLE_TABS: ToolEntry[] = [
  { id: 'demo-a', name: '狀態條', summary: '', group: 'G4', status: 'next' },
  { id: 'demo-b', name: '聊天視窗', summary: '', group: 'G4', status: 'next' },
  { id: 'demo-c', name: '訊息框', summary: '', group: 'G4', status: 'next' },
];

/** 出錯時附上「複製錯誤資訊」：core/diagnostics 整理文字（哪一步、瀏覽器回報的錯誤、檔案、裝置），CopyDiagnostics 複製 */
function DiagnosticsNotice() {
  const [details, setDetails] = useState<string | null>(null);
  useEffect(() => {
    void diagnosticText({
      tool: '元件展示頁',
      summary: '無法讀取：範例.jpg',
      fields: [['處理方式', 'Worker']],
      items: [
        {
          title: '範例.jpg',
          fields: [
            ['步驟', '解碼圖片（createImageBitmap）'],
            ['錯誤', 'InvalidStateError: The source image could not be decoded.'],
          ],
        },
      ],
    }).then(setDetails);
  }, []);
  return (
    <Notice tone="danger" action={details ? <CopyDiagnostics text={details} /> : undefined}>
      無法讀取：範例.jpg
    </Notice>
  );
}

/** 示範用的互動 HTML：一顆按了會計數的按鈕（互動程式是一個自給自足的函式，原樣放進 <script>） */
function demoCounter(root: HTMLElement, cfg: { label: string }): void {
  let n = 0;
  const b = root.querySelector('button') as HTMLButtonElement;
  b.addEventListener('click', () => {
    n++;
    b.textContent = `${cfg.label} ${n}`;
  });
}

async function buildDemoHtml() {
  const id = widgetId('demo');
  const css = `#${id} button{padding:8px 16px;font:inherit}`;
  const snippet = `<div id="${id}"><button type="button">按我</button></div>
<style>
${styleText(css)}
</style>
<script>
(function () {
  var mount = (${demoCounter.toString()});
  mount(document.getElementById(${scriptJson(id)}), ${scriptJson({ label: '按了' })});
})();
</script>`;
  return {
    snippet,
    standalone: standaloneDocument({ title: '示範', css: 'body{margin:16px}', body: snippet }),
  };
}

const DEMO_HTML_STRINGS = {
  title: '互動 HTML',
  lead: '做成可以玩的網頁。',
  note: '複製下面的程式碼貼進能貼 HTML 的網站，或下載成獨立的網頁檔。',
  generating: '正在產生…',
  failed: '產生失敗：',
  code: '程式碼',
  copy: '複製程式碼',
  copied: '已複製程式碼',
  size: (bytes: string) => `約 ${bytes}`,
  download: '下載 HTML',
  open: '開新視窗試玩',
  popupBlocked: '瀏覽器擋住了新視窗',
  popupBlockedHint: '請允許這個網站開新視窗',
};

const DEMO_SHARE_STRINGS = {
  title: '分享連結',
  lead: '把設定放進網址。',
  note: '開連結的人只會看到這個畫面。',
  generating: '正在產生…',
  tooLong: '連結太長，放不進網址。',
  link: '連結',
  copy: '複製連結',
  copied: '已複製連結',
  count: (n: number, max: number) =>
    `內容 ${n.toLocaleString('en-US')} 字（上限 ${max.toLocaleString('en-US')} 字）`,
  open: '開啟連結',
};

/** 互動 HTML 與分享連結的對話框（InteractiveHtmlDialog、ShareLinkDialog；核心零件 core/interactive、core/share） */
function InteractiveDemo() {
  const [htmlOpen, setHtmlOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const build = useCallback(buildDemoHtml, []);
  const url = `${location.origin}${location.pathname}${encodeShareHash({ demo: 'x'.repeat(40) }, { version: 1, key: 'demo' })}`;
  return (
    <Section title="互動 HTML／分享連結 InteractiveHtmlDialog／ShareLinkDialog">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setHtmlOpen(true)}>互動 HTML</Button>
        <Button onClick={() => setShareOpen(true)}>分享連結</Button>
      </div>
      <InteractiveHtmlDialog
        open={htmlOpen}
        onOpenChange={setHtmlOpen}
        strings={DEMO_HTML_STRINGS}
        build={build}
        fileName={interactiveFileName('示範', '')}
        data-testid="interactive-demo"
      />
      <ShareLinkDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        strings={DEMO_SHARE_STRINGS}
        url={url}
        tooLong={shareTooLong(url.slice(url.indexOf('#')), 8000)}
        maxLength={8000}
        data-testid="share-demo"
      />
    </Section>
  );
}

/** 對話框、確認、通知、快捷鍵說明、使用方式、群組分頁 */
export function DialogsDemo() {
  const confirm = useConfirm();
  const toast = useToast();
  const [keys, setKeys] = useState(false);
  const [answer, setAnswer] = useState<string>('（尚未詢問）');
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [picked, setPicked] = useState('（還沒選）');
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
          <Button
            onClick={() =>
              toast({
                title: '已刪除 1 個',
                action: {
                  label: '復原',
                  onClick: () => toast({ title: '已復原', tone: 'success' }),
                },
              })
            }
          >
            附帶動作
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
        <DiagnosticsNotice />
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
      <Section title="右鍵選單 ContextMenu">
        <button
          type="button"
          className="w-full rounded-md border border-dashed border-border-strong px-3 py-6 text-sm text-muted"
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu({
              ...contextMenuPoint(e),
              items: [
                { label: '重新命名', icon: <Pencil />, onSelect: () => setPicked('重新命名') },
                { label: '鎖定', icon: <Lock />, onSelect: () => setPicked('鎖定') },
                {
                  label: '刪除',
                  icon: <Trash2 />,
                  danger: true,
                  separatorBefore: true,
                  onSelect: () => setPicked('刪除'),
                },
              ],
            });
          }}
          data-testid="context-menu-demo"
        >
          在這裡按右鍵（或聚焦後按 Shift＋F10）
        </button>
        <p className="m-0 text-xs text-muted">選了：{picked}</p>
        <ContextMenu state={menu} onClose={() => setMenu(null)} aria-label="示範選單" />
      </Section>
      <Section title="提示 Tooltip">
        <Tooltip content="提示文字：滑鼠停留或鍵盤聚焦時出現。">
          <Button icon={<Info />}>停在我上面</Button>
        </Tooltip>
      </Section>
      <InteractiveDemo />
      <Section title="群組分頁 GroupTabs">
        <p className="m-0 text-xs text-muted">
          實際使用時從 registry 讀同群組的工具；這裡用示範資料。
        </p>
        <GroupTabs toolId="demo-b" tools={SAMPLE_TABS} />
      </Section>
      <TourDemo />
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

/** GuidedTour：照亮一個地方、旁邊放說明卡片（height-board 的操作導覽） */
function TourDemo() {
  const [step, setStep] = useState<number | null>(null);
  return (
    <Section title="操作導覽 GuidedTour">
      <p className="m-0 text-xs text-muted" data-gallery-tour="text">
        畫面變暗、照亮一個地方，旁邊放說明卡片；上一步／下一步、略過、Esc。導覽中後面的畫面點不到、快捷鍵不作用。
      </p>
      <div>
        <Button data-gallery-tour="start" onClick={() => setStep(0)}>
          開始導覽範例
        </Button>
      </div>
      <GuidedTour
        open={step !== null}
        step={step ?? 0}
        onStepChange={setStep}
        onClose={() => setStep(null)}
        steps={[
          {
            title: '這是按鈕',
            body: '照亮的地方可以是一個元素。',
            target: () => document.querySelector('[data-gallery-tour="start"]'),
          },
          {
            title: '這是說明',
            body: '也可以是好幾個元素（取外接範圍）或一個範圍。',
            target: () => [...document.querySelectorAll('[data-gallery-tour]')],
          },
        ]}
      />
    </Section>
  );
}
