/**
 * 說明（F023）：開始使用、按鍵、分欄與頁面、書式、注音、圖片、字型、NPC 卡、CCFOLIA、輸出。
 */
export function Usage() {
  return (
    <div className="flex flex-col gap-3">
      <section>
        <h3 className="m-0 mb-1 text-base font-bold">開始使用</h3>
        <ul>
          <li>
            左邊「書寫」逐段寫劇本，右邊的紙面即時排成 A4
            頁面；放不下的段落自動送到下一頁（段落不會被切開）。
          </li>
          <li>
            先按書式按鈕（描述文、標題、規則框…）新增段落；選取段落時按書式按鈕是把它改成那個書式。
          </li>
          <li>
            作品自動存在這個瀏覽器裡（「作品」可以開啟別的作品、看過去的版本與垃圾桶）。清除瀏覽器資料就會消失，請不時按「儲存」存成檔案。
          </li>
        </ul>
      </section>
      <section>
        <h3 className="m-0 mb-1 text-base font-bold">按鍵</h3>
        <ul>
          <li>Enter 把段落切開；Shift＋Enter 是段落內換行；段落開頭按 Backspace 接到前一段。</li>
          <li>
            Ctrl＋Shift＋數字或英文字（或 Ctrl＋Alt＋）切換書式：0 描述文、1～3 標題、4 對話文、5
            注釋、6 規則框、8 場景轉換、9 NPC 卡…（按「?」看全部）。
          </li>
          <li>
            行首輸入「/head」「/note」「/skill」「/talk」「/table」「/list」等再按空白鍵，會換成對應的記號。
          </li>
          <li>Tab／Shift＋Tab 縮排；Ctrl＋Z 復原、Ctrl＋Y 重做；Ctrl＋S 存成檔案。</li>
        </ul>
      </section>
      <section>
        <h3 className="m-0 mb-1 text-base font-bold">分欄與頁面</h3>
        <ul>
          <li>單欄／雙欄以頁為單位設定（紙面每頁上方的「切換分欄」，或「這頁設為雙欄」）。</li>
          <li>
            雙欄頁上，設成「全寬」的段落跨兩欄，「欄內」的段落先填滿左欄再流到右欄；「換欄」把之後的段落送到下一欄。
          </li>
          <li>
            「換頁」之後一定從新的一頁開始。「頁面」分頁可以設背景、刪除頁面、建立封面頁與版權頁。
          </li>
        </ul>
      </section>
      <section>
        <h3 className="m-0 mb-1 text-base font-bold">書式與巢狀記號</h3>
        <ul>
          <li>
            描述文、注釋、規則框裡，行首「■」是小標、「※」是注釋、「&gt;」是檢定框、「-
            」是條列、「1.
            」是編號、「|項目|內容|」是表格、「「…」」是對話、「＠名稱」是彈出視窗的按鈕。
          </li>
          <li>彈出視窗的內容不放在紙面（只有按鈕），列印與 PDF 時集中在書末的附錄。</li>
        </ul>
      </section>
      <section>
        <h3 className="m-0 mb-1 text-base font-bold">注音、註解與顏色</h3>
        <ul>
          <li>
            寫成「｜本文字《注音》」就會加上注音；也可以選取文字後按「加注音」（Ctrl＋Shift＋R）。
          </li>
          <li>
            選取文字後按「加上註解」，紙面上那段文字會有點狀底線，按下顯示註解（列印時不顯示）。
          </li>
          <li>文字顏色：文字欄裡有選取文字時只改那一段，否則改整段。</li>
        </ul>
      </section>
      <section>
        <h3 className="m-0 mb-1 text-base font-bold">圖片</h3>
        <ul>
          <li>
            長邊超過 1600 px
            的圖片會先縮小。配置有行內、靠左／靠右繞排、自由配置（放在紙面上任意位置，文字可以避開）。
          </li>
        </ul>
      </section>
      <section>
        <h3 className="m-0 mb-1 text-base font-bold">字型</h3>
        <ul>
          <li>
            「文件」分頁可以從電腦的字型或檔案新增字型（嵌入原稿與匯出的
            HTML），再選內文與標題的字型。發布前請確認字型的授權。
          </li>
        </ul>
      </section>
      <section>
        <h3 className="m-0 mb-1 text-base font-bold">NPC 卡與 CCFOLIA</h3>
        <ul>
          <li>
            NPC 卡支援 Emoklore TRPG、Double Cross 3rd、克蘇魯神話 TRPG（第 6／7
            版）。欄位空白時以淡色斜體顯示自動計算的值。
          </li>
          <li>
            「複製 CCFOLIA 棋子」後到 CCFOLIA 的房間裡貼上；也可以把 CCFOLIA 的棋子或 Yutosheet
            的表格讀回來。
          </li>
          <li>表格可以輸出成 CCFOLIA 的 roll-table 指令或簡單文字。</li>
        </ul>
      </section>
      <section>
        <h3 className="m-0 mb-1 text-base font-bold">輸出</h3>
        <ul>
          <li>
            「列印 / PDF」：用瀏覽器列印（可以另存 PDF），或直接下載 PDF 檔（文字可以選取、搜尋）。
          </li>
          <li>
            「匯出」：一個 HTML
            檔，有可以遮住標題的目錄、彈出視窗、註解與複製按鈕，適合放到網路上給玩家看。
          </li>
        </ul>
      </section>
    </div>
  );
}
