/**
 * 寫法說明（規格 F07）：快速輸入、內文的寫法、存檔、存成 PDF，最下面「讀入範例劇本」。內容本站自寫。
 */
import { BookOpen } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button, Dialog, DialogClose, Kbd } from '@/ui';
import { S } from './strings';

const C = ({ children }: { children: ReactNode }) => (
  <code className="rounded-sm bg-surface-2 px-1 font-mono text-xs">{children}</code>
);

const ROWS: readonly [ReactNode, ReactNode][] = [
  [<C key="c">## 第一章</C>, '章標題：自動加上 01、02… 的編號，列入目錄與書眉'],
  [<C key="c">### 港口的雜貨店</C>, '探索點、場景的小標題（列入目錄）'],
  [
    <C key="c">&gt; 霧從海上漫了進來。</C>,
    '描述：要唸給玩家聽的情景。連續以「>」開頭的行放進同一個框',
  ],
  [
    <>
      <C>▼【聆聽】成功</C>＋下一行起的內文
    </>,
    '檢定：▼ 那一行是標題，下一行起到空行為止是檢定的結果',
  ],
  [
    <>
      <C>:::kp 標籤</C>～<C>:::</C>
    </>,
    'KP 資訊。省略標籤時顯示「KP 資訊」',
  ],
  [
    <>
      <C>:::pl 標籤</C>～<C>:::</C>
    </>,
    '公開資訊、資料卡。省略標籤時顯示「公開資訊」',
  ],
  [
    <>
      <C>:::note 標籤</C>～<C>:::</C>
    </>,
    '補充說明。省略標籤時顯示「補充」',
  ],
  [
    <>
      <C>:::warn 標籤</C>～<C>:::</C>
    </>,
    '注意事項。省略標籤時顯示「注意」',
  ],
  [<C key="c">===換頁===</C>, '從這裡換到新的一頁'],
  [<C key="c">【偵查】</C>, '技能名稱（醒目的字色）'],
  [
    <C key="c">SANc（0/1d3）</C>,
    '理智檢定（醒目的色塊）。「SAN 檢定(1/1d6)」「SC（0/1）」「理智檢定（0/1）」也可以',
  ],
  [<C key="c">| STR | CON |</C>, '表格：NPC、怪物的資料（第二行寫 |:-:| 置中）'],
  [
    <>
      <C>**粗體**</C>・<C>*著重號*</C>・<C>- 清單</C>
    </>,
    '一般的 Markdown 也能用。換行就是換行，空一行分成新的段落',
  ],
];

export function HelpDialog({
  open,
  onOpenChange,
  onSample,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSample: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={S.help.title}
      size="lg"
      footer={<DialogClose />}
    >
      <div className="flex flex-col gap-4 text-sm leading-relaxed [&_h3]:m-0 [&_h3]:text-sm [&_h3]:font-bold [&_ul]:m-0 [&_ul]:list-disc [&_ul]:pl-5">
        <section className="flex flex-col gap-1">
          <h3>快速輸入</h3>
          <ul>
            <li>
              在行首打 <Kbd>/</Kbd>（全形的「／」也可以）會跳出格式選單；接著打 <C>kp</C>、
              <C>檢定</C> 之類的字可以篩選，用 <Kbd>↑</Kbd> <Kbd>↓</Kbd> 選擇、
              <Kbd>Enter</Kbd> 插入、<Kbd>Esc</Kbd>{' '}
              關閉。注音輸入法會把「/」打成「ㄥ」，請先切到英數，或改用格式按鈕。
            </li>
            <li>先選取幾行文字再按格式按鈕（描述、KP 資訊…），會用那個格式把選取的行包起來。</li>
            <li>插入的範本裡，要換掉的文字會先選取起來，直接打字就能取代。</li>
            <li>
              點紙面上的段落會跳到內文的那一行；在內文移動游標時，紙面上對應的段落會加上外框。
            </li>
            <li>標題、作者、建議人數等資訊寫在「封面與概要」分頁。</li>
          </ul>
        </section>
        <section className="flex flex-col gap-1">
          <h3>內文的寫法</h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th className="py-1.5 pr-3 font-medium whitespace-nowrap">寫法</th>
                  <th className="py-1.5 font-medium">紙面上</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map(([a, b], i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: 固定的表格
                  <tr key={i} className="border-b border-border align-top">
                    <td className="py-1.5 pr-3">{a}</td>
                    <td className="py-1.5">{b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="flex flex-col gap-1">
          <h3>存檔</h3>
          <p className="m-0">
            內文與設定只存在這個瀏覽器裡，不會傳到任何伺服器；換瀏覽器或裝置就看不到了。重要的劇本請另外儲存一份（例如「儲存列印用
            HTML」，或把內文複製到別的地方）。
          </p>
        </section>
        <section className="flex flex-col gap-1">
          <h3>怎麼存成 PDF</h3>
          <p className="m-0">
            按「列印成 PDF」（或 <Kbd>Ctrl</Kbd>＋<Kbd>P</Kbd>），在列印對話框的目的地選「另存為
            PDF」。
            <strong>邊界選「無」</strong>、縮放維持 100%，並<strong>勾選「背景圖形」</strong>
            （建議使用 Chrome 或 Edge）。「儲存列印用 HTML」存下的是只有紙面的單一 HTML
            檔，打開後列印也能做出一樣的 PDF。
          </p>
        </section>
        <div>
          <Button icon={<BookOpen />} onClick={onSample}>
            {S.help.sample}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
