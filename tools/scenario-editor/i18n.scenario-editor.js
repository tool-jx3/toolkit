/* scenario-editor（劇本排版台）字典。載入前需先載入 ../../assets/i18n.js。
 * ja 的值是上游 v3.3.0（sedn14636361/trpg-scenario-editor）的日文原文。 */
I18N.register({
  'zh-TW': {
    /* ---- 外殼 ---- */
    'app.name': '劇本排版台',
    'app.title': '劇本排版台',
    'nav.home': '← TRPG Toolkit',
    'lang.aria': '顯示語言',
    /* ---- 共用的按鈕文字 ---- */
    'common.dup': '複製',
    'common.delete': '刪除',
    'common.close': '關閉',
    'common.cancel': '取消',
    'common.rowAdd': '＋列',
    'common.rowDel': '−列',
    'common.preview': '查看成品',
    'common.writeHere': '寫在這裡',
    'common.optional': '可以留空',
    'common.color': '顏色',
    'common.colAdd': '＋欄',
    'common.colDel': '−欄',
    /* ---- 上方工具列 ---- */
    'top.buildStamp': '目前運作中的版本標記。回報問題時，也請一併告知這段文字',
    'top.side': '切換面板顯示',
    'top.pages': '頁面一覽',
    'top.pagesTip': '以一覽查看從封面到版權頁的所有頁面（Ctrl+Shift+P）',
    'top.prop': '設定欄',
    'top.propTip': '顯示／隱藏所選段落的設定欄（紙面旁邊）',
    'top.undo': '復原（Ctrl+Z）',
    'top.redo': '重做（Ctrl+Y）',
    'top.zoomOut': '縮小（Ctrl+減號／Ctrl+Shift+↓）',
    'top.zoomFit': '按下即配合寬度（Ctrl+0）',
    'top.zoomIn': '放大（Ctrl+加號／Ctrl+Shift+↑）',
    'top.prj': '作品',
    'top.prjTip': '選擇・新建・複製・刪除作品',
    'top.save': '儲存',
    'top.saveTip': '把目前的內容存成檔案（Ctrl+S）',
    'top.open': '開啟',
    'top.openTip': '讀入儲存的檔案',
    'top.print': '列印 / PDF',
    'top.printTip': '可以從瀏覽器的列印功能存成 PDF',
    'top.export': '匯出',
    'top.exportTip': '匯出用來發布的閱覽 HTML',
    'top.help': '說明',
    'top.helpTip': '使用方式',
    /* ---- 左側分頁 ---- */
    'tab.write': '書寫',
    'tab.page': '頁面',
    'tab.doc': '文件',
    /* ---- 「書寫」分頁 ---- */
    'blk.selected': '選取的段落',
    'blk.up': '↑ 上移',
    'blk.down': '↓ 下移',
    'blk.merge': '合併',
    'blk.add': '在下方新增',
    'blk.copyText': '複製文字',
    'blk.copyTextTip': '只複製所選段落（沒有選取則為全文）的文章',
    'blk.desel': '取消選取',
    'blk.deselTip': '變成沒有選取任何段落的狀態（按 Esc 也一樣）',
    'blk.copyBlk': '複製區塊',
    'blk.copyBlkTip': '把所選段落整個記下來（沒有選取文字時，按 Ctrl+C 也可以）',
    'blk.paste': '貼上',
    'blk.pasteTip': '把記下的段落放到下方（不在文字欄時，按 Ctrl+V 也可以）',
    'blk.cols': '分欄',
    'blk.col1': '這頁設為單欄',
    'blk.col1Tip': '把所選段落所在的頁面設為單欄',
    'blk.col2': '雙欄',
    'blk.col2Tip': '把所選段落所在的頁面設為雙欄',
    'blk.emptyPh': '（空白段落）',
    /* ---- 「頁面」分頁 ---- */
    'pg.book': '書的形式',
    'pg.mkCover': '建立封面頁',
    'pg.mkColophon': '建立版權頁',
    'pg.target': '對象頁面',
    'pg.all': '選取全部頁面',
    'pg.del': '刪除選取的頁面',
    'pg.delHint': '會連同該頁上的段落一起刪除。',
    'pg.pattern': '花紋',
    'pg.bgImg': '鋪上圖片',
    'pg.size': '大小',
    'pg.fitCover': '覆蓋整面',
    'pg.fitContain': '完整放入',
    'pg.fitRepeat': '平鋪',
    'pg.opacity': '濃度',
    'pg.apply': '套用到選取的頁面',
    'pg.clear': '移除背景',
    /* ---- 「文件」分頁 ---- */
    'doc.title': '劇本名稱（匯出的標題）',
    'doc.margin': '紙面間距（mm）',
    'doc.v': '上下',
    'doc.h': '左右',
    'doc.footer': '紙面下方（頁尾）',
    'doc.pageNum': '顯示頁碼',
    'doc.footTextPh': '固定顯示的文字（例：{title}）',
    'doc.firstNum': '第一頁的頁碼',
    'doc.tokens': '可用的代號',
    'doc.tokenList': '{title} 標題<br>{page} 頁碼<br>{total} 總頁數',
    'doc.baseSize': '內文字級（pt）',
    'doc.font': '字型',
    'doc.fontPick': '從電腦的字型選擇',
    'doc.fontAdd': '從檔案新增',
    'doc.ttcHint': 'Windows 的中日文字型多半是 .ttc，這時可以選擇裡面的字體。',
    'doc.fontBody': '內文',
    'doc.fontHead': '標題',
    'doc.fontEmbed': '也會嵌入匯出的閱覽 HTML。',
    'doc.saveHint': '除了自動儲存之外，重要的原稿也請用上方的「儲存」存成檔案。要換到其他作品，請用上方的「作品」。',
    'doc.reset': '全部清除重新開始',
    'doc.resetTip': '清除這個作品的內容（其他作品不受影響）',
    /* ---- 窗格與其他介面 ---- */
    'ui.splitter': '拖曳可以改變寬度',
    'ui.charCountTip': '內文的字數，不含書式記號・注音記號・註解',
    'ui.splitterPop': '抓住就能改變寬度',
    'ui.grip': '抓住這裡就能改變大小',
    /* ---- 左側文字欄 ---- */
    'src.viewAll': '全部',
    'src.viewAllTip': '連續顯示內文',
    'src.viewPage': '以頁為單位',
    'src.viewPageTip': '依頁分隔顯示',
    'src.span': '全寬',
    'src.popContent': '彈出視窗「{0}」的內容',
    'src.popEmpty': '（還沒有放入任何內容）',
    'src.tableContent': '表格的內容',
    'src.noName': '（未命名）',
    'src.headCol': '標題第 {0} 欄',
    'src.cell': '第 {0} 列第 {1} 欄',
    'src.break': '— 換頁 —',
    'src.colbr': '— 換欄（到下一欄） —',
    'src.npc': '［NPC 卡］',
    'src.toc': '［目錄］',
    'src.table': '［表格］',
    'src.rowsCols': '{0} 列 {1} 欄',
    'src.popup': '［彈出視窗］',
    'src.popOnly': '只從儲存格指向',
    'src.imgUnset': '［圖片 未設定］',
    'src.freeImg': '直接放在紙面上的圖片',
    'src.noCaption': '（無說明）',
    'src.handleTip': '點一下選取／拖曳移動',
    'src.offPaper': '不會出現在紙面上的項目',
    'src.modeNote': '碰到文字的段落就會被選取',
    'src.modeHelp': '查看使用方式',
    /* ---- 頁面一覽 ---- */
    'pages.pageTip': '把所有頁面縮小排列',
    'pages.toc': '標題',
    'pages.tocTip': '從主標題與標題建立目錄',
    'pages.zoom': '大小',
    'pages.tocMake': '在這個位置建立目錄區塊',
    'pages.nItems': '{0} 項',
    'pages.noText': '（無文字）',
    'pages.empty': '（空白頁）',
    'pages.nPages': '{0} 頁',
    /* ---- 段落共通設定（右側設定欄下半） ---- */
    'cm.text': '文字',
    'cm.ruby': '加注音',
    'cm.rubyTip': '替選取的文字加注音（Ctrl+Shift+R）',
    'cm.rubyHint': '也可以直接寫成 ｜本文字《注音》。',
    'cm.cols': '雙欄時的配置',
    'cm.spanTip': '跨欄放滿整個寬度',
    'cm.flowTip': '一般的內文。收在欄內流動',
    'cm.comment': '註解',
    'cm.cmtAdd': '加上註解',
    'cm.cmtAddTip': '先在左側內文中選取文字再按',
    'cm.cmtDel': '刪除這個段落的註解',
    'cm.cmtNote': '請先在內文中選取文字再按。',
    'cm.color': '文字顏色',
    'cm.colorReset': '恢復預設',
    'cm.indent': '縮排',
    'cm.indOut': '← 退回',
    'cm.indOutTip': '退回一層（Ctrl+Shift+[）',
    'cm.indIn': '→ 縮排',
    'cm.indInTip': '縮排一層（Ctrl+Shift+]）',
    'cm.wrap': '圖片文繞圖',
    'cm.clr': '解除文繞圖',
    'cm.clrTip': '選取的段落不會進到圖片旁邊，而是從圖片下方開始',
    'cm.margin': '只套用在這個段落的間距（mm）',
    'cm.top': '上',
    'cm.def': '預設',
    'cm.bottom': '下',
    /* ---- 選取狀態 ---- */
    'sel.inCol': '欄內',
    'sel.hint': '選取段落後，可以改變書式或配置方式。',
    'sel.current': '選取中：',
    'sel.many': '已選取 {0} 個段落',
    /* ---- 分欄的說明 ---- */
    'pcol.target': '對象：P.',
    'pcol.note': '分欄是以頁為單位決定的。',
    /* ---- 縮排的說明 ---- */
    'ind.now': '目前：{0} 層（最多 4 層）',
    'ind.none': '無縮排',
    'ind.note': '可以把標題 3 底下等內容往內縮一層。',
    /* ---- 成品預覽視窗 ---- */
    'prev.hint': '與匯出時的外觀相同',
    'prev.title': '{0}的成品',
    'prev.default': '成品',
    /* ---- 輸出範圍對話框 ---- */
    'out.pages': '輸出的頁面',
    'out.range': '範圍',
    'out.pageUnit': '頁',
    'out.toc': '目錄',
    'out.tocHint': '一定會附上目錄。閱讀者可以自行顯示或隱藏，為了防雷，一開始會先遮住標題。',
    'out.go': '輸出',
    'out.printTitle': '列印 / PDF',
    'out.exportTitle': '匯出閱覽 HTML',
    'out.allPages': '全部 {0} 頁',
    'out.all': '全部',
    /* ---- 右側設定欄 ---- */
    'prop.popName': '彈出視窗名稱',
    'prop.ytIn': '讀入 Yutosheet 的表格',
    'prop.ccf': 'CCFOLIA 棋子',
    'prop.pickHint': '選取段落後，只屬於那個段落的設定會出現在這裡。',
    'prop.title': '設定',
    'prop.nParas': '{0} 個段落',
    'prop.tableTitle': '表格設定',
    'prop.npcTitle': '角色卡',
    'prop.popTitle': '彈出視窗設定',
    'prop.imgTitle': '圖片設定',
    'prop.procTitle': '規則框設定',
    'prop.typeTitle': '{0}的設定',
    'prop.richLabel': '巢狀書式（插在行首的記號）',
    'prop.richHint1': '插在目前游標所在那一行的開頭。沒有碰到內文的話，就在最後新增一行。',
    'prop.richHint2': '<b>｜表格</b>連續寫同樣形式的行就會成為一個表格，第 1 行是標題。',
    'prop.speaker': '說話者',
    'prop.tocHead': '目錄的標題語',
    'prop.tocHeadHint': '留空的話就不顯示標題本身。',
    'prop.tocPick': '要收錄什麼',
    'prop.tocPickHint': '目前 {0} 項。每按一次就切換收錄／不收錄。',
    'prop.tocStyle': '格式',
    'prop.tocPn': '顯示頁碼',
    'prop.tocDots': '用點線連接',
    'prop.tocNote1': '目錄中顯示的文字，可以選取該標題後在',
    'prop.tocNote2': '「目錄中的寫法」',
    'prop.tocNote3': '修改。標題本身不會改變。',
    'prop.tocOwn': '目錄中的寫法',
    'prop.tocOwnPh': '（標題的文字）',
    'prop.tocOwnHint': '留空的話，標題的文字會直接出現在目錄中。',
    'prop.tocMode': '要不要收錄在目錄',
    'prop.tocModeDef': '依目錄的設定',
    'prop.tocModeOn': '一定收錄',
    'prop.tocModeOff': '不收錄',
    'prop.tocModeHint': '目錄那邊是依書式（標題 1、標題 2…）決定。這裡只決定這個標題。',
    'prop.tocLv': '目錄中的層級',
    'prop.tocLvAuto': '依書式（第 {0} 層）',
    'prop.tocLvN': '第 {0} 層',
    'prop.tocLvHint': '只改變目錄中看起來的層級。紙面上標題的大小不會改變。',
    'prop.flow': '圖',
    'prop.flowOpen': '開啟圖來繪製',
    'prop.flowHint1': '會開啟一個視窗。<b>抓住方框可以移動</b>，用右下角的小方塊可以改變大小。',
    'prop.flowHint2': '選取方框後，從上方出現的<b>紅色圓點</b>拖到要連接的方框，就能拉出線。<br>',
    'prop.flowHint3': '分支之後，還能再做分支。',
    'prop.flowCounts': '　目前方框 {0} 個・線 {1} 條。',
    'prop.flowSize': '圖的大小（mm）',
    'prop.flowWide': '比版心寬的話會超出紙面。',
    'prop.cellOwner': '這個段落所在的儲存格',
    'prop.cellOwnerTable': '表格「{0}」　',
    'prop.cellOwnerRC': '第 {0} 列第 {1} 欄',
    'prop.cellOwnerHint': '要改變表格本身的外觀・名稱時，請選取表格。',
    'prop.tpl': '樣板',
    'prop.tplNoLb': '無標題語',
    'prop.tplApply': '／套用這個樣式',
    'prop.tplUp': '以目前的外觀覆寫',
    'prop.tplRen': '修改名稱與標題語',
    'prop.tplDel': '刪除這個樣板',
    'prop.tplNew': '把目前的外觀存成樣板',
    'prop.tplHint': '按下後外觀與標題語就會變成那個樣式。下面還能再細部調整。',
    'prop.tplHint2': '　↑是覆寫，✎是改名，×是刪除。',
    'prop.lb': '標題語',
    'prop.lbHint': '留空的話就不顯示標題。',
    'prop.bxln': '框線',
    'prop.solid': '實線',
    'prop.dash': '虛線',
    'prop.none': '無',
    'prop.bxbar': '左側粗線',
    'prop.bxfill': '底色',
    'prop.bxsm': '小一點的字',
    'prop.body': '內容',
    'prop.addSub': '加入小標',
    'prop.addNest': '以巢狀加入檢定',
    'prop.procHint1': '小標是',
    'prop.procHintEx1': '■成功的情況',
    'prop.procHint2': '放在裡面的檢定是',
    'prop.procHintEx2': '＞偵查：發現桌子背面',
    'prop.procHint3': '的形式。',
    'prop.subCount': '　目前有 {0} 個小標。',
    'prop.imgPos': '配置方式',
    'prop.inline': '行內',
    'prop.floatL': '靠左繞排',
    'prop.floatR': '靠右繞排',
    'prop.free': '自由配置（與內文分開）',
    'prop.freeHint': '已脫離內文的流動。增寫內文位置也不會移動。',
    'prop.imgSize': '大小（％）',
    'prop.wrap': '文字的排法',
    'prop.wrapSquare': '避開（矩形）',
    'prop.wrapNone': '重疊',
    'prop.wrapNoneHint': '文字不避開圖片，直接從下方通過。',
    'prop.wrapSqHint': '文字會避開圖片的矩形範圍，可以跨越好幾個段落。',
    'prop.wrapNoAr': '還不知道圖片的長寬比。顯示過一次之後就會避開。',
    'prop.freePos': '距紙張左上角的位置（mm）',
    'prop.freePage': '放在哪一頁',
    'prop.snapTop': '靠上緣',
    'prop.snapBottom': '靠下緣',
    'prop.snapLeft': '靠左緣',
    'prop.snapRight': '靠右緣',
    'prop.offset': '位移放置的位置（mm）',
    'prop.down': '往下',
    'prop.inward': '往內',
    'prop.offsetHint': '只在單欄的頁面有效。',
    'prop.caption': '說明（顯示在圖片下方）',
    'prop.repick': '重新選擇圖片',
    'prop.headHintList': '關掉的話，第 1 列也會當成內容之一排列。',
    'prop.headHintCard': '打開的話，第 1 列會成為各項目的標題語（內容・備註…）。關掉就不顯示標題語。',
    'prop.headHintGrid': '打開的話，第 1 列會成為標題列。',
    'prop.titles': '標題',
    'prop.look': '外觀',
    'prop.tblSize': '大小',
    'prop.output': '輸出',
    'prop.omSimple': '文章',
    'prop.omFree': '自己寫',
    'prop.remake': '重新產生',
    'prop.outPh': '按「複製輸出」時會複製這裡的內容',
    'prop.copyOut': '複製輸出',
    'prop.kanaEx': 'Haijima Mio',
    'prop.nameEx': '灰島 澪',
    'prop.age': '年齡・立場',
    'prop.roleEx': '24 歲・女性・舊書店老闆',
    'prop.art': '立繪',
    'prop.artAdd': '加上',
    'prop.artHint': '放入立繪後，表格會靠左。',
    'prop.openSheet': '開啟角色卡編輯',
    'prop.npcHint': '能力值・技能・備忘・分頁，都可以在寬視窗中填寫。',
    'prop.ccfIn': '讀入棋子',
    'prop.ccfInHint1': '「讀入」是把 CCFOLIA 的棋子或角色卡製作工具的輸出貼上後，',
    'prop.ccfInHint2': '自動判斷系統並填入能力值・技能。',
    'prop.ccfInHint3': '武器會當成技能放入',
    'prop.ccfInHint4': '（因為光從棋子的文字無法與技能區分）。',
    'prop.popNameHint': '在紙面上會變成這個名稱的按鈕。從表格儲存格或內文中，寫 <code>＠{0}</code> 就能指向它。',
    'prop.openPop': '開啟內容視窗',
    'prop.popHintBlocks': '在視窗裡點段落，就能在這個設定欄修改那個段落。也可以把段落從紙面搬進視窗。',
    'prop.popHintText': '以空行分段，連續幾行 <code>|a|b|</code> 就會成為表格。',
    'prop.notOnPaper': '不顯示在紙面上',
    'prop.popOnlyHint': '只從表格儲存格用 <code>＠{0}</code> 指向，紙面的內文中不放按鈕。內容仍會出現在匯出檔與附錄中。',
    'prop.blockContent': '這個段落的內容',
    /* ---- 書式名稱 ---- */
    'type.flow': '流程圖',
    'type.desc': '描述文',
    'type.dialog': '對話文',
    'type.note': '注釋',
    'type.proc': '規則框',
    'type.h1': '標題 1',
    'type.h2': '標題 2',
    'type.h3': '標題 3',
    'type.title': '主標題',
    'type.subtitle': '副標題',
    'type.scene': '場景轉換',
    'type.hr': '橫線',
    'type.vr': '直線',
    'type.break': '換頁',
    'type.colbr': '換欄',
    'type.image': '圖片',
    'type.npc': 'NPC 卡',
    'type.table': '表格',
    'type.popup': '彈出視窗',
    'type.toc': '目錄',
    'type.cover': '封面',
    'type.colophon': '版權頁',
    'type.btnTip': '（Ctrl+Alt+{0} 也一樣。有選取段落就改變書式／沒有選取就加在最後）',
    /* ---- 書式分類 ---- */
    'group.body': '內文',
    'group.heading': '標題',
    'group.divider': '分隔',
    'group.insert': '插入',
    /* ---- 規則框的標題語（預設值與候選） ---- */
    'label.skill': '技能檢定',
    'label.resonance': '共鳴檢定',
    'label.action': '行動檢定',
    'label.act': '行為檢定',
    'label.sanity': '理智檢定',
    'label.fs': 'FS 檢定',
    'label.check': '檢定',
    'label.rule': '特殊規則',
    'label.staging': '演出',
    'label.gm': 'GM 用',
    /* ---- 規則框的顏色 ---- */
    'bxcol.aka': '朱',
    'bxcol.sumi': '墨',
    'bxcol.ai': '藍',
    'bxcol.koke': '苔綠',
    'bxcol.kin': '金褐',
    'bxcol.hai': '灰',
    /* ---- 背景花紋 ---- */
    'bg.none': '素色',
    /* ---- 文字顏色 ---- */
    'color.default': '預設',
    'color.aka': '朱',
    'color.ai': '藍',
    'color.green': '深綠',
    'color.purple': '紫',
    'color.kin': '金褐',
    'color.hai': '灰',
    /* ---- 巢狀書式（行首記號）的按鈕 ---- */
    'rich.disc': '- 條列',
    'rich.discTip': '改成條列（中黑點）。與 markdown 的寫法相同',
    'rich.num': '1. 編號',
    'rich.numTip': '改成有編號的條列。與 markdown 的寫法相同',
    'rich.box': '- [ ] 選項',
    'rich.boxTip': '改成選項（勾選欄）。寫成 - [x] 就會變成已完成的記號',
    'rich.indent': '縮排',
    'rich.indentTip': '改成往內縮一層的條列。行首每兩個半形空白縮一層',
    'rich.head': '■小標',
    'rich.headTip': '改成框內的小標',
    'rich.heads': '◇次小標',
    'rich.headsTip': '改成小一號的小標',
    'rich.note': '※注釋',
    'rich.noteTip': '改成注釋（較小的補充）',
    'rich.nest': '> 檢定',
    'rich.nestTip': '在規則框裡再放一個檢定框',
    'rich.talk': '「」對話',
    'rich.talkTip': '改成對話文。寫成 名字「…」 就會加上說話者',
    'rich.table': '｜表格',
    'rich.tableTip': '改成表格。連續寫同樣形式的行，就會成為一個表格',
    'rich.pop': '＠彈出視窗',
    'rich.popTip': '在＠後面寫上彈出視窗的名稱，就會變成開啟該彈出視窗的按鈕',
    'rich.slashHint': '／在行首輸入 {0} 再按空白鍵也能插入',
    'rich.h1': '＃標題 1',
    'rich.h1Tip': '改成最大的標題',
    'rich.h2': '＃＃標題 2',
    'rich.h2Tip': '改成中等的標題',
    'rich.h3': '＃＃＃標題 3',
    'rich.h3Tip': '改成小標題',
    /* ---- 規則框的樣板 ---- */
    'tpl.namePrompt': `請輸入這個樣板的名稱。
（會一起記住框線・粗線・底色・字級・顏色，以及標題語）`,
    'tpl.mine': '我的樣板',
    'tpl.nameLabel': '樣板名稱',
    'tpl.lbPrompt': `按下這個樣板時要放入的標題語
（留空則不改變標題語）`,
    'tpl.subHeadLine': `■小標
`,
    'tpl.nestLine': `> 技能檢定：
`,
    /* ---- 目錄 ---- */
    'toc.defaultHead': '目　錄',
    'toc.emptyHint': '設定主標題或標題後，目錄就會排在這裡。',
    /* ---- 表格的寬視窗 ---- */
    'tbldlg.title': '表格（寬視窗）',
    'tbldlg.hint': '儲存格會依寫的份量往下延伸。按 Tab 可以移到下一個儲存格。',
    /* ---- 表格 ---- */
    'tbl.seedItem': '項目',
    'tbl.seedContent': '內容',
    'tbl.colRoll': '骰值',
    'tbl.colHead': '標題',
    'tbl.colContent': '內容',
    'tbl.colTitle': '題名',
    'tbl.colN': '第 {0} 欄',
    'tbl.name': '表格名稱',
    'tbl.namePh': '〇〇表',
    'tbl.delCol': '刪除這一欄',
    'tbl.delRow': '刪除這一列',
    'tbl.addRow': '新增一列',
    'tbl.addCol': '新增一欄',
    'tbl.putInCell': '放進儲存格',
    'tbl.pickBlock': '選擇段落…',
    'tbl.popup': '彈出視窗',
    'tbl.newPopTitle': '以目前選取的文字為名稱，當場建立只給這個儲存格用的彈出視窗',
    'tbl.newPop': '＋替這個儲存格建立彈出視窗',
    'tbl.pointExisting': '指向既有的',
    'tbl.pleasePick': '請選擇',
    'tbl.capTip': '把表格本身的名稱顯示在紙面上',
    'tbl.headTip': '把第 1 列當成標題',
    'tbl.colHeadBtn': '欄標題',
    'tbl.rowHeadTip': '把第 1 欄當成標題（只限格線表格）',
    'tbl.rowHeadBtn': '列標題',
    'tbl.rowHeadOnlyGrid': '只有格線表格能使用。',
    'tbl.nameHint': '填寫後會顯示在表格上方。留空的話，名稱欄不會出現在紙面上。',
    'tbl.look.grid': '格線',
    'tbl.look.list': '條列',
    'tbl.look.card': '標題框',
    'tbl.lookListHint': '第 1 欄是編號，第 2 欄是標題，第 3 欄以後是內文。',
    'tbl.lookCardHint': '第 1 欄是框的題名，第 2 欄以後是內容。',
    'tbl.delHint': '要刪除時，請先點一下下方的儲存格。',
    'tbl.cells': '儲存格',
    'tbl.bigWin': '在寬視窗中編寫',
    'tbl.bigHint': '長的文字用「寬視窗」比較好寫。',
    'tbl.targetCell': '目標是 <b>第 {0} 列第 {1} 欄</b> 的儲存格。',
    'tbl.targetHint': '按左側的書式按鈕，也會放進同一個儲存格。',
    'tbl.targetNone': '在紙面或寬視窗點一下儲存格，那個儲存格就會成為目標。',
    'tbl.targetHint2': '之後再按左側的書式按鈕，也會放進同一個儲存格。',
    /* ---- 彈出視窗的編輯視窗 ---- */
    'popwin.titleTip': '這個名稱會成為紙面上的按鈕。在儲存格中可以用 ＠這個名稱 指向它',
    'popwin.sideTip': '顯示／隱藏這個視窗左側的面板',
    'popwin.src': '文字',
    'popwin.srcTip': '顯示／隱藏這個視窗的文字欄',
    'popwin.propTip': '顯示／隱藏這個視窗右側的設定欄',
    'popwin.copyTextTip': '只複製所選段落的文章',
    'popwin.copyBlkTip': '把所選段落整個記下來',
    'popwin.pasteTip': '把記下的段落放到下方',
    'popwin.propHint': '設定（選取這個視窗裡的段落就會出現）',
    'popwin.hintBlocks': '可以用這個視窗左側的面板決定書式，用右側的設定欄調整細節',
    'popwin.hintText': '以空行分段。可以用下方的按鈕插入標題・條列・表格等',
    'popwin.editPh': `在這裡寫長篇文章或表格。

|項目|內容|
|所在|灰色城鎮的邊緣|`,
    /* ---- 彈出視窗 ---- */
    'pop.defaultLabel': '詳細',
    'pop.emptyText': '（還沒有寫任何內容）',
    'pop.emptyBlocks': '（還沒有放入任何內容。可以用上方的「加入」，或從紙面把段落搬進來）',
    'pop.missMake': '（按下即建立）',
    /* ---- 流程圖 ---- */
    'flow.addBox': '＋方框',
    'flow.addBoxTip': '加入方形的方框',
    'flow.addRound': '＋圓角',
    'flow.addRoundTip': '加入圓角的方框',
    'flow.addDiamond': '＋菱形',
    'flow.addDiamondTip': '加入菱形（判斷）',
    'flow.addTerm': '＋圓端',
    'flow.addTermTip': '加入圓端（開始・結束）',
    'flow.zoomOut': '縮小顯示',
    'flow.zoomIn': '放大顯示',
    'flow.kind.box': '方形',
    'flow.kind.round': '圓角',
    'flow.kind.diamond': '菱形',
    'flow.kind.term': '圓端',
    'flow.kind.io': '平行四邊形',
    'flow.empty': '（流程圖。可從右側設定欄的「開啟圖」建立）',
    'flow.hint': '抓住方框可以移動，用右下角的小方塊可以改變大小',
    'flow.linkTip': '抓住這裡拖到要連接的方框，就能拉出線',
    'flow.gripTip': '抓住可以改變方框的大小',
    'flow.pickTarget': '請點選要連接的方框（點空白處即取消）',
    'flow.al.left': '靠左對齊',
    'flow.al.hcenter': '左右置中',
    'flow.al.right': '靠右對齊',
    'flow.al.top': '靠上對齊',
    'flow.al.vcenter': '上下置中',
    'flow.al.bottom': '靠下對齊',
    'flow.al.wsame': '寬度一致',
    'flow.al.hsame': '高度一致',
    'flow.al.hgap': '水平間距平均',
    'flow.al.vgap': '垂直間距平均',
    'flow.manySel': '已選取 {0} 個方框。',
    'flow.manyHint': '可以一起移動（按住 <code>Shift</code> 再點可以追加選取）。',
    'flow.align': '對齊',
    'flow.bulkChange': '一起變更',
    'flow.defaultCol': '預設（墨）',
    'flow.bulkSize': '一起設定大小（mm）',
    'flow.w': '寬',
    'flow.keep': '維持原樣',
    'flow.h': '高',
    'flow.bulkPad': '一起設定內側間距（mm）',
    'flow.bulkDup': '一起複製',
    'flow.bulkDel': '一起刪除',
    'flow.text1': '第 1 段的文字',
    'flow.text2': '第 2 段（填入後方框會分成上下兩段）',
    'flow.kind': '框的形狀',
    'flow.size': '大小（mm）',
    'flow.pos': '位置（mm）',
    'flow.fromLeft': '距左',
    'flow.fromTop': '距上',
    'flow.pad': '內側間距（mm）',
    'flow.linkFrom': '從這裡拉線',
    'flow.delBox': '刪除這個方框',
    'flow.edgeLabel': '線的附註',
    'flow.edgeLabelPh': '成功／失敗 等',
    'flow.edgeDir': '線的方向是「起點方框 → 終點方框」。',
    'flow.flip': '反轉方向',
    'flow.delLine': '刪除這條線',
    'flow.idleHint1': '點方框或線，就會出現它的設定。',
    'flow.idleHint2': '可以用上方的「＋方框」等加入。先選方框再加入，就會接在它下面。',
    'flow.whole': '整張圖的大小（mm）',
    'flow.fit': '配合內容',
    'flow.counts': '方框 {0} 個・線 {1} 條。',
    'flow.tooWide': '比版心寬的話會超出紙面。',
    'flow.hintInit': '抓住方框可以移動，右下角也能改變大小',
    /* ---- 圖片 ---- */
    'img.unset': '還沒有設定圖片（請從「書寫」分頁的「圖片」選擇）',
    /* ---- 紙面上的頁面標題列 ---- */
    'page.select': '選取',
    'page.cols2': '雙欄',
    'page.cols1': '單欄',
    'page.toggleCols': '切換分欄',
    'page.c2': '2 欄',
    'page.c1': '1 欄',
    'page.plusImg': '＋圖片',
    /* ---- 字數 ---- */
    'count.chars': '{0} 字',
    /* ---- 註解 ---- */
    'cmt.note': '註',
    /* ---- 電腦字型清單 ---- */
    'fontdlg.title': '電腦的字型',
    'fontdlg.filter': '以名稱篩選',
    /* ---- 字型 ---- */
    'font.fsNoEmbed': '不允許嵌入發布物',
    'font.fsPreview': '只允許為了閱覽與列印而嵌入',
    'font.fsBitmap': '只允許嵌入點陣圖',
    'font.tooBig': `這個字型太大，無法匯入（約 {0}MB）。
請改用其他字型，或做過子集化的字型。`,
    'font.warnAlert': `關於「{0}」：{1}。
自己看或列印沒有問題，但要把匯出的 HTML 交給別人時請留意。`,
    'font.faceN': '字體 {0}',
    'font.pickFace': `這個檔案裡有 {0} 種字體。請用編號選擇。

`,
    'font.defaultMincho': '預設（明體）',
    'font.sameAsBody': '與內文相同',
    'font.sample': '中文字體 Aa',
    'font.del': '刪除',
    'font.none': '（還沒有新增）',
    'font.over40': '無法處理超過 40MB 的字型。',
    'font.noLocalFonts': `這個瀏覽器無法列出字型清單。
請用「從檔案新增」選擇字型檔。

Windows 的字型放在 C:\\Windows\\Fonts。在選擇檔案畫面的檔名欄直接輸入
  C:\\Windows\\Fonts\\msjh.ttc
這樣的路徑就能開啟。`,
    'font.permDenied': `沒有取得列出字型清單的權限。
從網址列左邊的圖示允許「字型」後就能使用。

也可以用「從檔案新增」匯入。`,
    'font.notFound': '找不到字型。',
    'font.sample2': '中文字體 Aa 123',
    'font.noMatch': '找不到。',
    'font.extractFailed': '無法取出「{0}」的資料。請改試其他字型。',
    /* ---- NPC 卡的詳細視窗 ---- */
    'npcdlg.title': 'NPC 卡（詳細視窗）',
    /* ---- NPC 卡（標籤與按鈕；各系統的資料表保留原文，見 npc-data.js） ---- */
    'npc.pickAttr': '選擇屬性',
    'npc.pickEmotion': '選擇感情',
    'npc.cat': '類別',
    'npc.pickSkill': '選擇技能',
    'npc.argPh': '種類',
    'npc.emo.baseSkill': '基本技能',
    'npc.refAbility': '參照能力',
    'npc.targetValue': '判定值',
    'npc.emo.kyomei': '初始共鳴等級',
    'npc.emo.res': '共鳴感情',
    'npc.emo.skills': '習得技能',
    'npc.addRow': '＋新增一列',
    'npc.delEmptyRows': '刪除空白列',
    'npc.skill': '技能',
    'npc.rowUnit': ' 列',
    'npc.dx.timing': '時機',
    'npc.dx.dif': '難度',
    'npc.dx.tgt': '對象',
    'npc.dx.rng': '射程',
    'npc.dx.enc': '侵蝕值',
    'npc.dx.lim': '限制',
    'npc.dx.name': '名稱',
    'npc.dx.hit': '命中',
    'npc.dx.atk': '攻擊力',
    'npc.dx.pickDash': '— 選擇 —',
    'npc.dx.goneEffect': '（已刪除的效果）',
    'npc.dx.addEffectHint': '請用「＋效果」加入',
    'npc.dx.addEffect': '＋效果',
    'npc.dx.other': '其他',
    'npc.dx.otherPh': '武器等不在效果表中的項目',
    'npc.dx.comboName': '組合技名稱',
    'npc.dx.combo': '組合',
    'npc.dx.cond': '條件',
    'npc.dx.condPh': '未滿 100% 等',
    'npc.dx.eff': '效果',
    'npc.dx.effPh': '效果・備註',
    'npc.pick': '選擇',
    'npc.dx.breed': '血統',
    'npc.dx.syn': '症候群',
    'npc.dx.encFixed': '侵蝕率（固定）',
    'npc.dx.abSkills': '能力值與技能',
    'npc.dx.act': '行動值',
    'npc.dx.hpMax': 'HP 最大值',
    'npc.dx.stock': '常備化 Pt',
    'npc.dx.effects': '效果',
    'npc.dx.combos': '組合技',
    'npc.coc.hp': '耐久值',
    'npc.coc.san': '理智',
    'npc.coc.idea': '靈感',
    'npc.coc.luck': '幸運',
    'npc.coc.know': '知識',
    'npc.coc.build': '體格',
    'npc.coc.skillNamePh': '輸入技能名稱',
    'npc.coc.pickFromList': '從清單選擇',
    'npc.coc.list': '清單',
    'npc.coc.writeOwn': '自己輸入…',
    'npc.coc.weaponName': '武器名稱',
    'npc.coc.dmg': '傷害',
    'npc.coc.mainSkills': '主要技能',
    'npc.coc.weapons': '武器',
    'npc.coc.skillPct': '技能％',
    'npc.sys.emoklore': 'Emoklore TRPG',
    'npc.sys.dx3rd': 'Double Cross 3rd(RC)',
    'npc.sys.coc': '克蘇魯神話 TRPG',
    'npc.system': '系統',
    'npc.ver': '版本',
    'npc.ver7': '第 7 版',
    'npc.ver6': '第 6 版',
    'npc.copyCcf': '複製 CCFOLIA 棋子',
    'npc.addArt': '加上立繪',
    'npc.openModal': '在詳細視窗開啟',
    'npc.tag6': '・第 6 版',
    'npc.tag7': '・第 7 版',
    'npc.artWidth': '寬度',
    'npc.artChange': '更換',
    'npc.artRemove': '移除',
    'npc.kanaPh': '讀音',
    'npc.namePh': 'NPC 名稱',
    'npc.nameEmpty': '（NPC 名稱）',
    'npc.rolePh': '年齡・性別・職業／立場',
    'npc.memo': '備忘',
    'npc.memoPh': '語氣・行動方針・處理方式等',
    'npc.tabNamePh': '分頁名稱',
    'npc.tabDel': '刪除這個分頁',
    'npc.tabNoName': '（未命名的分頁）',
    'npc.tabAdd': '＋新增分頁',
    'npc.modalNote': '頁面放不下，所以紙面保持收合，改在這裡展開',
    'npc.tabUnnamed': '未命名',
    'npc.overflow': '頁面放不下',
    /* ---- 系統簡稱 ---- */
    'sys.short.emoklore': 'Emoklore',
    'sys.short.dx3rd': 'Double Cross 3rd',
    'sys.short.coc': '克蘇魯',
    /* ---- 讀入 Yutosheet 的表格 ---- */
    'yt.hint': '請在 Yutosheet 選取效果表或組合技表並複製，直接貼上。標題列要不要一起貼都可以。',
    'yt.auto': '自動判斷',
    'yt.effect': '效果表',
    'yt.combo': '組合技表',
    'yt.placeholder': '|集中 / … / 白兵 / (5+3)dx+(5-2)@8 / 22 / 單體 / 10m / 8 / 未滿 100% / ',
    'yt.go': '讀入',
    'yt.noRows': '找不到表格的列。請貼上項目以「 / 」分隔的列。',
    'yt.nothingRead': '沒有可以讀取的列。',
    'yt.loadedCombo': '已讀入 {0} 筆組合技表',
    'yt.loadedEffect': '已讀入 {0} 筆效果表',
    /* ---- 讀入 CCFOLIA 的棋子 ---- */
    'ccfin.title': '讀入 CCFOLIA 的棋子',
    'ccfin.hint': '請把在 CCFOLIA 對棋子按右鍵→複製的文字，或角色卡製作工具的「CCFOLIA 輸出」得到的文字，直接貼上。',
    'ccfin.unreadable': '無法當成 CCFOLIA 棋子讀取。請把含有 { } 的文字全部貼上。',
    'ccfin.unknownSys': '無法判斷是哪個系統的棋子。請確認裡面是否有能力值的參數。',
    'ccfin.readAs': '已作為 {0} 讀入',
    'ccfin.nSkills': '技能 {0} 筆',
    'ccfin.nEffects': '效果 {0} 筆',
    'ccfin.nCombos': '組合技 {0} 筆',
    'ccfin.nOver': '超出 12 列而放不下的技能 {0} 筆',
    'ccfin.nUnread': '無法讀取的行 {0} 筆',
    /* ---- CCFOLIA 棋子（手動複製） ---- */
    'ccf.manual': '無法自動複製。請全選下方的內容複製，再貼到 CCFOLIA 的版面上。',
    /* ---- 作品清單・過去的版本・垃圾桶 ---- */
    'prj.listAria': '作品清單',
    'prj.new': '新建',
    'prj.gens': '過去的版本',
    'prj.trash': '垃圾桶',
    'prj.back': '返回',
    'prj.genRestore': '把這個版本還原成新作品',
    'prj.restore': '還原',
    'prj.untitled': '未命名的劇本',
    'prj.busy': '這個作品正在別的分頁編輯，所以無法開啟。請先關閉那個分頁再開啟。',
    'prj.sizeMB': '約 {0}MB',
    'prj.sizeKB': '約 {0}KB',
    'prj.noStore': '這個瀏覽器無法使用作品的存放處，所以只儲存一個作品。',
    'prj.gensNote': '這是作品「{0}」過去的版本。還原後會成為新的作品，目前的作品則原樣保留。',
    'prj.trashNote': '放進垃圾桶的作品，30 天後就會消失。',
    'prj.trashEmpty': '垃圾桶是空的。',
    'prj.daysLeft': '剩 {0} 天',
    'prj.listNote': '{0} 個作品。按兩下或按 Enter 開啟。作品儲存在這個瀏覽器裡。重要的原稿請也用「儲存」存成檔案。',
    'prj.busyTag': '正在別的分頁編輯',
    'prj.file': '檔案：',
    'prj.notSaved': '未儲存',
    'prj.copySuffix': '（副本）',
    'prj.genSuffix': '（{0} 的版本）',
    /* ---- 範例原稿（依建立當下的語言放入，建立後屬於使用者資料） ---- */
    'sample.subtitle': '克蘇魯神話 TRPG　劇本',
    'sample.intro': '導入',
    'sample.desc': '在這裡寫導入的描述。左側是內文，右側是排好的頁面。寫在左邊的內容會直接流到頁面上。',
    'sample.dialog': '「首先，請試著點一下這個段落」',
    'sample.proc': '〈偵查〉成功的話，會發現黏在桌子背面的信封。',
    /* ---- 版權頁的範本（建立當下的語言） ---- */
    'colophon.author': '作者：',
    'colophon.publisher': '發行：',
    /* ---- 狀態列的訊息 ---- */
    'status.ccfCopied': '已複製 CCFOLIA 棋子',
    'status.ccfManual': '無法自動複製。請手動複製',
    'status.cantUndo': '無法再復原了',
    'status.undone': '已復原（重做請按 Ctrl+Y）',
    'status.cantRedo': '沒有可以重做的操作',
    'status.redone': '已重做',
    'status.openElsewhere': '這個作品也在別的分頁開著。兩邊都寫的話，會被後儲存的那一邊覆蓋',
    'status.autoSaveFailed': '自動儲存失敗',
    'status.autoSavedUnsaved': '已自動儲存（有尚未存成檔案的變更）',
    'status.autoSaved': '已自動儲存',
    'status.tooBigSkip': '內容太大，已略過自動儲存。請用「儲存」存成檔案',
    'status.quotaExceeded': '超出自動儲存的容量。請用「儲存」存成檔案',
    'status.savedToFile': '已儲存到檔案',
    'status.migrateFailed': '無法接收以前的自動儲存，所以仍留在舊的存放位置',
    'status.clickCell': '請先點一下儲存格',
    'status.cellAdded': '已在儲存格放入「{0}」',
    'status.popCreated': '已建立彈出視窗「{0}」。請填寫內容',
    'status.fontFailed': '無法匯入字型',
    'status.fontAdded': '已新增字型「{0}」（{1}MB）',
    'status.importCancelled': '已取消匯入',
    'status.extractingFace': '正在取出字體…',
    'status.fontLoading': '正在讀取字型…',
    'status.fontReading': '正在讀取「{0}」…',
    'status.fontCantImport': '無法匯入這個字型',
    'status.popsCreated': '已建立彈出視窗「{0}」',
    'status.pastedParas': '已分成 {0} 個段落匯入',
    'status.cantDelLast': '無法刪除最後一個段落',
    'status.paraDeleted': '已刪除段落',
    'status.parasDeleted': '已刪除 {0} 個段落',
    'status.nothingToMove': '找不到要移動的段落',
    'status.noDropTarget': '不知道要放到哪裡',
    'status.cantDropIntoSelf': '無法放進該段落自己裡面（正把彈出視窗或表格拖進它自己）',
    'status.parasSelected': '已選取 {0} 個段落',
    'status.movedToCell': '已把 {0} 個段落放進表格儲存格（第 {1} 列第 {2} 欄）',
    'status.movedToPop': '已把 {0} 個段落移進彈出視窗',
    'status.movedToPaper': '已把 {0} 個段落放回紙面',
    'status.moved': '已移動 {0} 個段落',
    'status.handleOnPage': '「{0}」要在右側頁面那邊操作',
    'status.tabAdded': '已新增分頁',
    'status.artRemoved': '已移除立繪',
    'status.maxRows': '最多只能 {0} 列',
    'status.keepRows': '初始的 {0} 列會保留',
    'status.boxesDeleted': '已刪除 {0} 個方框',
    'status.lineDeleted': '已刪除線',
    'status.pickToDelete': '請點選要刪除的方框或線',
    'status.lineConnected': '已連上線',
    'status.lineCancelled': '已取消拉線',
    'status.boxesSelected': '已選取 {0} 個方框',
    'status.pick2': '請選取 2 個以上的方框',
    'status.boxesAligned': '已對齊 {0} 個方框',
    'status.boxDeleted': '已刪除方框',
    'status.artLoading': '正在讀取立繪…',
    'status.artAdded': '已加上立繪',
    'status.cantInCell': '「{0}」無法放進儲存格裡',
    'status.addedToCell': '已在儲存格（第 {0} 列第 {1} 欄）放入「{2}」',
    'status.typeAdded': '已新增「{0}」',
    'status.fullWidthOnly': 'NPC 卡與流程圖只能全寬',
    'status.propHint': '選取表格・角色卡・彈出視窗・框的段落，就會顯示內容',
    'status.cantReduce': '無法再減少了',
    'status.clickRowCell': '請先點一下要刪除那一列的儲存格',
    'status.clickColCell': '請先點一下要刪除那一欄的儲存格',
    'status.remade': '已從表格重新產生',
    'status.noOutput': '沒有要輸出的文字',
    'status.outCopied': '已複製輸出的文字',
    'status.copyFailed': '無法複製',
    'status.tplSaved': '已儲存樣板「{0}」',
    'status.tplOverwritten': '已覆寫樣板「{0}」',
    'status.tplFixed': '已修改樣板',
    'status.tplDeleted': '已刪除樣板',
    'status.keepOne': '請至少保留一項',
    'status.clickCellFirst': '請先點一下儲存格（在紙面或寬視窗都可以）',
    'status.rubyPick': '請在內文中選取要加注音的文字',
    'status.rubyWrite': '請在《》中寫上讀音',
    'status.rubyForm': '請用｜本文字《讀音》的形式書寫',
    'status.sameList': '請選取同一個串列中的段落',
    'status.cantMerge': 'NPC 卡・目錄・換頁・換欄無法合併',
    'status.merged': '已合併 {0} 個段落',
    'status.tocMade': '已建立目錄區塊',
    'status.imgLoaded': '已讀取圖片',
    'status.pageCols': '已把 {0} 設成 {1} 欄',
    'status.pagesDeleted': '已刪除 {0} 頁',
    'status.bgApplied': '已套用到 {0} 頁',
    'status.imgLoading': '正在讀取圖片…',
    'status.imgInserted': '已插入圖片',
    'status.deselected': '已取消選取',
    'status.pickToCopy': '請選取要複製的段落',
    'status.parasCopied': '已記下 {0} 個段落',
    'status.nothingToPaste': '沒有記下的段落',
    'status.parasPasted': '已貼上 {0} 個段落',
    'status.cmtPick': '請在左側內文中選取要加註解的文字',
    'status.cmtNoCell': '表格儲存格裡的文字無法加註解',
    'status.cmtAdded': '已加上註解',
    'status.cmtPickPara': '請選取有註解的段落',
    'status.cmtDeleted': '已刪除註解',
    'status.colorNoCell': '表格儲存格裡無法只改部分文字的顏色。整個表格的顏色可以在右側的屬性欄修改',
    'status.colorSel': '已改變選取文字的顏色',
    'status.colorSelReset': '已恢復選取文字的顏色',
    'status.colorPick': '請選取要改變顏色的文字或段落',
    'status.colorPara': '已改變段落的顏色',
    'status.colorParaReset': '已恢復段落的顏色',
    'status.indentPick': '請選取要縮排的段落',
    'status.markInserted': '已插入「{0}」',
    'status.markChanged': '已改成「{0}」',
    'status.markInCell': '已在第 {1} 列第 {2} 欄的儲存格插入「{0}」',
    'status.markPickCell': '請先點一下要插入記號的儲存格',
    'status.markPickLine': '請在左側內文中點一下要插入的那一行',
    'status.imgPick': '請選取圖片的段落',
    'status.imgInline': '已放在行內',
    'status.imgLeft': '已靠左繞排',
    'status.imgRight': '已靠右繞排',
    'status.imgFree': '已改成自由配置',
    'status.imgPickFree': '請選取自由配置的圖片',
    'status.imgSnapped': '已靠到邊緣',
    'status.clrPick': '請選取要解除文繞圖位置的段落',
    'status.clrPickNormal': '請選取圖片下方的一般段落',
    'status.clrToggled': '已切換文繞圖',
    'status.loadedAsNew': '已讀入為新作品',
    'status.loaded': '已讀入',
    'status.exported': '已匯出閱覽 HTML（P.{0}～{1}）',
    'status.textCopied': '已複製 {0} 個段落的文章',
    'status.allCopied': '已複製全部內文',
    'status.coverExists': '封面已經存在',
    'status.coverMade': '已建立封面頁',
    'status.colophonExists': '版權頁已經存在',
    'status.colophonMade': '已建立版權頁',
    'status.prjUnreadable': '無法讀取這個作品',
    'status.prjOpened': '已開啟作品「{0}」',
    'status.prjCreated': '已建立新作品',
    'status.dupFailed': '無法複製這個作品',
    'status.created': '已建立「{0}」',
    'status.trashed': '已把作品「{0}」放進垃圾桶',
    'status.genFailed': '無法還原這個版本',
    'status.restored': '已從垃圾桶救回作品',
    'status.singleOnly': '這個瀏覽器只儲存一個作品（無法使用作品的存放處）',
    'status.repaired': '已把 {0} 個從清單上掉出去的作品放回',
    'status.recovered': '已還原上次沒來得及儲存的部分（{0}）',
    'status.ready': '準備完成',
    /* ---- 儲存失敗時的橫條 ---- */
    'bar.saveFailed': '沒有儲存成功。關閉這個畫面之前，請用「儲存」存成檔案。',
    'bar.retry': '再試一次',
    'bar.filePaused': '已停止自動儲存到檔案。',
    'bar.resume': '恢復',
    /* ---- 檔案 ---- */
    'file.jsonDesc': '排版台的原稿（JSON）',
    /* ---- 確認視窗 ---- */
    'confirm.migrated': `已把以前的自動儲存接收為作品「{0}」。

會從舊的存放位置刪除。舊版的排版台將看不到這份原稿。
（按「取消」則不刪除並保留，下次啟動時會再詢問一次）`,
    'confirm.fontDelete': '要刪除字型「{0}」。確定嗎？',
    'confirm.tabDelete': '要刪除分頁「{0}」。確定嗎？',
    'confirm.artRemove': '要移除立繪。確定嗎？',
    'confirm.tocExists': '目錄已經有了。要再建立一個嗎？',
    'confirm.tplExists': '「{0}」已經存在。要覆寫嗎？',
    'confirm.tplOverwrite': '要用目前的外觀覆寫樣板「{0}」。確定嗎？',
    'confirm.tplDelete': `要刪除樣板「{0}」。確定嗎？
（用這個樣式做的段落會照原樣保留）`,
    'confirm.delParas': '要刪除 {0} 個段落。確定嗎？',
    'confirm.bigBg': '這張圖片超過 2.5MB，可能會無法儲存。要繼續嗎？',
    'confirm.pageDelete': '要把 {0} 連同上面的 {1} 個段落一起刪除。確定嗎？',
    'confirm.replaceOnly': '這個瀏覽器只能保存一個作品。要用讀入的原稿替換目前的原稿嗎？',
    'confirm.reset': '要清除所有內容，從頭開始。確定嗎？',
    'confirm.trash': '要把作品「{0}」放進垃圾桶。30 天內都可以從「垃圾桶」救回。',
    /* ---- 提示視窗 ---- */
    'alert.pickPageToDel': '請在「對象頁面」選擇要刪除的頁面。',
    'alert.noParaOnPage': '那一頁沒有段落。',
    'alert.pickPageToApply': '請選擇要套用的頁面。',
    'alert.pickPageToClear': '請選擇要移除背景的頁面。',
    'alert.badFile': '無法讀取這個檔案。請選擇用這個排版台儲存的 JSON。',
    /* ---- 輸入視窗 ---- */
    'prompt.cmt': `請寫下要加在這段文字上的註解。

「{0}」`,
    /* ---- 匯出的閱覽 HTML（依匯出當下的語言） ---- */
    'export.appendix': '附錄',
    'export.noContent': '（沒有內容）',
    'export.showToc': '顯示目錄',
    'export.hideToc': '隱藏目錄',
    'export.copied': '已複製',
    'export.showHeads': '顯示標題',
    'export.hideHeads': '遮住標題',
    'export.untitled': '劇本',
    'export.toc': '目錄',
    /* ---- 說明視窗 ---- */
    'help.start.title': '開始使用',
    'help.start.body': `
<h3>開始使用</h3>
<p>左邊是內文的文字，右邊是排好的頁面。寫在左邊的內容會直接流到右邊，超出的部分會自動送到下一頁。</p>
<h4>書寫與選取</h4>
<p>沒有模式切換。內文隨時都能直接輸入，<b>碰到文字的段落就會直接被選取</b>。按把手或書式名稱欄也能選取。想變成什麼都沒選取的狀態時，可以再按一次<code>Esc</code>、按內文欄的空白處，或使用「書寫」分頁的<b>取消選取</b>（什麼都沒選取時，書式按鈕會在最後新增段落）。按<code>Enter</code>到下一個段落，在段落開頭按<code>Backspace</code>會與前一個段落接起來。</p>
<h4>左右的分工</h4>
<p><b>左側（工具面板）負責頁面或整份文件的事。右側（設定欄）負責目前選取的段落本身。</b>是這樣劃分的。</p>
<table>
<tr><th>左・書寫</th><td>選擇書式（＝新增／改變段落）、段落的排序・複製・刪除、頁面的分欄。</td></tr>
<tr><th>左・頁面</th><td>建立封面・版權頁、各頁的分欄、背景。</td></tr>
<tr><th>左・文件</th><td>劇本名稱、紙面間距、字級、字型等，整份原稿的設定。</td></tr>
<tr><th>右・設定欄</th><td>選取段落的內容與外觀。各書式專屬的欄位（表格・角色卡・圖片・規則框等），以及
每個段落都共通的欄位（巢狀書式、注音、雙欄時的配置、註解、文字顏色、縮排、只套用在這個段落的間距）。</td></tr>
</table>
<p>右側的設定欄在選取段落時出現。用上方的<b>設定欄</b>按鈕，沒選取時也能讓它保持開啟。</p>
<h4>內文的顯示</h4>
<table>
<tr><th>全部</th><td>連續顯示內文。從頭到尾讀寫時用。</td></tr>
<tr><th>以頁為單位</th><td>用分隔線顯示哪個段落放在哪一頁。調整頁數時用。</td></tr>
</table>
<h4>選取處的顏色</h4>
<p>選取段落後會鋪上淡淡的金色。這個顏色放在<b>書式本身的下層</b>，所以即使是標題 1 那種深色背景配白字，也不會看不清楚。</p>
<h4>頁首</h4>
<p>放在頁面最上方的東西，上方間距會自動去掉。把標題 1 放在頁首時，上面不會空出一段，而是從紙面的邊界處開始。只有封面想放在紙面的中段，所以維持原樣。想個別指定時，以「只套用在這個段落的間距」為優先。</p>
<h4>表格</h4>
<p>用「書寫」分頁的<b>表格</b>（<code>Ctrl</code>+<code>Alt</code>+<code>X</code>）插入。點想寫的地方就能直接輸入。用表格上方的按鈕增減列與欄。表格名稱可以直接寫在表格上方。</p>
<h4>兩種外觀</h4>
<table>
<tr><th>格線</th><td>一般有框線的表格。可以切換<b>標題列</b>・<b>標題欄</b>。</td></tr>
<tr><th>條列</th><td>在一個框內用橫線分隔，每段以<b>「編號：標題」及其下方的內文</b>排列。適合場景表・遭遇表・隨機表這種每一項都附有幾行描述的內容。第 1 欄是編號，第 2 欄是標題，第 3 欄以後是內文。</td></tr>
</table>
<table>
<tr><th>輸出</th><td>直接複製輸出的文字。可以貼到 Discord 或 CCFOLIA 的聊天室。</td></tr>
<tr><th>輸出的文字</th><td>按下會打開編輯欄。選<b>roll-table 形式</b>就會從表格自動產生，選<b>自己寫</b>就能改成任何文字。</td></tr>
</table>
<p>roll-table 形式配合 CCFOLIA 的 <code>/roll-table</code>，以「第 1 行是表格名稱，第 2 行是骰子算式，之後是 <code>骰值:結果</code>」產生。表格第 1 欄若是數字（<code>1</code> 或 <code>1-3</code>），就當成骰值使用。結果中的換行，依 BCDice 的規則輸出成 <code>
</code>。若你使用的環境寫法不同，可以切換到<b>自己寫</b>來修改。</p>
<h4>彈出視窗</h4>
<p>在紙面上<b>只放一個按鈕</b>，把長篇文章收在裡面的書式（<code>Ctrl</code>+<code>Alt</code>+<code>W</code>）。不增加頁數，就能附上複雜的資料。</p>
<ul>
<li>按下按鈕就會開啟視窗。<b>只在視窗裡就能寫完</b>。從左到右依序排著
<b>面板</b>（書式與段落的操作）・<b>文字</b>・<b>紙面</b>・<b>設定欄</b> 四個欄。
與主視窗的排列相同，所以不需要回到後面的主視窗。</li>
<li>抓住分隔線，可以改變各欄的寬度。按兩下會回到原本的寬度。</li>
<li>用視窗右上的 <b>&#9776;</b>・<b>文字</b>・<b>設定欄</b>，可以顯示／隱藏各欄。
畫面太窄、四個欄排不下時，只有第一次會<b>把文字欄收起來</b>再開啟
（同樣的內容也顯示在右側紙面上，收著也能寫）。
自己顯示／隱藏過一次之後，就會維持那個設定。</li>
<li>這個視窗會出現在<b>不蓋住主視窗文字欄的位置</b>。這是為了讓你能抓住紙面的段落搬進這個視窗。
抓住標題列可以移動視窗，抓住四邊・四角的任何一處都能改變大小。</li>
<li>面板上的書式，只排出在彈出視窗裡有意義的。
換頁・換欄・封面・版權頁・目錄要有頁面才能運作，所以不放。</li>
<li>以空行分段。像 <code>|項目|内容|</code> 這樣用 <code>|</code> 分隔的行連續出現，那裡就會變成<b>表格</b>（第 1 行是標題）。</li>
<li>按鈕上的文字，可以在按鈕右邊的小欄位修改。</li>
<li><b>列印與 PDF 時，內容會集中在書末的「附錄」。</b>內文的頁數不會增加。在匯出的閱覽 HTML 中，按下按鈕就會開啟視窗。</li>
</ul>
<h4>縮排</h4>
<p>選取段落後按「書寫」分頁的<b>→ 縮排</b>（<code>Ctrl</code>+<code>Alt</code>+<code>]</code>），會從左端往內縮一層。按<b>← 退回</b>（<code>Ctrl</code>+<code>Alt</code>+<code>[</code>）就會退回。最多可以縮 4 層。把標題 3 底下的內文往內縮，層級會更容易看出來。</p>
<h4>復原</h4>
<p>用<code>Ctrl</code>+<code>Z</code>復原，用<code>Ctrl</code>+<code>Y</code>重做。工具列左邊的箭頭也一樣。文字輸入不是一點一點退回，而是以打字的段落為單位一起退回。刪除・改變書式・排序・分欄・改變背景也都記在同一份歷程裡。</p>
<h4>頁面的縮放與移動</h4>
<table>
<tr><th><code>Ctrl</code>+滾輪</th><td>以指標位置為中心縮放。</td></tr>
<tr><th>用中鍵拖曳</th><td>抓住紙面移動。按住<code>Space</code>再用左鍵拖曳也一樣。</td></tr>
<tr><th><code>Shift</code>+滾輪</th><td>左右捲動。</td></tr>
<tr><th>工具列的 &minus; &plus;</th><td>分段縮放。按倍率的顯示就會回到「配合寬度」（<code>Ctrl</code>+<code>0</code>）。</td></tr>
</table>
<p>從紙面的空白處用左鍵拖曳，照舊可以一次選取多個段落。</p>
<h4>寬度調整</h4>
<ul>
<li>抓住窗格之間的交界拖動，可以改變工具面板・內文・頁面的寬度。</li>
<li><b>按兩下</b>交界，就會回到預設的寬度。</li>
<li>寬度會記在這個瀏覽器裡。把視窗縮窄時，內文與頁面會上下排列。</li>
</ul>
<h4>儲存</h4>
<ul>
<li>編輯的內容會自動儲存在這個瀏覽器裡。打完 0.7 秒後儲存，一直在打字也會每 3 秒儲存一次。</li>
<li>即使關閉分頁或重新載入，打好的字也會留著。沒來得及儲存的部分會先備份起來，下次開啟時還原。</li>
<li>用工具列的<b>儲存</b>（<code>Ctrl</code>+<code>S</code>），可以存成檔案。重要的原稿請也用這個方式留存。</li>
<li>在 Chrome・Edge 中，第一次<b>儲存</b>時選好檔案的存放位置，之後每次自動儲存也會寫進那個檔案。即使瀏覽器的資料消失，也能用<b>開啟</b>那個檔案救回。寫入權限失效時，上方會出現橫條，請按<b>恢復</b>。</li>
<li>儲存失敗時，上方會出現紅色橫條，直到恢復之前都不會消失。</li>
<li>有尚未存成檔案的變更時，狀態列會顯示「有尚未存成檔案的變更」。</li>
<li>用<b>開啟</b>讀入的檔案，不會覆蓋目前的作品，而是新增為一個新作品。</li>
</ul>
<h4>作品</h4>
<ul>
<li>劇本（作品）要在這個瀏覽器裡放幾份都可以。用工具列的<b>作品</b>叫出清單，可以開啟・新建・複製・刪除。清單上也會顯示最後一次存成檔案的日期時間。</li>
<li>啟動時會出現清單。最後開啟的作品已經選好，直接按<b>開啟</b>或 <code>Enter</code> 就能接著寫。用 <code>↑</code> <code>↓</code> 可以重新選擇。</li>
<li>同一個作品只能在一個分頁中開啟。在其他分頁開著的作品，會顯示「正在別的分頁編輯」。</li>
<li><b>過去的版本</b>：每個作品會保留開啟時・書寫期間每 10 分鐘・「全部清除重新開始」之前的狀態，最多 10 份。還原後會成為新的作品，目前的作品則原樣保留。</li>
<li><b>刪除</b>的作品會進到<b>垃圾桶</b>，30 天內都能救回。</li>
<li>切換作品後，復原（<code>Ctrl</code>+<code>Z</code>）的歷程會從該作品的部分重新開始。</li>
<li>這個瀏覽器無法使用作品的存放處（IndexedDB）時，會照以前一樣只儲存一個作品。這種情況下，若圖片或字型讓內容變大，就會略過自動儲存。</li>
</ul>`,
    'help.keys.title': '按鍵操作',
    'help.keys.body': `
<h3>按鍵操作</h3>
<table>
<tr><th><code>Enter</code></th><td>在那裡分段，可以接著寫新的段落。</td></tr>
<tr><th><code>Backspace</code>/<code>Delete</code></th><td>在選取段落的狀態（沒有在打字的狀態）下按，會刪除該段落。</td></tr>
<tr><th><code>Shift</code>+<code>Enter</code></th><td><b>在段落中換行。</b>段落不會分開。</td></tr>
<tr><th><code>Backspace</code></th><td>在段落開頭按，會與前一個段落接起來。</td></tr>
<tr><th><code>Esc</code></th><td>按 1 次會結束文字編輯並變成選取該段落的狀態，再按 1 次<b>選取也會取消</b>。也可以用來關閉視窗。</td></tr>
<tr><th><code>Ctrl</code>+<code>S</code></th><td>存成檔案。</td></tr>
<tr><th><code>Ctrl</code>+<code>Z</code></th><td>復原。不只文字輸入，刪除・改變書式・排序・頁面設定也能復原。</td></tr>
<tr><th><code>Ctrl</code>+<code>Y</code></th><td>重做（<code>Ctrl</code>+<code>Shift</code>+<code>Z</code>也一樣）。</td></tr>
<tr><th><code>Ctrl</code>+<code>Shift</code>+<code>R</code></th><td>替選取的文字加注音。</td></tr>
<tr><th><code>Tab</code> / <code>Shift</code>+<code>Tab</code></th><td>一層一層增減縮排（<code>Ctrl</code>+<code>Shift</code>+<code>]</code> / <code>[</code>也一樣）。打字途中也能使用。</td></tr>
<tr><th><code>Ctrl</code>+<code>0</code> / <code>+</code> / <code>-</code></th><td>頁面的顯示倍率。<code>0</code>是配合寬度。用<code>Ctrl</code>+<code>Shift</code>+<code>↑</code> / <code>↓</code> 也能縮放。</td></tr>
<tr><th>書式的快捷鍵</th><td>全部都是 <code>Ctrl</code>+<code>Shift</code>+按鍵（<code>Ctrl</code>+<code>Alt</code>+按鍵 也照舊能用。這是某些組合被瀏覽器搶走時的退路）。<br>
<code>0</code>描述文、<code>1</code>～<code>3</code>標題 1～3、<code>4</code>對話文、<code>5</code>注釋、<code>6</code>規則框、<code>8</code>場景轉換、<code>9</code>NPC 卡、<br>
<code>C</code>封面、<code>T</code>主標題、<code>S</code>副標題、<code>K</code>版權頁、<code>G</code>圖片、<code>M</code>目錄、<code>H</code>橫線、<code>V</code>直線、<code>B</code>換頁、<code>D</code>換欄、<code>X</code>表格、<code>W</code>彈出視窗、<code>F</code>流程圖<br>
<b>有選取段落</b>就會變成該書式，<b>沒有選取</b>就會在最後面新增。<br>
在瀏覽器中開啟時，有些組合會先被瀏覽器拿走，例如 <code>Ctrl</code>+<code>Shift</code>+<code>T</code>（重新開啟分頁）。這時請改用 <code>Ctrl</code>+<code>Alt</code>+按鍵。exe 版兩種都能用。</td></tr>
<tr><th><code>Ctrl</code>+<code>Shift</code>+<code>P</code></th><td>顯示或隱藏頁面一覽的欄。</td></tr>
<tr><th><code>Ctrl</code>+<code>C</code> / <code>V</code></th><td>記下／貼上整個段落。表格或 NPC 卡也會連放進儲存格的段落在內，整個照樣複製。<br>
<b>選取文字時</b>與<b>在輸入文字的欄位時</b>，照常是文字的複製・貼上。只有在選取段落、游標沒有放在文字裡時，才會是整個段落。<br>
記下的段落，在這個工具開著的期間都會記得（無法貼到別的應用程式）。</td></tr>
<tr><th><code>Ctrl</code>+<code>Alt</code>+<code>Shift</code>+<code>C</code> / <code>V</code></th><td>即使游標在文字裡，也記下／貼上整個段落。</td></tr>
</table>
<h4>選取</h4>
<ul>
<li>按段落左邊的<b>把手</b>，或<b>書式名稱欄</b>，就能選取該段落。打字途中也能使用。</li>
<li>在把手或書式名稱欄上<b>拖過去</b>，或從內文的左側空白處<b>拖曳</b>，可以一次選取一個範圍。</li>
<li><b>抓住把手拖動</b>，可以移到包含其他頁面在內的任何位置。</li>
<li><code>Shift</code>+點擊是範圍選取，<code>Ctrl</code>+點擊是追加選取。</li>
<li>在右側頁面上點區塊也能選取。會移到左側對應的位置。</li>
</ul>`,
    'help.layout.title': '分欄與頁面',
    'help.layout.body': `
<h3>分欄與頁面</h3>
<p>換頁是自動的。想分隔的地方，可以用「書寫」分頁的<b>換頁</b>放置分隔。</p>
<h4>頁面的分欄</h4>
<p>分欄是以<b>頁為單位</b>決定的。用「書寫」分頁的<b>這頁設為單欄／雙欄</b>，切換選取的段落所在的頁面（若在「頁面」分頁選了頁面，則以那些頁面為對象）。設成雙欄後會變成<b>一半寬度的直長欄</b>，文章會先填滿左欄，再流到右欄。頁面標題列的「切換分欄」也能改變。</p>
<h4>區塊的配置</h4>
<table>
<tr><th>全寬</th><td>在雙欄的頁面上，跨欄放滿整個寬度。適合主標題、標題、NPC 卡、圖片。</td></tr>
<tr><th>在欄內流動</th><td>一般的內文。收在欄內流動。</td></tr>
</table>
<p>在單欄的頁面上，選哪一種外觀都一樣。</p>`,
    'help.blocks.title': '書式與段落',
    'help.blocks.body': `
<h3>書式與段落</h3>
<p>「書寫」分頁的書式分成<b>內文・標題・分隔・插入</b>四類。<b>有選取段落</b>就會變成該書式，<b>什麼都沒選取</b>就會在最後面新增。與按鈕相同的操作，也能用 <code>Ctrl</code>+<code>Alt</code>+各按鍵完成。</p>
<p>左側清單中，書式名稱顯示在每一行的左邊（這些字不會被複製）。</p>
<h4>封面頁與版權頁</h4>
<p>用「頁面」分頁的<b>建立封面頁</b>／<b>建立版權頁</b>，可以一次準備好。封面會在開頭放上標題字與換頁，版權頁會在最後放上換頁與作者・發行的範本。已經存在時，會移到那個位置。</p>
<table>
<tr><th>封面</th><td>大大地放在頁面中段附近的標題字。</td></tr>
<tr><th>版權頁</th><td>小字與分隔線。在最後放上作者或發行日期。</td></tr>
</table>
<p>封面也能用 <code>Ctrl</code>+<code>Alt</code>+<code>C</code>，版權頁用 <code>Ctrl</code>+<code>Alt</code>+<code>K</code> 指定。</p>
<h4>流程圖（<code>Ctrl</code>+<code>Shift</code>+<code>F</code>）</h4>
<p>把方框<b>放在喜歡的位置，再用線連起來</b>的圖。分支之後還能再做分支。也能拉回頭的箭頭，或匯合到距離較遠的方框。因為會變得很長，所以<b>一律是全寬</b>。</p>
<p>選取流程圖後按<b>右側設定欄的「開啟圖來繪製」</b>，就會開啟編輯視窗（在文字欄<b>按兩下</b>也能開啟）。</p>
<ul>
<li><b>加入方框</b>：視窗上方的「＋方框」「＋圓角」「＋菱形」「＋圓端」。先選方框再按，就會放在它下面並連上線。</li>
<li><b>移動</b>：抓住方框搬動。按住 <code>Alt</code> 就能細微調整位置。</li>
<li><b>大小</b>：選取方框後，抓住右下角出現的小方塊。也能用數值決定。</li>
<li><b>拉線</b>：選取方框後，抓住上方出現的<b>紅色圓點</b>，再按要連接的方框。選取線之後，可以加上「成功／失敗」等附註。</li>
<li><b>框的形狀</b>：方形・圓角・菱形（判斷）・圓端（開始與結束）・平行四邊形。顏色也能從 6 色中選擇。</li>
<li><b>上下兩段</b>：寫在方框的「第 2 段」，方框就會分成上下兩段（場景名稱與內容等）。</li>
<li><b>間距</b>：可以替每個方框決定內側的間距。</li>
<li><b>刪除</b>：選取方框或線後按 <code>Backspace</code>（或 <code>Delete</code>）。開著視窗期間，紙面上的段落不會被刪掉。</li>
<li><b>復原</b>：<code>Ctrl</code>+<code>Z</code>。視窗裡也會當場重畫。</li>
<li><b>溢出的文字</b>：方框的高度維持設定值，但文字放不下時，會往下延伸那個份量。</li>
</ul>
<h4>一起選取・對齊</h4>
<p>按住<code>Shift</code>再按方框可以<b>追加選取</b>，在空白處拖曳可以<b>框選</b>。一起選取之後，抓住就能<b>一起移動</b>。</p>
<p>選取多個時，右側欄位會出現<b>對齊方式</b>。</p>
<ul>
<li><b>靠左對齊・左右置中・靠右對齊</b>／<b>靠上對齊・上下置中・靠下對齊</b></li>
<li><b>寬度一致・高度一致</b>（配合最大的那個）</li>
<li><b>水平間距平均・垂直間距平均</b>（兩端不動，讓中間的間隔一致）</li>
</ul>
<p>形狀・顏色・大小・間距，也能一起套用到所有選取的方框。也可以<b>一起複製</b>與<b>一起刪除</b>。</p>
<p>整張圖的大小以 mm 決定。按「配合內容」，就會變成剛好能放下所有方框的大小。比版心寬的話會超出紙面，這時請把寬度調小。</p>
<p>以前用「一行一個方框，行首的 <code>-</code> 是分支」寫的原稿，<b>開啟時會自動轉換成圖</b>。原本的文章也會原樣保留。</p>
<h4>巢狀書式（行首的記號）</h4>
<p>條列不是獨立的書式，而是<b>放在內文中的巢狀書式</b>。在行首加上記號，只有那一行會變成別的書式。可以用在<b>描述文・注釋・規則框・彈出視窗的內容・角色卡的備忘／分頁</b>。<br>
選取段落後，<b>右側設定欄</b>會出現「巢狀書式」的按鈕。按下後，會在目前游標所在那一行的開頭加上記號（沒有碰到內文的話，就在最後新增一行）。</p>
<table>
<tr><th>以<code>- </code>開頭的行</th><td><b>條列（中黑點）</b>。與 markdown 的寫法相同（<code>*</code> <code>+</code> 也一樣）。後面要接空白（像 <code>-5度</code> 這樣的句子會維持原樣）。</td></tr>
<tr><th>以<code>1.</code> <code>2.</code> 開頭的行</th><td><b>條列（編號）</b>。寫的編號會直接顯示。與 markdown 相同。</td></tr>
<tr><th>以<code>- [ ] </code>開頭的行</th><td><b>條列（選項）</b>。用來列出讓人選擇的東西。寫成 <code>- [x]</code> 會變成已完成的記號（☑）。與 markdown 相同。</td></tr>
<tr><th>記號前的<b>空白</b></th><td>半形 2 個（全形 1 個）會<b>縮一層</b>（最多 3 層）。寫成 <code>  - 上了鎖</code> 這樣。</td></tr>
<tr><th>以<code>「</code>開頭、以<code>」</code>結尾的行</th><td><b>對話文</b>。像 <code>灰島「歡迎你來」</code> 這樣在前面寫名字，就會顯示為說話者。若<code>」</code>在行中就結束，後面還接著文字，則維持一般的句子。</td></tr>
<tr><th><code>|項目|内容|</code> 的行</th><td><b>表格</b>。連續寫同樣形式的行就會成為一個表格，<b>第 1 行是標題</b>。寫了 <code>|---|---|</code> 的分隔行也會被忽略。</td></tr>
<tr><th>以<code>■</code>開頭的行</th><td>會變成小標。可以像「■成功的情況」「■失敗的情況」這樣分開寫結果。</td></tr>
<tr><th>以<code>&gt; </code>開頭的行</th><td>在框裡再放一個<b>巢狀的框</b>。像 <code>&gt; 偵查：發現桌子背面的信封</code> 這樣，冒號前面會成為小標。</td></tr>
</table>
<p><b>記號統一成與 markdown 相同的寫法。</b>以前的 <code>・</code> <code>□</code> <code>＞</code> 也照樣讀得懂。舊原稿在開啟時，會一次改寫成新的記號（外觀與註解位置不變）。</p>
<p>用原本「條列」書式寫的原稿，開啟時會<b>改成描述文，並在每一行的開頭重新加上記號</b>。外觀維持不變。</p>
<h4>規則框（框）</h4>
<p><b>規則框</b>是把原本的「技能判定」與「特殊規則」合而為一的書式。內容的寫法相同，<b>只在設定欄選擇外觀</b>。按「技能檢定」「特殊規則」的樣板就會恢復原本的外觀，之後還能個別改變框線形狀（實線・虛線・無）、左側粗線、底色、字級、顏色（朱・墨・藍・苔綠・金褐・灰）。開啟舊原稿時，會自動轉換成這個書式。</p>
<h4>註解</h4>
<p>在左側內文中選取文字，按「書寫」分頁的<b>加上註解</b>，那段文字就會掛上註解。紙面上只會加上<b>淡淡的虛線與小小的編號</b>，按下就會在<b>紙面外的右側</b>顯示註解。匯出的 HTML 也同樣顯示在右側欄外。</p>
<ul>
<li>內文本身沒有混入任何東西，所以<b>複製文章時註解不會跟著過去</b>。</li>
<li>列印與 PDF 不會顯示虛線與編號。</li>
<li>用「刪除這個段落的註解」，可以一次拿掉所選段落的註解。</li>
</ul>
<h4>分隔類的書式</h4>
<table>
<tr><th>橫線</th><td>畫一條橫線。輸入文字的話，會當成小標放在線的中段。</td></tr>
<tr><th>直線</th><td>在左端立一條直線，右邊放文章。用於框內文章或補充。</td></tr>
<tr><th>場景轉換</th><td>靠右、比內文稍小，加上粗體與底線。用來表示場景的切換。</td></tr>
<tr><th>換頁</th><td>在那裡分頁。也能用<code>Ctrl</code>+<code>Alt</code>+<code>B</code>插入。插入換頁後，為了能在下一頁開始書寫，會<b>附上一個空的描述文</b>。</td></tr>
<tr><th>換欄</th><td>在雙欄的頁面，從那裡<b>送到下一欄</b>。想在左欄中途結束、移到右欄時使用。在單欄的頁面什麼都不會發生。<code>Ctrl</code>+<code>Alt</code>+<code>D</code>。</td></tr>
</table>
<h4>頁面一覽</h4>
<p>按工具列的<b>頁面一覽</b>（<code>Ctrl</code>+<code>Alt</code>+<code>P</code>），內文與頁面之間會出現一覽欄（不是蓋在上面的視窗，所以可以開著工作）。從封面到版權頁的所有頁面會縮小排列，除了頁碼之外，封面・目錄・版權頁還會加上標記與該頁的標題。</p>
<ul>
<li>按下就會移到那一頁，左側內文也會對齊到那個位置。</li>
<li>用上方的滑桿改變縮圖大小，拖曳交界可以改變欄寬。</li>
<li>按<b>×</b>關閉。是否開啟與寬度會記在這個瀏覽器裡。</li>
</ul>
<h4>一起選取・移動</h4>
<ul>
<li>從右側頁面的<b>空白處拖曳</b>，可以一次選取框到的段落。按住<code>Ctrl</code>的話，會加入目前的選取。</li>
<li><b>抓住選取的段落拖動</b>，可以移到包含其他頁面在內的任何位置。落下的位置會以線標示。</li>
<li>在左側內文中，抓住選取的段落也能同樣移動。</li>
</ul>
<h4>能做的事</h4>
<ul>
<li><b>合併選取</b>：把選取的段落合成一個。書式沿用第一個的。</li>
<li><b>複製・刪除・上下移動</b>：作用在選取中的段落上。</li>
<li><b>只套用在這個段落的間距</b>：可以用 mm 指定上下間距。</li>
</ul>
<h4>複製內文</h4>
<ul>
<li>用「書寫」分頁的<b>複製文字</b>，只複製不含書式名稱與記號的<b>文章本身</b>。</li>
<li>有選取段落就以該範圍為對象，沒選取就是全文。</li>
<li>選取段落的狀態下按 <code>Ctrl</code>+<code>C</code>，也能同樣複製。</li>
</ul>
<div class="note">跨段落拖曳選取文字，因為瀏覽器的機制無法做到（每個段落是各自獨立的編輯區域）。想複製多個段落時，請使用上面的方法。</div>
<h4>貼上</h4>
<p>貼上以空行分隔的文章時，會逐段拆成區塊匯入。行首的 <code>#</code> <code>##</code> <code>###</code> 會變成標題，以<code>「</code>開頭的行變成對話文，以<code>※</code>開頭的行變成注釋，以「場面」開頭的行變成場景轉換，自動分配。段落中單獨的換行會原樣保留。</p>
<h4>目錄</h4>
<p>選取目錄後，可以在右側設定欄決定內容。</p>
<ul>
<li><b>標題語</b>：可以改變「目　錄」這幾個字。留空的話就不顯示標題本身。</li>
<li><b>要收錄什麼</b>：從主標題・標題 1～3・副標題・場景轉換中選擇。每按一次就切換收錄／不收錄（預設是標題 1～3）。</li>
<li><b>格式</b>：頁碼，以及連接項目與頁碼的點線，都能各自顯示或隱藏。</li>
</ul>
<p>以上是<b>依書式</b>（標題 1、標題 2…）的設定。<b>每個標題個別</b>的設定，選取該標題後會出現在右側設定欄。</p>
<ul>
<li><b>目錄中的寫法</b>：可以另外決定目錄中顯示的文字，與標題本身分開（例：標題是「第一章　雨中的路口」，目錄中寫「第一章」）。留空的話就直接顯示標題的文字。</li>
<li><b>要不要收錄在目錄</b>：從<b>依目錄的設定</b>／<b>一定收錄</b>／<b>不收錄</b>三者中選擇。用「一定收錄」，即使目錄那邊排除了該書式，也能只收錄這個標題。反過來用「不收錄」，可以從同一書式中只排除這一個。</li>
<li><b>目錄中的層級</b>：可以替每個標題改變在目錄中看起來的層級（例：雖然是標題 2，但在目錄中放在第 1 層）。紙面上標題的大小不會改變。</li>
</ul>
<p>用「書寫」分頁的<b>目錄</b>就能建立。由主標題與標題 1～3 組成，在匯出的 HTML 中可以從目錄跳到該位置。把<b>頁面一覽</b>的欄切換到「標題」，會列出目前的標題，按下就能跳到該位置。</p>`,
    'help.ruby.title': '注音',
    'help.ruby.body': `
<h3>注音（ruby）</h3>
<p>配合青空文庫的寫法。用<b>｜</b>（直線）標出本文字的開頭，在<b>《　》</b>裡寫讀音。</p>
<table>
<tr><th>寫法</th><td><code>｜深淵《Abyss》</code></td></tr>
<tr><th>顯示結果</th><td>像深淵（Abyss）這樣，在上方加上小小的注音</td></tr>
</table>
<p>按「書寫」分頁的<b>加注音</b>（<code>Ctrl</code>+<code>Alt</code>+<code>R</code>），會用 <code>｜…《》</code> 包住選取的文字，並把游標放進《　》裡。｜用輸入法不太好打，用這個比較輕鬆。半形的 <code>|</code> 也一樣能用。</p>
<div class="note">青空文庫即使省略｜，也會從前面的字元推測本文字，但這個工具規定<b>一定要寫｜</b>。因為雙重十字的效果名稱會寫成《Concentrate》這種形式，交給推測的話，就會替前面的片假名加上注音。沒有｜的《　》，會照原樣以文字顯示在紙面上。</div>
<p>目錄與頁面一覽中，會列出拿掉注音記號後的文字。</p>`,
    'help.image.title': '圖片',
    'help.image.body': `
<h3>圖片</h3>
<p>大小的％<b>以紙面為準</b>。行內與左右繞排以版心（內文的寬度）、自由配置以紙張寬度的百分之幾來決定。不論分欄切換成單欄或雙欄，或放在全寬還是欄內，<b>實際的大小都不會變</b>。</p>
<ul>
<li>按「書寫」分頁的<b>圖片</b>會開啟選擇檔案的畫面，圖片會放在最後面。先選取段落再按，該段落就會變成圖片。</li>
<li>可以選擇<b>與文字的排列方式</b>。和 Word 的「矩形」一樣，內文會流到圖片旁邊。
<table>
<tr><th>行內</th><td>只有圖片佔滿整個寬度，內文從圖片下方接續。</td></tr>
<tr><th>靠左繞排</th><td>圖片靠左，內文流到它的右側。</td></tr>
<tr><th>靠右繞排</th><td>圖片靠右，內文流到它的左側。</td></tr>
</table></li>
<li>繞排在圖片高度的範圍結束後就會自然解除。想在中途切斷時，選取要切斷位置的段落，按「書寫」分頁的<b>解除文繞圖</b>，那個段落就會從圖片下方開始。</li>
<li>繞排時，<b>大小</b>就是圖片所佔的寬度（35～45% 左右比較好讀）。數值可以直接輸入右側的欄位。</li>
<li>用<b>位移放置的位置</b>，可以不管段落的排列，放在喜歡的位置。「往下」往紙面下方、「往內」往紙面中央，以 mm 移動。<b>文字會自動避開。</b>把圖片放在頁首再用數值移動，就能配置在該頁的任何地方。</li>
<li>位移只在<b>單欄的頁面</b>有效。雙欄時圖片會超出欄的外框而與文字重疊，所以位移會被忽略。</li>
<li>設成<b>自由配置</b>後，可以用距紙張左上角的距離（mm）放在喜歡的位置。完全脫離段落的排列，所以也不影響頁數。用<b>靠下緣</b>等按鈕，可以剛好對齊紙張邊界的內側。不過<b>文字不會避開</b>（是用來重疊放置的）。想讓文字避開時，請使用「靠左繞排」「靠右繞排」。</li>
<li>在段落面板可以指定<b>大小</b>（相對欄寬的％）與<b>說明</b>。</li>
<li>長邊超過 1600px 的圖片，會自動縮小到能儲存的大小再匯入。</li>
<li>和其他區塊一樣，可以選擇「全寬」「在欄內流動」。</li>
</ul>`,
    'help.font.title': '字型',
    'help.font.body': `
<h3>字型</h3>
<ul>
<li>從「設定」分頁的<b>新增字型</b>可以讀入 <code>.ttf</code> / <code>.otf</code>。</li>
<li><b>內文</b>與<b>標題</b>可以分別指定不同的字型。</li>
<li>新增的字型<b>也會嵌入匯出的閱覽 HTML</b>，所以在收到的人的環境中也會以相同的字形顯示。</li>
</ul>
<div class="note">字型檔很大的話，儲存與匯出會變慢。超過 12MB 的無法處理。建議使用子集化的字型。</div>`,
    'help.npc.title': 'NPC 卡',
    'help.npc.body': `
<h3>NPC 卡</h3>
<h4>名字一帶</h4>
<p>讀音以小字放在名字上方，對齊名字的左端。年齡・性別・立場在名字的右邊。CCFOLIA 棋子的備忘裡，只會放入這個<b>讀音與年齡・立場</b>（角色卡的「備忘」是給 GM 看的，所以不會放進棋子）。</p>
<h4>分頁</h4>
<ul>
<li>用<b>＋新增分頁</b>，可以加入任意數量、能自由填寫標題與內容的區塊。在標題欄輸入名稱，用 × 刪除。展開時也會顯示在紙面上。</li>
<li><b>基本技能</b>是固定的一覽，所以不放在紙面上。只能在詳細視窗中查看。</li>
<li>展開後若會放不進頁面，<b>紙面會保持收合，只在詳細視窗裡展開</b>。紙面的排版不會亂掉。</li>
</ul>
<h4>立繪</h4>
<p>用<b>加上立繪</b>選擇圖片，角色卡就會<b>切換成附立繪的形式</b>。表格等會靠左，右側放入立繪。寬度預設 30%，可以在 15～50% 之間調整。用<b>移除立繪</b>就會恢復原本的形式。</p>
<p>把段落的書式設成「NPC 卡」就能放置。用上方的下拉選單選擇系統（克蘇魯還能切換第 6 版／第 7 版）。</p>
<h4>輸入方式</h4>
<ul>
<li>數值欄點一下就會出現候選。候選中沒有的值也能手動輸入。</li>
<li><b>淡色斜體的數字是自動計算</b>的。覆寫後以手動輸入為優先，把欄位清空就會回到自動計算。</li>
<li>技能依「選類別→選其中的技能」的順序指定。</li>
<li>基本技能與備忘，按標題就能開合。收合的區塊也不會出現在列印・匯出中。</li>
</ul>
<h4>詳細視窗</h4>
<p>展開的內容放不進頁面時，會開啟專用的視窗。可以在那裡編輯而不打亂紙面，內容會立刻反映到頁面上。隨時都能用「在詳細視窗開啟」按鈕開啟。</p>`,
    'help.ccfolia.title': '輸出到 CCFOLIA',
    'help.ccfolia.body': `
<h3>彈出視窗（收納長篇文章）</h3>
<p>彈出視窗的內容也<b>能使用與內文相同的巢狀書式</b>。按編輯視窗上方的按鈕，會在目前游標所在那一行的開頭加上記號。</p>
<table>
<tr><th><code>#</code> <code>##</code> <code>###</code></th><td><b>標題 1・2・3</b>。只在彈出視窗裡使用的寫法（在內文段落中 <code>#</code> 會照原樣當成文字）。</td></tr>
<tr><th><code>- </code> <code>1.</code> <code>- [ ] </code></th><td>條列。記號前面加 2 個空白就縮一層。</td></tr>
<tr><th><code>|項目|内容|</code></th><td>表格。連續寫同樣形式的行就會成為一個表格，第 1 行是標題。</td></tr>
<tr><th><code>「…」</code></th><td>對話文。在前面寫名字就會成為說話者。</td></tr>
<tr><th><code>■</code> <code>＞</code></th><td>小標，以及巢狀的檢定框。</td></tr>
</table>
<p>不能放進去的是<b>圖片與 NPC 卡</b>。兩者都無法只用文字寫出來，請把它們當成內文段落放置。</p>
<h3>讀入 Yutosheet 的表格</h3>
<p>選取雙重十字的 NPC 卡後，右側設定欄會出現<b>讀入 Yutosheet 的表格</b>。請在 Yutosheet 中<b>選取效果表或組合技表並複製</b>，直接貼上。標題列要不要一起貼都可以。</p>
<ul>
<li>讀取每一行以「｜」開頭、項目以「 / 」分隔的形式。會從內容判斷是哪一種表，也可以用按鈕指定。</li>
<li>組合技表的欄位是 <b>組合技名稱／組合／技能／命中／攻擊力／對象／射程／侵蝕值／條件／效果</b>。匯入的組合會以文字原樣放入（重新選擇後，下方的自動計算就會運作）。</li>
<li>效果表的欄位是 <b>種類／名稱／LV／時機／技能／難度／對象／射程／侵蝕值／限制</b>。種類會對照症候群的名稱加上顏色。</li>
<li>效果欄裡的 <code>&amp;lt;br&amp;gt;</code> 會還原成換行。</li>
<li><b>讀入後，該表格的內容會全部被取代。</b>不是追加。</li>
</ul>
<h3>組合技的組合與自動計算</h3>
<p>組合技的<b>組合</b>，是從已輸入的效果中用下拉選單選擇。用「＋效果」增加選擇欄，用「−」減少。像武器這種不在效果表裡的東西，請寫在<b>其他</b>欄。</p>
<p>下列欄位會從選取的效果自動填入。和行動值一樣，<b>自動的值以淡色顯示，手動填寫則以手動為優先</b>。清空就會回到自動。</p>
<table>
<tr><th>侵蝕值</th><td>選取效果的侵蝕值<b>合計</b>。</td></tr>
<tr><th>技能・對象・射程・時機</th><td>排出選取效果中填寫的值。若不一致，會像「Minor／Major」這樣<b>當成候選</b>串起來顯示，請改成正確的那一個。</td></tr>
</table>
<p><b>命中與攻擊力無法自動計算。</b>因為效果表沒有骰子修正・臨界值・攻擊力修正，<code>(5+3)dx+(5-2)@8</code> 中的 <code>+3</code> 或 <code>@8</code> 無法從現有資料算出。請手動填寫。</p>
<h3>圖片的文繞圖</h3>
<p>配置方式有 4 種。</p>
<table>
<tr><th>行內</th><td>只有圖片佔用一行。</td></tr>
<tr><th>靠左繞排／靠右繞排</th><td>放在內文的流動中，<b>不論後面接著幾個段落</b>都會繞排到旁邊。增寫內容時位置也會跟著內文走。</td></tr>
<tr><th>自由配置</th><td>固定在紙面上喜歡的位置。增寫內文也不會移動。</td></tr>
</table>
<p>自由配置有<b>文字的排法</b>設定。</p>
<table>
<tr><th>避開（矩形）</th><td>和 Word 的「矩形」一樣，文字會避開圖片的矩形範圍，而且可以<b>跨越好幾個段落</b>。圖片上方與下方的段落維持全寬。<b>這是預設值。</b></td></tr>
<tr><th>重疊</th><td>文字不避開，直接從圖片下方通過。適合鋪底紋或裝飾時使用。</td></tr>
</table>
<p>「避開」只在<b>單欄的頁面</b>有效。雙欄時會破壞欄的流動，所以不套用。雙欄時想繞排的話，請使用「靠左繞排」「靠右繞排」。<br>
另外，不知道圖片的長寬比就無法決定要避開的高度。舊原稿的圖片會在<b>第一次顯示在紙面上時</b>記住長寬比，從那之後才會避開。</p>
<h3>讀入 CCFOLIA 的棋子</h3>
<p>選取 NPC 卡後，右側設定欄會出現<b>讀入棋子</b>。請把在 CCFOLIA 對棋子按右鍵複製的文字，或角色卡製作工具的「CCFOLIA 輸出」得到的文字，直接貼上。</p>
<ul>
<li>從能力值參數的組成，判斷是<b>Emoklore／Double Cross 3rd／克蘇魯</b>中的哪一個。</li>
<li>填入名稱・讀音・年齡或立場（棋子備忘的第 1 行與第 2 行）・能力值・HP・MP・技能。雙重十字還會讀取侵蝕率・行動值・症候群・效果・組合技。</li>
<li>克蘇魯的技能，<b>清單中有的技能照原樣，沒有的當成「自己輸入」</b>放入。像 <code>芸術:写真</code> 這樣用冒號加上種類的話，會分開放進種類欄。</li>
<li><b>武器會當成技能放入。</b>因為光從棋子的文字無法與技能區分。讀入之後，請手動移到武器欄。</li>
<li>有讀不懂的行時，會告知件數。因為各製作工具的指令寫法不同，那些部分請手動補上。</li>
</ul>
<h3>輸出到 CCFOLIA</h3>
<p>按 NPC 卡上方的<b>複製 CCFOLIA 棋子</b>，棋子的資料就會放進剪貼簿。請在 CCFOLIA 的版面上貼上。無法自動複製的環境，會開啟一個讓你手動複製的視窗。</p>
<h4>輸出的內容</h4>
<table>
<tr><th>Emoklore</th><td>HP・MP 放在狀態，能力值 8 項放在參數。判定用 <code>{共鳴}DM&lt;={強度}</code> 這樣以變數參照。會排出〈∞共鳴〉3 種與基本技能 13 種。</td></tr>
<tr><th>克蘇魯第 6 版</th><td><code>CCB&lt;=</code> 形式。能力值檢定是 <code>CCB&lt;={STR}*5</code>，理智檢定是 <code>1d100&lt;={SAN}</code>。傷害判定會併入傷害加成。</td></tr>
<tr><th>克蘇魯第 7 版</th><td><code>CC&lt;=</code> 形式。能力值直接參照。幸運放在狀態，BLD 與 MOV 放在參數。</td></tr>
<tr><th>雙重十字</th><td>能力值與技能放在參數，判定用 <code>{白兵}dx@10</code> 這樣參照。</td></tr>
</table>
<div class="note">雙重十字的格式是比照另外兩種組成的，尚未在實際環境中確認貼上的結果。</div>`,
    'help.export.title': '列印與匯出',
    'help.export.body': `
<h3>列印與匯出</h3>
<ul>
<li><b>列印 / PDF</b>：只會印出頁面。編輯用的顯示（左側文字、按鈕、收合的區塊）不會出現。</li>
<li><b>匯出閱覽 HTML</b>：會成為一個附目錄的 HTML 檔。新增的字型也會嵌入。</li>
<li>編輯中的內容本身，可以用「儲存」存成 JSON。讀入後就能接著編輯。</li>
</ul>`
  },
  ja: {
    /* ---- 外殼 ---- */
    'app.name': 'シナリオ組版台',
    'app.title': 'シナリオ組版台',
    'nav.home': '← TRPG Toolkit',
    'lang.aria': '表示言語',
    /* ---- 共用的按鈕文字 ---- */
    'common.dup': '複製',
    'common.delete': '削除',
    'common.close': '閉じる',
    'common.cancel': 'やめる',
    'common.rowAdd': '＋行',
    'common.rowDel': '−行',
    'common.preview': '出来上がりを見る',
    'common.writeHere': 'ここに書きます',
    'common.optional': 'なくても構いません',
    'common.color': '色',
    'common.colAdd': '＋列',
    'common.colDel': '−列',
    /* ---- 上方工具列 ---- */
    'top.buildStamp': 'いま動いている版の印。不具合の連絡のときは、この文字も教えてください',
    'top.side': 'パネルの表示切替',
    'top.pages': 'ページ一覧',
    'top.pagesTip': '表紙から奥付まで、全ページを一覧で見る（Ctrl+Shift+P）',
    'top.prop': '設定欄',
    'top.propTip': '選んだ段落の設定欄（紙面の隣）を出し入れします',
    'top.undo': '元に戻す（Ctrl+Z）',
    'top.redo': 'やり直す（Ctrl+Y）',
    'top.zoomOut': '小さく（Ctrl+マイナス／Ctrl+Shift+↓）',
    'top.zoomFit': '押すと幅に合わせます（Ctrl+0）',
    'top.zoomIn': '大きく（Ctrl+プラス／Ctrl+Shift+↑）',
    'top.prj': '作品',
    'top.prjTip': '作品を選ぶ・新しく作る・複製する・消す',
    'top.save': '保存',
    'top.saveTip': 'いまの内容をファイルに保存します（Ctrl+S）',
    'top.open': '開く',
    'top.openTip': '保存したファイルを読み込みます',
    'top.print': '印刷 / PDF',
    'top.printTip': 'ブラウザの印刷からPDFにできます',
    'top.export': '書き出す',
    'top.exportTip': '配布用の閲覧HTMLを書き出します',
    'top.help': 'ヘルプ',
    'top.helpTip': '使い方',
    /* ---- 左側分頁 ---- */
    'tab.write': '書く',
    'tab.page': 'ページ',
    'tab.doc': '文書',
    /* ---- 「書寫」分頁 ---- */
    'blk.selected': '選んだ段落を',
    'blk.up': '↑ 上へ',
    'blk.down': '↓ 下へ',
    'blk.merge': '結合',
    'blk.add': '下に追加',
    'blk.copyText': '文章をコピー',
    'blk.copyTextTip': '選んだ段落（選んでいなければ全文）の文章だけをコピーします',
    'blk.desel': '選択を外す',
    'blk.deselTip': 'どの段落も選ばない状態にします（Escでも同じ）',
    'blk.copyBlk': 'ブロックをコピー',
    'blk.copyBlkTip': '選んだ段落まるごと控えます（文字を選んでいなければ Ctrl+C でも）',
    'blk.paste': '貼り付け',
    'blk.pasteTip': '控えた段落を下に入れます（文字の欄にいなければ Ctrl+V でも）',
    'blk.cols': '段組',
    'blk.col1': 'このページを1段',
    'blk.col1Tip': '選んだ段落が載っているページを1段にします',
    'blk.col2': '2段',
    'blk.col2Tip': '選んだ段落が載っているページを2段にします',
    'blk.emptyPh': '（空の段落）',
    /* ---- 「頁面」分頁 ---- */
    'pg.book': '本のかたち',
    'pg.mkCover': '表紙ページを作る',
    'pg.mkColophon': '奥付ページを作る',
    'pg.target': '対象のページ',
    'pg.all': '全ページを選ぶ',
    'pg.del': '選んだページを削除',
    'pg.delHint': 'そのページに載っている段落ごと消えます。',
    'pg.pattern': '柄',
    'pg.bgImg': '画像を敷く',
    'pg.size': '大きさ',
    'pg.fitCover': '全面を覆う',
    'pg.fitContain': '全体を入れる',
    'pg.fitRepeat': '敷き詰める',
    'pg.opacity': '濃さ',
    'pg.apply': '選択ページに適用',
    'pg.clear': '背景を外す',
    /* ---- 「文件」分頁 ---- */
    'doc.title': 'シナリオ名（書き出しの題名）',
    'doc.margin': '紙面の余白（mm）',
    'doc.v': '上下',
    'doc.h': '左右',
    'doc.footer': '紙面の下（フッター）',
    'doc.pageNum': 'ページ番号を出す',
    'doc.footTextPh': 'いつも出す文字（例：{title}）',
    'doc.firstNum': '最初のページの番号',
    'doc.tokens': '使える記号',
    'doc.tokenList': '{title} 題名<br>{page} 番号<br>{total} 総数',
    'doc.baseSize': '本文の文字サイズ（pt）',
    'doc.font': 'フォント',
    'doc.fontPick': 'PCのフォントから選ぶ',
    'doc.fontAdd': 'ファイルから追加',
    'doc.ttcHint': 'Windowsの日本語フォントは .ttc のことが多く、その場合は中の書体を選べます。',
    'doc.fontBody': '本文',
    'doc.fontHead': '見出し',
    'doc.fontEmbed': '書き出した閲覧HTMLにも埋め込まれます。',
    'doc.saveHint': '自動保存とは別に、上の「保存」で大切な原稿はファイルにも残してください。ほかの作品へは上の「作品」から移れます。',
    'doc.reset': '全部消して最初から',
    'doc.resetTip': 'この作品の中身を消します（ほかの作品はそのまま）',
    /* ---- 窗格與其他介面 ---- */
    'ui.splitter': 'ドラッグで幅を変えられます',
    'ui.charCountTip': '書式の記号・ルビの記号・注を除いた、本文の文字数です',
    'ui.splitterPop': 'つかむと幅が変わります',
    'ui.grip': 'ここをつまむと大きさを変えられます',
    /* ---- 左側文字欄 ---- */
    'src.viewAll': '全体',
    'src.viewAllTip': '本文を続けて表示します',
    'src.viewPage': 'ページ単位',
    'src.viewPageTip': 'ページごとに区切って表示します',
    'src.span': '全幅',
    'src.popContent': '別窓「{0}」の中身',
    'src.popEmpty': '（まだ何も入っていません）',
    'src.tableContent': '表の中身',
    'src.noName': '（名前なし）',
    'src.headCol': '見出し{0}列',
    'src.cell': '{0}行{1}列',
    'src.break': '— 改ページ —',
    'src.colbr': '— 改段（次の段へ） —',
    'src.npc': '［NPCシート］',
    'src.toc': '［目次］',
    'src.table': '［表］',
    'src.rowsCols': '{0}行{1}列',
    'src.popup': '［別窓］',
    'src.popOnly': '升目から指すだけ',
    'src.imgUnset': '［画像 未設定］',
    'src.freeImg': '紙面に直接置いた画像',
    'src.noCaption': '（説明なし）',
    'src.handleTip': 'クリックで選択／ドラッグで移動',
    'src.offPaper': '紙面に出ないもの',
    'src.modeNote': '文章に触れた段落が選択されます',
    'src.modeHelp': '使い方を見る',
    /* ---- 頁面一覽 ---- */
    'pages.pageTip': '全ページを縮小して並べます',
    'pages.toc': '見出し',
    'pages.tocTip': 'タイトルと見出しから目次を作ります',
    'pages.zoom': '大きさ',
    'pages.tocMake': 'この位置に目次ブロックを作る',
    'pages.nItems': '{0}項目',
    'pages.noText': '（文字なし）',
    'pages.empty': '（空のページ）',
    'pages.nPages': '{0}ページ',
    /* ---- 段落共通設定（右側設定欄下半） ---- */
    'cm.text': '文字',
    'cm.ruby': 'ルビを振る',
    'cm.rubyTip': '選んだ文字にルビを振ります（Ctrl+Shift+R）',
    'cm.rubyHint': '｜親文字《ルビ》 と書いてもかまいません。',
    'cm.cols': '2段のときの置き方',
    'cm.spanTip': '段をまたいで横いっぱいに置きます',
    'cm.flowTip': 'ふつうの本文。段の中に収まって流れます',
    'cm.comment': 'コメント',
    'cm.cmtAdd': 'コメントを付ける',
    'cm.cmtAddTip': '左の本文で文字を選んでから押します',
    'cm.cmtDel': 'この段落の注を消す',
    'cm.cmtNote': '本文で文字を選んでから押してください。',
    'cm.color': '文字の色',
    'cm.colorReset': '既定に戻す',
    'cm.indent': '字下げ',
    'cm.indOut': '← 戻す',
    'cm.indOutTip': 'ひとつ戻す（Ctrl+Shift+[）',
    'cm.indIn': '→ 下げる',
    'cm.indInTip': 'ひとつ下げる（Ctrl+Shift+]）',
    'cm.wrap': '画像の回り込み',
    'cm.clr': '回り込みを解除',
    'cm.clrTip': '選んだ段落は画像の横に入らず、画像の下から始まります',
    'cm.margin': 'この段落だけの余白（mm）',
    'cm.top': '上',
    'cm.def': '既定',
    'cm.bottom': '下',
    /* ---- 選取狀態 ---- */
    'sel.inCol': '段の中',
    'sel.hint': '段落を選ぶと、書式や置き方を変えられます。',
    'sel.current': '選択中：',
    'sel.many': '{0}個の段落を選択中',
    /* ---- 分欄的說明 ---- */
    'pcol.target': '対象：P.',
    'pcol.note': '段組はページ単位で決まります。',
    /* ---- 縮排的說明 ---- */
    'ind.now': '今：{0}段（最大4段）',
    'ind.none': '字下げなし',
    'ind.note': '見出し3の下などを1段内側に寄せられます。',
    /* ---- 成品預覽視窗 ---- */
    'prev.hint': '書き出したときと同じ見た目です',
    'prev.title': '{0}の出来上がり',
    'prev.default': '出来上がり',
    /* ---- 輸出範圍對話框 ---- */
    'out.pages': '出すページ',
    'out.range': '範囲',
    'out.pageUnit': 'ページ',
    'out.toc': '目次',
    'out.tocHint': `目次はいつも付きます。読む側で出し入れでき、
        ネタバレよけに見出しを伏せた状態から始まります。`,
    'out.go': '出す',
    'out.printTitle': '印刷 / PDF',
    'out.exportTitle': '閲覧HTMLを書き出す',
    'out.allPages': '全{0}ページ',
    'out.all': '全部',
    /* ---- 右側設定欄 ---- */
    'prop.popName': '別窓の名前',
    'prop.ytIn': 'ゆとシートの表を読み込む',
    'prop.ccf': 'ccfoliaのコマ',
    'prop.pickHint': '段落を選ぶと、その段落だけの設定がここに出ます。',
    'prop.title': '設定',
    'prop.nParas': '{0}個の段落',
    'prop.tableTitle': '表の設定',
    'prop.npcTitle': 'キャラクターシート',
    'prop.popTitle': '別窓の設定',
    'prop.imgTitle': '画像の設定',
    'prop.procTitle': '処理系の設定',
    'prop.typeTitle': '{0}の設定',
    'prop.richLabel': '入れ子の書式（行の頭に入れる印）',
    'prop.richHint1': 'いまカーソルのある行の頭に入れます。本文に触れていなければ、末尾に新しい行として足します。',
    'prop.richHint2': '<b>｜表</b>は同じ形の行を続けると1つの表になり、1行目が見出しです。',
    'prop.speaker': '話し手',
    'prop.tocHead': '目次の見出し語',
    'prop.tocHeadHint': '空にすると見出しそのものを出しません。',
    'prop.tocPick': '何を載せるか',
    'prop.tocPickHint': 'いま{0}項目。押すたびに、載せる／載せないが切り替わります。',
    'prop.tocStyle': '体裁',
    'prop.tocPn': 'ページ番号を出す',
    'prop.tocDots': '点線でつなぐ',
    'prop.tocNote1': '目次に出る文字は、その見出しを選んで',
    'prop.tocNote2': '「目次での書き方」',
    'prop.tocNote3': 'で変えられます。見出しそのものは変わりません。',
    'prop.tocOwn': '目次での書き方',
    'prop.tocOwnPh': '（見出しの文字）',
    'prop.tocOwnHint': '空のままなら、見出しの文字がそのまま目次に出ます。',
    'prop.tocMode': '目次に載せるか',
    'prop.tocModeDef': '目次の設定どおり',
    'prop.tocModeOn': 'かならず載せる',
    'prop.tocModeOff': '載せない',
    'prop.tocModeHint': '目次の側では書式ごと（見出し1、見出し2…）に決めます。ここはこの見出しだけの決めです。',
    'prop.tocLv': '目次での段さげ',
    'prop.tocLvAuto': '書式なり（{0}段目）',
    'prop.tocLvN': '{0}段目',
    'prop.tocLvHint': '目次での見た目の段だけを変えます。紙面の見出しの大きさは変わりません。',
    'prop.flow': '図',
    'prop.flowOpen': '図をひらいて描く',
    'prop.flowHint1': '窓がひらきます。<b>箱をつかんで動かし</b>、右下の四角で大きさを変えられます。',
    'prop.flowHint2': '箱を選ぶと上に出る<b>赤い丸</b>から、つなぎ先の箱まで運ぶと線が引けます。<br>',
    'prop.flowHint3': '分かれ道の先で、さらに分かれ道を作れます。',
    'prop.flowCounts': '　いま箱{0}個・線{1}本。',
    'prop.flowSize': '図の大きさ（mm）',
    'prop.flowWide': '版面より広くすると紙面からはみ出します。',
    'prop.cellOwner': 'この段落が入っている升目',
    'prop.cellOwnerTable': '表「{0}」　',
    'prop.cellOwnerRC': '{0}行{1}列目',
    'prop.cellOwnerHint': '表そのものの見た目・名前を変えるときは、表を選んでください。',
    'prop.tpl': 'テンプレ',
    'prop.tplNoLb': '見出しなし',
    'prop.tplApply': '／この形にします',
    'prop.tplUp': 'いまの見た目で上書きします',
    'prop.tplRen': '名前と見出し語を変えます',
    'prop.tplDel': 'このテンプレを消します',
    'prop.tplNew': 'いまの見た目をテンプレに保存',
    'prop.tplHint': '押すと見た目と見出し語がその形になります。下でさらに細かく変えられます。',
    'prop.tplHint2': '　↑は上書き、✎は名前を変える、×は消す。',
    'prop.lb': '見出し語',
    'prop.lbHint': '空にすると見出しが出ません。',
    'prop.bxln': '枠線',
    'prop.solid': '実線',
    'prop.dash': '破線',
    'prop.none': 'なし',
    'prop.bxbar': '左に太い罫',
    'prop.bxfill': '地色',
    'prop.bxsm': '小さめの字',
    'prop.body': '中身',
    'prop.addSub': '小見出しを足す',
    'prop.addNest': '判定を入れ子で足す',
    'prop.procHint1': '小見出しは',
    'prop.procHintEx1': '■成功した場合',
    'prop.procHint2': '中に入れる判定は',
    'prop.procHintEx2': '＞目星：机の裏に気づく',
    'prop.procHint3': 'の形です。',
    'prop.subCount': '　いま小見出しは{0}個。',
    'prop.imgPos': '置き方',
    'prop.inline': '行内',
    'prop.floatL': '左に流す',
    'prop.floatR': '右に流す',
    'prop.free': '自由配置（本文と別口）',
    'prop.freeHint': '本文の流れから外れています。書き足しても位置は動きません。',
    'prop.imgSize': '大きさ（％）',
    'prop.wrap': '文字の流し方',
    'prop.wrapSquare': 'よける（四角）',
    'prop.wrapNone': '重ねる',
    'prop.wrapNoneHint': '文字は画像を避けずに、下を通ります。',
    'prop.wrapSqHint': '画像の四角ぶんだけ、いくつもの段落にまたがって文字が避けます。',
    'prop.wrapNoAr': '画像の縦横比がまだ分かりません。一度表示されると避けるようになります。',
    'prop.freePos': '紙の左上からの位置（mm）',
    'prop.freePage': 'どのページに置くか',
    'prop.snapTop': '上端へ',
    'prop.snapBottom': '下端へ',
    'prop.snapLeft': '左端へ',
    'prop.snapRight': '右端へ',
    'prop.offset': '置く位置をずらす（mm）',
    'prop.down': '下へ',
    'prop.inward': '内側へ',
    'prop.offsetHint': '1段組のページでだけ効きます。',
    'prop.caption': '説明（画像の下に出ます）',
    'prop.repick': '画像を選び直す',
    'prop.headHintList': '切ると、1行目も内容の1つとして並びます。',
    'prop.headHintCard': '入れると、1行目が各項目の見出し語（内容・備考…）になります。切ると見出し語は出ません。',
    'prop.headHintGrid': '入れると、1行目が見出しの行になります。',
    'prop.titles': 'タイトル',
    'prop.look': '見た目',
    'prop.tblSize': '大きさ',
    'prop.output': '出力',
    'prop.omSimple': '文章',
    'prop.omFree': '自分で',
    'prop.remake': '作り直す',
    'prop.outPh': 'ここが「出力」でコピーされます',
    'prop.copyOut': '出力をコピー',
    'prop.kanaEx': 'ハイジマ ミオ',
    'prop.nameEx': '灰島 澪',
    'prop.age': '年齢・立場',
    'prop.roleEx': '24歳・女性・古書店主',
    'prop.art': '立ち絵',
    'prop.artAdd': 'つける',
    'prop.artHint': '立ち絵を入れると、表が左に寄ります。',
    'prop.openSheet': 'シートを開いて編集',
    'prop.npcHint': '能力値・技能・メモ・タブは、広い窓で書けます。',
    'prop.ccfIn': 'コマを読み込む',
    'prop.ccfInHint1': '「読み込む」は、ccfoliaのコマやキャラシ作成ツールの出力を貼ると、',
    'prop.ccfInHint2': 'システムを見分けて能力値・技能を埋めます。',
    'prop.ccfInHint3': '武器は技能として入ります',
    'prop.ccfInHint4': '（コマの文字だけでは技能と見分けられないため）。',
    'prop.popNameHint': '紙面ではこの名前のボタンになります。表の升目や本文からは <code>＠{0}</code> と書いて指せます。',
    'prop.openPop': '中身の窓を開く',
    'prop.popHintBlocks': '窓の中で段落を押すと、この設定欄でその段落を直せます。紙面から窓へ段落を運ぶこともできます。',
    'prop.popHintText': '空行で段落、<code>|a|b|</code> の行が続くと表になります。',
    'prop.notOnPaper': '紙面に出さない',
    'prop.popOnlyHint': '表の升目から <code>＠{0}</code> と指すだけにして、紙面の本文にはボタンを出しません。中身は書き出しにも追記にも載ります。',
    'prop.blockContent': 'この段落の中身',
    /* ---- 書式名稱 ---- */
    'type.flow': '流れ図',
    'type.desc': '描写文',
    'type.dialog': '会話文',
    'type.note': '注釈',
    'type.proc': '処理系',
    'type.h1': '見出し1',
    'type.h2': '見出し2',
    'type.h3': '見出し3',
    'type.title': 'タイトル',
    'type.subtitle': 'サブ',
    'type.scene': 'シーン移行',
    'type.hr': '罫線',
    'type.vr': '縦線',
    'type.break': '改ページ',
    'type.colbr': '改段',
    'type.image': '画像',
    'type.npc': 'NPCシート',
    'type.table': '表',
    'type.popup': '別窓',
    'type.toc': '目次',
    'type.cover': '表紙',
    'type.colophon': '奥付',
    'type.btnTip': '（Ctrl+Alt+{0} でも同じ。段落を選んでいれば書式を変える／選んでいなければ末尾に足す）',
    /* ---- 書式分類 ---- */
    'group.body': '本文',
    'group.heading': '見出し',
    'group.divider': '区切り',
    'group.insert': '差し込み',
    /* ---- 規則框的標題語（預設值與候選） ---- */
    'label.skill': '技能判定',
    'label.resonance': '共鳴判定',
    'label.action': '行動判定',
    'label.act': '行為判定',
    'label.sanity': '正気度判定',
    'label.fs': 'FS判定',
    'label.check': '判定',
    'label.rule': '特殊ルール',
    'label.staging': '演出',
    'label.gm': 'GM向け',
    /* ---- 規則框的顏色 ---- */
    'bxcol.aka': '朱',
    'bxcol.sumi': '墨',
    'bxcol.ai': '藍',
    'bxcol.koke': '苔',
    'bxcol.kin': '金茶',
    'bxcol.hai': '灰',
    /* ---- 背景花紋 ---- */
    'bg.none': '無地',
    /* ---- 文字顏色 ---- */
    'color.default': '既定',
    'color.aka': '朱',
    'color.ai': '藍',
    'color.green': '深緑',
    'color.purple': '紫',
    'color.kin': '金茶',
    'color.hai': '灰',
    /* ---- 巢狀書式（行首記號）的按鈕 ---- */
    'rich.disc': '- 箇条',
    'rich.discTip': '箇条書き（中黒）にします。markdown と同じ書き方です',
    'rich.num': '1. 番号',
    'rich.numTip': '番号つきの箇条書きにします。markdown と同じ書き方です',
    'rich.box': '- [ ] 選択',
    'rich.boxTip': '選択肢（チェック欄）にします。- [x] と書けば済みの印になります',
    'rich.indent': '段下げ',
    'rich.indentTip': '1つ内側の箇条書きにします。行の頭の半角スペース2つで1段下がります',
    'rich.head': '■見出し',
    'rich.headTip': '囲みの中の小見出しにします',
    'rich.heads': '◇小見出し',
    'rich.headsTip': 'ひとまわり小さい小見出しにします',
    'rich.note': '※注釈',
    'rich.noteTip': '注釈（小さめの補足）にします',
    'rich.nest': '> 判定',
    'rich.nestTip': '処理系の中に、もうひとつ判定の枠を入れます',
    'rich.talk': '「」会話',
    'rich.talkTip': '会話文にします。名前「…」と書けば話し手が付きます',
    'rich.table': '｜表',
    'rich.tableTip': '表にします。同じ形の行を続けると1つの表になります',
    'rich.pop': '＠別窓',
    'rich.popTip': '＠のうしろに別窓の名前を書くと、その別窓を開くボタンになります',
    'rich.slashHint': '／行の頭で {0} と打って空白を押しても入ります',
    'rich.h1': '＃見出し1',
    'rich.h1Tip': 'いちばん大きい見出しにします',
    'rich.h2': '＃＃見出し2',
    'rich.h2Tip': '中くらいの見出しにします',
    'rich.h3': '＃＃＃見出し3',
    'rich.h3Tip': '小さい見出しにします',
    /* ---- 規則框的樣板 ---- */
    'tpl.namePrompt': `このテンプレの名前を書いてください。
（枠線・太罫・地色・字の大きさ・色と、見出し語をまとめて覚えます）`,
    'tpl.mine': '自分のテンプレ',
    'tpl.nameLabel': 'テンプレの名前',
    'tpl.lbPrompt': `このテンプレを押したときに入れる見出し語
（空にすると見出し語は変えません）`,
    'tpl.subHeadLine': `■見出し
`,
    'tpl.nestLine': `> 技能判定：
`,
    /* ---- 目錄 ---- */
    'toc.defaultHead': '目　次',
    'toc.emptyHint': 'タイトルか見出しを設定すると、ここに目次が並びます。',
    /* ---- 表格的寬視窗 ---- */
    'tbldlg.title': '表（広い窓）',
    'tbldlg.hint': '升目は書いた分だけ縦に伸びます。Tabで次の升目へ移れます。',
    /* ---- 表格 ---- */
    'tbl.seedItem': '項目',
    'tbl.seedContent': '内容',
    'tbl.colRoll': '出目',
    'tbl.colHead': '見出し',
    'tbl.colContent': '内容',
    'tbl.colTitle': '題',
    'tbl.colN': '{0}列目',
    'tbl.name': '表の名前',
    'tbl.namePh': '〇〇表',
    'tbl.delCol': 'この列を消す',
    'tbl.delRow': 'この行を消す',
    'tbl.addRow': '行を足す',
    'tbl.addCol': '列を足す',
    'tbl.putInCell': '升目に入れる',
    'tbl.pickBlock': '段落を選ぶ…',
    'tbl.popup': '別窓',
    'tbl.newPopTitle': 'いま選んでいる文字を名前にして、この升目だけの別窓をその場で作ります',
    'tbl.newPop': '＋この升目に別窓を作る',
    'tbl.pointExisting': '既にあるものを差す',
    'tbl.pleasePick': '選んでください',
    'tbl.capTip': '表そのものの名前を紙面に出します',
    'tbl.headTip': '1行目を見出しとして扱います',
    'tbl.colHeadBtn': '列の見出し',
    'tbl.rowHeadTip': '1列目を見出しとして扱います（升目の表だけ）',
    'tbl.rowHeadBtn': '行の見出し',
    'tbl.rowHeadOnlyGrid': 'は升目の表だけで使えます。',
    'tbl.nameHint': '書くと表の上に出ます。空のままなら、名前の欄は紙面に出ません。',
    'tbl.look.grid': '升目',
    'tbl.look.list': '箇条',
    'tbl.look.card': '見出し枠',
    'tbl.lookListHint': '1列目が番号、2列目が見出し、3列目以降が本文です。',
    'tbl.lookCardHint': '1列目が枠の題、2列目以降が中身です。',
    'tbl.delHint': '消すときは、下の升目を一度押してから。',
    'tbl.cells': '升目',
    'tbl.bigWin': '広い窓で書く',
    'tbl.bigHint': '長い文は「広い窓」のほうが書きやすいです。',
    'tbl.targetCell': '行き先は <b>{0}行{1}列</b> の升目です。',
    'tbl.targetHint': '左の書式ボタンを押しても、同じ升目の中に入ります。',
    'tbl.targetNone': '紙面か広い窓で升目を一度押すと、その升目が行き先になります。',
    'tbl.targetHint2': 'そのあと左の書式ボタンを押しても、同じ升目の中に入ります。',
    /* ---- 彈出視窗的編輯視窗 ---- */
    'popwin.titleTip': 'この名前が紙面のボタンになります。升目からは ＠この名前 で指せます',
    'popwin.sideTip': 'この窓の左のパネルを出し入れします',
    'popwin.src': 'テキスト',
    'popwin.srcTip': 'この窓のテキスト欄を出し入れします',
    'popwin.propTip': 'この窓の右の設定欄を出し入れします',
    'popwin.copyTextTip': '選んだ段落の文章だけをコピーします',
    'popwin.copyBlkTip': '選んだ段落まるごと控えます',
    'popwin.pasteTip': '控えた段落を下に入れます',
    'popwin.propHint': '設定（この窓の段落を選ぶと出ます）',
    'popwin.hintBlocks': 'この窓の左のパネルで書式を、右の設定欄で細かいところを決められます',
    'popwin.hintText': '空行で段落。下のボタンで見出し・箇条書き・表などを入れられます',
    'popwin.editPh': `ここに長い文章や表を書きます。

|項目|内容|
|所在|灰色の街のはずれ|`,
    /* ---- 彈出視窗 ---- */
    'pop.defaultLabel': 'くわしく',
    'pop.emptyText': '（まだ何も書かれていません）',
    'pop.emptyBlocks': '（まだ何も入っていません。上の「足す」か、紙面から段落を運んで入れられます）',
    'pop.missMake': '（押すと作ります）',
    /* ---- 流程圖 ---- */
    'flow.addBox': '＋箱',
    'flow.addBoxTip': '四角い箱を足します',
    'flow.addRound': '＋角丸',
    'flow.addRoundTip': '角の丸い箱を足します',
    'flow.addDiamond': '＋ひし形',
    'flow.addDiamondTip': 'ひし形（判断）を足します',
    'flow.addTerm': '＋丸端',
    'flow.addTermTip': '丸端（開始・終わり）を足します',
    'flow.zoomOut': '表示を小さく',
    'flow.zoomIn': '表示を大きく',
    'flow.kind.box': '四角',
    'flow.kind.round': '角丸',
    'flow.kind.diamond': 'ひし形',
    'flow.kind.term': '丸端',
    'flow.kind.io': '平行四辺形',
    'flow.empty': '（流れ図。右の設定欄の「図をひらく」から作れます）',
    'flow.hint': '箱をつかんで動かし、右下の四角で大きさを変えられます',
    'flow.linkTip': 'ここをつまんで、つなぎ先の箱まで運ぶと線が引けます',
    'flow.gripTip': 'つまむと箱の大きさが変わります',
    'flow.pickTarget': 'つなぎ先の箱を押してください（余白を押すとやめます）',
    'flow.al.left': '左ぞろえ',
    'flow.al.hcenter': '左右中央',
    'flow.al.right': '右ぞろえ',
    'flow.al.top': '上ぞろえ',
    'flow.al.vcenter': '上下中央',
    'flow.al.bottom': '下ぞろえ',
    'flow.al.wsame': '横幅をそろえる',
    'flow.al.hsame': '高さをそろえる',
    'flow.al.hgap': '横の間を均等に',
    'flow.al.vgap': '縦の間を均等に',
    'flow.manySel': '{0}個の箱を選んでいます。',
    'flow.manyHint': 'まとめて動かせます（<code>Shift</code>を押しながら押すと選び足し）。',
    'flow.align': 'そろえる',
    'flow.bulkChange': 'まとめて変える',
    'flow.defaultCol': '既定（墨）',
    'flow.bulkSize': '大きさをまとめて（mm）',
    'flow.w': 'よこ',
    'flow.keep': 'そのまま',
    'flow.h': 'たて',
    'flow.bulkPad': '内側の余白をまとめて（mm）',
    'flow.bulkDup': 'まとめて複製',
    'flow.bulkDel': 'まとめて消す',
    'flow.text1': '1段目の文字',
    'flow.text2': '2段目（入れると箱が上下に分かれます）',
    'flow.kind': '枠のかたち',
    'flow.size': '大きさ（mm）',
    'flow.pos': '置き場所（mm）',
    'flow.fromLeft': '左から',
    'flow.fromTop': '上から',
    'flow.pad': '内側の余白（mm）',
    'flow.linkFrom': 'ここから線を引く',
    'flow.delBox': 'この箱を消す',
    'flow.edgeLabel': '線の添え書き',
    'flow.edgeLabelPh': '成功／失敗 など',
    'flow.edgeDir': '線の向きは「元の箱 → 先の箱」です。',
    'flow.flip': '向きを入れ替える',
    'flow.delLine': 'この線を消す',
    'flow.idleHint1': '箱や線を押すと、そこの設定が出ます。',
    'flow.idleHint2': '上の「＋箱」などで足せます。箱を選んでから足すと、その下につながります。',
    'flow.whole': '図ぜんたいの大きさ（mm）',
    'flow.fit': '中身に合わせる',
    'flow.counts': '箱{0}個・線{1}本。',
    'flow.tooWide': '版面より広いと紙面からはみ出します。',
    'flow.hintInit': '箱をつかんで動かし、右下でも大きさを変えられます',
    /* ---- 圖片 ---- */
    'img.unset': '画像が未設定です（「書く」タブの「画像」から選んでください）',
    /* ---- 紙面上的頁面標題列 ---- */
    'page.select': '選択',
    'page.cols2': '2段組',
    'page.cols1': '1段組',
    'page.toggleCols': '段組を切替',
    'page.c2': '2段',
    'page.c1': '1段',
    'page.plusImg': '＋画像',
    /* ---- 字數 ---- */
    'count.chars': '{0}字',
    /* ---- 註解 ---- */
    'cmt.note': '注',
    /* ---- 電腦字型清單 ---- */
    'fontdlg.title': 'PCのフォント',
    'fontdlg.filter': '名前で絞り込む',
    /* ---- 字型 ---- */
    'font.fsNoEmbed': '配布物への埋め込みが許可されていません',
    'font.fsPreview': '閲覧と印刷にかぎり埋め込みが許可されています',
    'font.fsBitmap': 'ビットマップのみ埋め込み可とされています',
    'font.tooBig': `このフォントは大きすぎて取り込めません（{0}MB相当）。
別のフォントか、サブセット化したものをお使いください。`,
    'font.warnAlert': `「{0}」について：{1}。
手元で見る・印刷するぶんには問題ありませんが、書き出したHTMLを人に渡す場合はご注意ください。`,
    'font.faceN': '書体{0}',
    'font.pickFace': `このファイルには{0}つの書体が入っています。番号で選んでください。

`,
    'font.defaultMincho': '既定（明朝）',
    'font.sameAsBody': '本文と同じ',
    'font.sample': 'あア亜Aa',
    'font.del': '削除',
    'font.none': '（まだ追加されていません）',
    'font.over40': '40MBを超えるフォントは扱えません。',
    'font.noLocalFonts': `このブラウザではフォントの一覧を出せません。
「ファイルから追加」で、フォントのファイルを選んでください。

Windowsのフォントは C:\\Windows\\Fonts にあります。ファイル選択画面のファイル名の欄に
  C:\\Windows\\Fonts\\meiryo.ttc
のように直接打ち込むと開けます。`,
    'font.permDenied': `フォントの一覧を出す許可が下りませんでした。
アドレスバーの左のアイコンから「フォント」を許可すると使えます。

「ファイルから追加」でも取り込めます。`,
    'font.notFound': 'フォントが見つかりませんでした。',
    'font.sample2': 'あア亜 Aa 123',
    'font.noMatch': '見つかりませんでした。',
    'font.extractFailed': '「{0}」のデータを取り出せませんでした。別のフォントをお試しください。',
    /* ---- NPC 卡的詳細視窗 ---- */
    'npcdlg.title': 'NPCシート（詳細ウィンドウ）',
    /* ---- NPC 卡（標籤與按鈕；各系統的資料表保留原文，見 npc-data.js） ---- */
    'npc.pickAttr': '属性を選ぶ',
    'npc.pickEmotion': '感情を選ぶ',
    'npc.cat': '系統',
    'npc.pickSkill': '技能を選ぶ',
    'npc.argPh': '種別',
    'npc.emo.baseSkill': 'ベース技能',
    'npc.refAbility': '参照能力',
    'npc.targetValue': '判定値',
    'npc.emo.kyomei': '初期共鳴レベル',
    'npc.emo.res': '共鳴感情',
    'npc.emo.skills': '習得技能',
    'npc.addRow': '＋行を追加',
    'npc.delEmptyRows': '空の行を消す',
    'npc.skill': '技能',
    'npc.rowUnit': '行',
    'npc.dx.timing': 'ﾀｲﾐﾝｸﾞ',
    'npc.dx.dif': '難易度',
    'npc.dx.tgt': '対象',
    'npc.dx.rng': '射程',
    'npc.dx.enc': '侵蝕値',
    'npc.dx.lim': '制限',
    'npc.dx.name': '名称',
    'npc.dx.hit': '命中',
    'npc.dx.atk': '攻撃力',
    'npc.dx.pickDash': '— 選ぶ —',
    'npc.dx.goneEffect': '（消えたエフェクト）',
    'npc.dx.addEffectHint': '「＋エフェクト」で足してください',
    'npc.dx.addEffect': '＋エフェクト',
    'npc.dx.other': 'その他',
    'npc.dx.otherPh': '武器など、エフェクト表にないもの',
    'npc.dx.comboName': 'コンボ名',
    'npc.dx.combo': '組み合わせ',
    'npc.dx.cond': '条件',
    'npc.dx.condPh': '100%未満 など',
    'npc.dx.eff': '効果',
    'npc.dx.effPh': '効果・備考',
    'npc.pick': '選ぶ',
    'npc.dx.breed': 'ブリード',
    'npc.dx.syn': 'シンドローム',
    'npc.dx.encFixed': '侵蝕率(固定)',
    'npc.dx.abSkills': '能力値と技能',
    'npc.dx.act': '行動値',
    'npc.dx.hpMax': 'HP最大値',
    'npc.dx.stock': '常備化Pt',
    'npc.dx.effects': 'エフェクト',
    'npc.dx.combos': 'コンボ',
    'npc.coc.hp': '耐久力',
    'npc.coc.san': '正気度',
    'npc.coc.idea': 'アイデア',
    'npc.coc.luck': '幸運',
    'npc.coc.know': '知識',
    'npc.coc.build': 'ビルド',
    'npc.coc.skillNamePh': '技能名を書く',
    'npc.coc.pickFromList': '一覧から選ぶ',
    'npc.coc.list': '一覧',
    'npc.coc.writeOwn': '自分で書く…',
    'npc.coc.weaponName': '武器名',
    'npc.coc.dmg': 'ダメージ',
    'npc.coc.mainSkills': '主要技能',
    'npc.coc.weapons': '武器',
    'npc.coc.skillPct': '技能％',
    'npc.sys.emoklore': 'エモクロアTRPG',
    'npc.sys.dx3rd': 'ダブルクロス3rd(RC)',
    'npc.sys.coc': 'クトゥルフ神話TRPG',
    'npc.system': 'システム',
    'npc.ver': '版',
    'npc.ver7': '7版',
    'npc.ver6': '6版',
    'npc.copyCcf': 'ccfoliaのコマをコピー',
    'npc.addArt': '立ち絵をつける',
    'npc.openModal': '詳細ウィンドウで開く',
    'npc.tag6': '・6版',
    'npc.tag7': '・7版',
    'npc.artWidth': '幅',
    'npc.artChange': '変える',
    'npc.artRemove': '外す',
    'npc.kanaPh': 'フリガナ',
    'npc.namePh': 'NPC名',
    'npc.nameEmpty': '（NPC名）',
    'npc.rolePh': '年齢・性別・職業／立場',
    'npc.memo': 'メモ',
    'npc.memoPh': '口調・行動方針・扱い方など',
    'npc.tabNamePh': 'タブの名前',
    'npc.tabDel': 'このタブを消す',
    'npc.tabNoName': '（名前のないタブ）',
    'npc.tabAdd': '＋タブを追加',
    'npc.modalNote': 'ページに収まらないので、紙面は閉じたままにしてこちらで開きました',
    'npc.tabUnnamed': '名前なし',
    'npc.overflow': 'ページに収まりません',
    /* ---- 系統簡稱 ---- */
    'sys.short.emoklore': 'エモクロア',
    'sys.short.dx3rd': 'ダブルクロス3rd',
    'sys.short.coc': 'クトゥルフ',
    /* ---- 讀入 Yutosheet 的表格 ---- */
    'yt.hint': `ゆとシートのエフェクト表かコンボ表を選んでコピーし、そのまま貼り付けてください。
      見出しの行は入れても入れなくてもかまいません。`,
    'yt.auto': '自動で見分ける',
    'yt.effect': 'エフェクト表',
    'yt.combo': 'コンボ表',
    'yt.placeholder': '|コンセントレイト / … / 白兵 / (5+3)dx+(5-2)@8 / 22 / 単体 / 10m / 8 / 100%未満 / ',
    'yt.go': '読み込む',
    'yt.noRows': '表の行が見つかりませんでした。項目が「 / 」で区切られた行を貼り付けてください。',
    'yt.nothingRead': '読み取れる行がありませんでした。',
    'yt.loadedCombo': 'コンボ表を{0}件読み込みました',
    'yt.loadedEffect': 'エフェクト表を{0}件読み込みました',
    /* ---- 讀入 CCFOLIA 的棋子 ---- */
    'ccfin.title': 'ccfoliaのコマを読み込む',
    'ccfin.hint': `ccfoliaでコマを右クリック→コピー、または キャラクターシート作成ツールの
      「ccfolia出力」で得た文字を、そのまま貼り付けてください。`,
    'ccfin.unreadable': 'ccfoliaのコマとして読めませんでした。{ } を含む文字ぜんぶを貼り付けてください。',
    'ccfin.unknownSys': 'どのシステムのコマか分かりませんでした。能力値のパラメータが入っているか確かめてください。',
    'ccfin.readAs': '{0}として読み込みました',
    'ccfin.nSkills': '技能{0}件',
    'ccfin.nEffects': 'エフェクト{0}件',
    'ccfin.nCombos': 'コンボ{0}件',
    'ccfin.nOver': '12行に収まらなかった技能{0}件',
    'ccfin.nUnread': '読めなかった行{0}件',
    /* ---- CCFOLIA 棋子（手動複製） ---- */
    'ccf.manual': '自動コピーができませんでした。下の内容を全選択してコピーし、ccfoliaの盤面で貼り付けてください。',
    /* ---- 作品清單・過去的版本・垃圾桶 ---- */
    'prj.listAria': '作品の一覧',
    'prj.new': '新しく作る',
    'prj.gens': '過去の版',
    'prj.trash': 'ゴミ箱',
    'prj.back': 'もどる',
    'prj.genRestore': 'この版を新しい作品として戻す',
    'prj.restore': '戻す',
    'prj.untitled': '無題のシナリオ',
    'prj.busy': 'この作品は別のタブで編集中のため開けません。そちらのタブを閉じてから開いてください。',
    'prj.sizeMB': '{0}MB相当',
    'prj.sizeKB': '{0}KB相当',
    'prj.noStore': 'このブラウザでは作品の置き場を使えないため、作品を1つだけ保存します。',
    'prj.gensNote': '作品「{0}」の過去の版です。戻すと新しい作品になり、いまの作品はそのまま残ります。',
    'prj.trashNote': 'ゴミ箱に入れた作品は30日たつと消えます。',
    'prj.trashEmpty': 'ゴミ箱は空です。',
    'prj.daysLeft': 'あと{0}日',
    'prj.listNote': '{0} 作品。ダブルクリックか Enter で開きます。作品はこのブラウザの中に保存されます。大切な原稿は「保存」でファイルにも残してください。',
    'prj.busyTag': '別のタブで編集中',
    'prj.file': 'ファイル：',
    'prj.notSaved': '未保存',
    'prj.copySuffix': '（写し）',
    'prj.genSuffix': '（{0}の版）',
    /* ---- 範例原稿（依建立當下的語言放入，建立後屬於使用者資料） ---- */
    'sample.subtitle': 'クトゥルフ神話TRPG　シナリオ',
    'sample.intro': '導入',
    'sample.desc': 'ここに導入の描写を書きます。左側が本文、右側が組み上がったページです。左に書いた内容がそのままページへ流れます。',
    'sample.dialog': '「まずは、この段落をクリックしてみてください」',
    'sample.proc': '〈目星〉に成功すると、机の裏に張り付いた封筒を見つける。',
    /* ---- 版權頁的範本（建立當下的語言） ---- */
    'colophon.author': '著者：',
    'colophon.publisher': '発行：',
    /* ---- 狀態列的訊息 ---- */
    'status.ccfCopied': 'ccfoliaのコマをコピーしました',
    'status.ccfManual': '自動コピー不可。手動でコピーしてください',
    'status.cantUndo': 'これ以上は戻せません',
    'status.undone': '元に戻しました（やり直しは Ctrl+Y）',
    'status.cantRedo': 'やり直せる操作はありません',
    'status.redone': 'やり直しました',
    'status.openElsewhere': 'この作品は別のタブでも開かれています。両方で書くと、あとから保存したほうで上書きされます',
    'status.autoSaveFailed': '自動保存に失敗しました',
    'status.autoSavedUnsaved': '自動保存しました（未保存の変更あり）',
    'status.autoSaved': '自動保存しました',
    'status.tooBigSkip': '内容が大きいため自動保存を省きました。「保存」でファイルに残してください',
    'status.quotaExceeded': '自動保存の容量を超えました。「保存」でファイルに残してください',
    'status.savedToFile': 'ファイルに保存しました',
    'status.migrateFailed': '以前の自動保存を引き継げなかったため、古い保存場所に残しています',
    'status.clickCell': '升目を一度押してください',
    'status.cellAdded': '升目に{0}を入れました',
    'status.popCreated': '別窓「{0}」を作りました。中身を書いてください',
    'status.fontFailed': 'フォントを取り込めませんでした',
    'status.fontAdded': 'フォント「{0}」を追加しました（{1}MB）',
    'status.importCancelled': '取り込みをやめました',
    'status.extractingFace': '書体を取り出しています…',
    'status.fontLoading': 'フォントを読み込んでいます…',
    'status.fontReading': '「{0}」を読み込んでいます…',
    'status.fontCantImport': 'このフォントは取り込めませんでした',
    'status.popsCreated': '別窓「{0}」を作りました',
    'status.pastedParas': '{0}段落として取り込みました',
    'status.cantDelLast': '最後の段落は消せません',
    'status.paraDeleted': '段落を消しました',
    'status.parasDeleted': '{0}段落を削除しました',
    'status.nothingToMove': '動かす段落が見つかりませんでした',
    'status.noDropTarget': '落とし先が分かりませんでした',
    'status.cantDropIntoSelf': 'その段落自身の中へは入れられません（別窓や表を、自分の中へ落としています）',
    'status.parasSelected': '{0}段落を選びました',
    'status.movedToCell': '{0}段落を表の升目（{1}行{2}列）へ入れました',
    'status.movedToPop': '{0}段落を別窓の中へ移しました',
    'status.movedToPaper': '{0}段落を紙面へ戻しました',
    'status.moved': '{0}段落を移動しました',
    'status.handleOnPage': '{0}は右のページ側で扱います',
    'status.tabAdded': 'タブを足しました',
    'status.artRemoved': '立ち絵を外しました',
    'status.maxRows': '{0}行までです',
    'status.keepRows': '初期の{0}行までは残します',
    'status.boxesDeleted': '{0}個の箱を消しました',
    'status.lineDeleted': '線を消しました',
    'status.pickToDelete': '消したい箱か線を押してください',
    'status.lineConnected': '線をつなぎました',
    'status.lineCancelled': '線をやめました',
    'status.boxesSelected': '{0}個の箱を選びました',
    'status.pick2': '2つ以上の箱を選んでください',
    'status.boxesAligned': '{0}個の箱をそろえました',
    'status.boxDeleted': '箱を消しました',
    'status.artLoading': '立ち絵を読み込んでいます…',
    'status.artAdded': '立ち絵をつけました',
    'status.cantInCell': '{0}は升目の中には入れられません',
    'status.addedToCell': '升目（{0}行{1}列）に{2}を入れました',
    'status.typeAdded': '{0}を足しました',
    'status.fullWidthOnly': 'NPCシートと流れ図は全幅のみです',
    'status.propHint': '表・キャラシ・別窓・囲みの段落を選ぶと中身が出ます',
    'status.cantReduce': 'これ以上は減らせません',
    'status.clickRowCell': '消したい行の升目を一度押してください',
    'status.clickColCell': '消したい列の升目を一度押してください',
    'status.remade': '表から作り直しました',
    'status.noOutput': '出力する文がありません',
    'status.outCopied': '出力の文をコピーしました',
    'status.copyFailed': 'コピーできませんでした',
    'status.tplSaved': 'テンプレ「{0}」を保存しました',
    'status.tplOverwritten': 'テンプレ「{0}」を上書きしました',
    'status.tplFixed': 'テンプレを直しました',
    'status.tplDeleted': 'テンプレを消しました',
    'status.keepOne': 'ひとつは残してください',
    'status.clickCellFirst': '先に升目を一度押してください（紙面でも広い窓でも）',
    'status.rubyPick': 'ルビを振る文字を、本文の中で選んでください',
    'status.rubyWrite': '《》の中に読みを書いてください',
    'status.rubyForm': '｜親文字《ルビ》の形で書いてください',
    'status.sameList': '同じ並びの中の段落を選んでください',
    'status.cantMerge': 'NPCシート・目次・改ページ・改段は結合できません',
    'status.merged': '{0}個の段落を結合しました',
    'status.tocMade': '目次ブロックを作りました',
    'status.imgLoaded': '画像を読み込みました',
    'status.pageCols': '{0} を{1}段にしました',
    'status.pagesDeleted': '{0}ページを削除しました',
    'status.bgApplied': '{0}ページに適用しました',
    'status.imgLoading': '画像を読み込んでいます…',
    'status.imgInserted': '画像を入れました',
    'status.deselected': '選択を外しました',
    'status.pickToCopy': 'コピーしたい段落を選んでください',
    'status.parasCopied': '{0}個の段落を控えました',
    'status.nothingToPaste': '控えた段落がありません',
    'status.parasPasted': '{0}個の段落を貼り付けました',
    'status.cmtPick': '左の本文で、注を付けたい文字を選んでください',
    'status.cmtNoCell': '表の升目の中の文字には注を付けられません',
    'status.cmtAdded': 'コメントを付けました',
    'status.cmtPickPara': '注の付いた段落を選んでください',
    'status.cmtDeleted': '注を消しました',
    'status.colorNoCell': '表の升目の中は、一部の文字だけ色を変えることはできません。表ぜんたいの色は右のプロパティで変えられます',
    'status.colorSel': '選んだ文字の色を変えました',
    'status.colorSelReset': '選んだ文字の色を戻しました',
    'status.colorPick': '色を変えたい文字か段落を選んでください',
    'status.colorPara': '段落の色を変えました',
    'status.colorParaReset': '段落の色を戻しました',
    'status.indentPick': '字下げしたい段落を選んでください',
    'status.markInserted': '{0}を入れました',
    'status.markChanged': '{0}に変えました',
    'status.markInCell': '{0}を、{1}行{2}列の升目に入れました',
    'status.markPickCell': '印を入れたい升目を、先にクリックしてください',
    'status.markPickLine': '入れたい行を、左の本文の中でクリックしてください',
    'status.imgPick': '画像の段落を選んでください',
    'status.imgInline': '行内に置きました',
    'status.imgLeft': '左に流しました',
    'status.imgRight': '右に流しました',
    'status.imgFree': '自由配置にしました',
    'status.imgPickFree': '自由配置の画像を選んでください',
    'status.imgSnapped': '端に寄せました',
    'status.clrPick': '回り込みを解除したい位置の段落を選んでください',
    'status.clrPickNormal': '画像より下の、ふつうの段落を選んでください',
    'status.clrToggled': '回り込みの切り替えをしました',
    'status.loadedAsNew': '新しい作品として読み込みました',
    'status.loaded': '読み込みました',
    'status.exported': '閲覧HTMLを書き出しました（P.{0}〜{1}）',
    'status.textCopied': '{0}段落の文章をコピーしました',
    'status.allCopied': '本文をすべてコピーしました',
    'status.coverExists': '表紙はすでにあります',
    'status.coverMade': '表紙ページを作りました',
    'status.colophonExists': '奥付はすでにあります',
    'status.colophonMade': '奥付ページを作りました',
    'status.prjUnreadable': 'この作品は読み込めませんでした',
    'status.prjOpened': '作品「{0}」を開きました',
    'status.prjCreated': '新しい作品を作りました',
    'status.dupFailed': 'この作品は複製できませんでした',
    'status.created': '「{0}」を作りました',
    'status.trashed': '作品「{0}」をゴミ箱に入れました',
    'status.genFailed': 'この版は戻せませんでした',
    'status.restored': '作品をゴミ箱から戻しました',
    'status.singleOnly': 'このブラウザでは作品を1つだけ保存します（作品の置き場を使えません）',
    'status.repaired': '一覧から外れていた作品を{0}件戻しました',
    'status.recovered': '前回保存しきれなかった分を戻しました（{0}）',
    'status.ready': '準備できました',
    /* ---- 儲存失敗時的橫條 ---- */
    'bar.saveFailed': '保存できていません。この画面を閉じる前に「保存」でファイルに残してください。',
    'bar.retry': 'もう一度試す',
    'bar.filePaused': 'ファイルへの自動保存を止めています。',
    'bar.resume': '再開する',
    /* ---- 檔案 ---- */
    'file.jsonDesc': '組版台の原稿（JSON）',
    /* ---- 確認視窗 ---- */
    'confirm.migrated': `以前の自動保存を、作品「{0}」として引き継ぎました。

古い保存場所からは消します。古い版の組版台では、この原稿が見えなくなります。
（キャンセルすると消さずに残し、次に起動したときにもう一度たずねます）`,
    'confirm.fontDelete': 'フォント「{0}」を削除します。よろしいですか？',
    'confirm.tabDelete': 'タブ「{0}」を消します。よろしいですか？',
    'confirm.artRemove': '立ち絵を外します。よろしいですか？',
    'confirm.tocExists': '目次はすでにあります。もう1つ作りますか？',
    'confirm.tplExists': '「{0}」はすでにあります。上書きしますか？',
    'confirm.tplOverwrite': 'テンプレ「{0}」を、いまの見た目で上書きします。よろしいですか？',
    'confirm.tplDelete': `テンプレ「{0}」を消します。よろしいですか？
（この形で作った段落はそのまま残ります）`,
    'confirm.delParas': '{0}個の段落を削除します。よろしいですか？',
    'confirm.bigBg': '2.5MBを超える画像です。保存できない場合があります。続けますか？',
    'confirm.pageDelete': '{0} を、載っている{1}個の段落ごと削除します。よろしいですか？',
    'confirm.replaceOnly': 'このブラウザでは作品を1つしか持てません。いまの原稿を、読み込んだ原稿で置き換えますか？',
    'confirm.reset': 'すべての内容を消して最初からやり直します。よろしいですか？',
    'confirm.trash': '作品「{0}」をゴミ箱に入れます。30日のあいだは「ゴミ箱」から戻せます。',
    /* ---- 提示視窗 ---- */
    'alert.pickPageToDel': '消すページを「対象のページ」で選んでください。',
    'alert.noParaOnPage': 'そのページには段落がありません。',
    'alert.pickPageToApply': '適用するページを選んでください。',
    'alert.pickPageToClear': '外すページを選んでください。',
    'alert.badFile': 'このファイルは読み込めませんでした。この組版台で保存したJSONを選んでください。',
    /* ---- 輸入視窗 ---- */
    'prompt.cmt': `この文字に付ける注を書いてください。

「{0}」`,
    /* ---- 匯出的閱覽 HTML（依匯出當下的語言） ---- */
    'export.appendix': '追記',
    'export.noContent': '（内容がありません）',
    'export.showToc': '目次を出す',
    'export.hideToc': '目次を隠す',
    'export.copied': 'コピーしました',
    'export.showHeads': '見出しを見せる',
    'export.hideHeads': '見出しを伏せる',
    'export.untitled': 'シナリオ',
    'export.toc': '目次',
    /* ---- 說明視窗 ---- */
    'help.start.title': 'はじめに',
    'help.start.body': `
<h3>はじめに</h3>
<p>左が本文のテキスト、右が組み上がったページです。左に書いた内容がそのまま右へ流れ、はみ出したぶんは自動で次のページへ送られます。</p>
<h4>書きかたと選びかた</h4>
<p>モードの切り替えはありません。本文はいつでもそのまま打てて、<b>文章に触れた段落がそのまま選択されます</b>。つまみや書式名の欄を押しても選べます。どれも選んでいない状態にしたいときは、<code>Esc</code>をもう一度押すか、本文欄の余白を押すか、「書く」タブの<b>選択を外す</b>を使います（何も選んでいなければ、書式ボタンは末尾に新しく足します）。<code>Enter</code>で次の段落、段落の先頭で<code>Backspace</code>で前の段落とつながります。</p>
<h4>左と右の使い分け</h4>
<p><b>左（道具パネル）は、ページや文書ぜんたいに関わること。右（設定欄）は、いま選んでいる段落そのもの。</b>という分け方です。</p>
<table>
<tr><th>左・書く</th><td>書式を選ぶ（＝段落を足す／変える）、段落を並べ替える・複製する・消す、ページの段組。</td></tr>
<tr><th>左・ページ</th><td>表紙・奥付づくり、ページごとの段組、背景。</td></tr>
<tr><th>左・文書</th><td>シナリオ名、紙面の余白、文字サイズ、フォントなど、原稿ぜんたいの設定。</td></tr>
<tr><th>右・設定欄</th><td>選んだ段落の中身と見た目。書式ごとの欄（表・キャラシ・画像・処理系など）と、
どの段落にも共通の欄（入れ子の書式、ルビ、2段のときの置き方、コメント、文字の色、字下げ、この段落だけの余白）。</td></tr>
</table>
<p>右の設定欄は、段落を選ぶと出ます。上の<b>設定欄</b>ボタンで、選んでいないときも開いたままにできます。</p>
<h4>本文の表示</h4>
<table>
<tr><th>全体</th><td>本文を続けて表示します。通して読み書きするとき。</td></tr>
<tr><th>ページ単位</th><td>どの段落がどのページに載るかを、区切り線つきで表示します。ページ数を調整するとき。</td></tr>
</table>
<h4>選んだところの色</h4>
<p>段落を選ぶと薄い金色が敷かれます。この色は<b>書式そのものより下</b>に置いてあるので、見出し1のような濃い背景と白い文字でも、読めなくなりません。</p>
<h4>ページの先頭</h4>
<p>ページのいちばん上に来たものは、上の余白が自動で落ちます。見出し1をページの頭に置いたとき、上に隙間が空かず、紙面の余白のところから始まります。表紙だけは、紙面の中ほどに置きたいのでそのままです。個別に指定したいときは「この段落だけの余白」が優先されます。</p>
<h4>表</h4>
<p>「書く」タブの<b>表</b>（<code>Ctrl</code>+<code>Alt</code>+<code>X</code>）で入ります。書きたいところを押してそのまま打てます。表の上のボタンで行と列を増減します。表の名前は表の上に直接書き込めます。</p>
<h4>2つの見た目</h4>
<table>
<tr><th>升目</th><td>ふつうの罫線の表です。<b>見出し行</b>・<b>見出し列</b>を切り替えられます。</td></tr>
<tr><th>箇条</th><td>ひと枠の中を横線で区切り、各段を<b>「番号：見出し」と、その下の本文</b>で並べます。場面表・遭遇表・ランダム表のように、1項目ごとに数行の描写が付くものに向きます。1列目が番号、2列目が見出し、3列目以降が本文です。</td></tr>
</table>
<table>
<tr><th>出力</th><td>出力の文をそのままコピーします。Discordやココフォリアのチャットに貼れます。</td></tr>
<tr><th>出力の文</th><td>押すと編集欄が開きます。<b>roll-table形式</b>を選ぶと表から自動で作られ、<b>自分で書く</b>を選べば好きな文にできます。</td></tr>
</table>
<p>roll-table形式は、ココフォリアの <code>/roll-table</code> に合わせて「1行目に表の名前、2行目にダイス式、以降 <code>出目:結果</code>」で作ります。表の1列目が数字（<code>1</code> や <code>1-3</code>）なら、それを出目として使います。結果の中の改行は、BCDiceの決まりに合わせて <code>
</code> と書き出します。お使いの環境がちがう書き方なら、<b>自分で書く</b>に切り替えて直せます。</p>
<h4>別窓</h4>
<p>紙面には<b>ボタンだけ</b>を置き、長い文章はその中にしまう書式です（<code>Ctrl</code>+<code>Alt</code>+<code>W</code>）。ページ数を増やさずに、込み入った資料を持たせられます。</p>
<ul>
<li>ボタンを押すと窓が開きます。<b>窓の中だけで書き上げられます</b>。左から順に、
<b>パネル</b>（書式と段落の操作）・<b>テキスト</b>・<b>紙面</b>・<b>設定欄</b>の4つが並びます。
本窓と同じ並びなので、後ろの本窓に戻る必要はありません。</li>
<li>仕切りをつかむと、それぞれの幅を変えられます。二度押しで元の幅に戻ります。</li>
<li>窓の右上の <b>&#9776;</b>・<b>テキスト</b>・<b>設定欄</b> で、それぞれの欄を出し入れできます。
画面が狭くて4つとも並びきらないときは、はじめだけ<b>テキスト欄をたたんで</b>開きます
（同じ中身は右の紙面にも出ているので、たたんだままでも書けます）。
いちど自分で出し入れすれば、その後はその決めのままです。</li>
<li>この窓は<b>本窓のテキスト欄を覆わない位置</b>に出ます。紙面の段落をつかんで、この窓へ運べるようにするためです。
窓は帯をつかんで動かせ、四辺・四隅のどこをつかんでも大きさを変えられます。</li>
<li>パネルの書式は、別窓の中で意味を持つものだけを並べています。
改ページ・改段・表紙・奥付・目次は、ページがあってはじめて働くものなので出しません。</li>
<li>空行で段落が分かれます。<code>|項目|内容|</code> のように <code>|</code> で区切った行が続くと、そこは<b>表</b>になります（1行目が見出しです）。</li>
<li>ボタンの文字は、ボタンの右の小さな欄で変えられます。</li>
<li><b>印刷とPDFでは、中身が巻末に「追記」としてまとめて出ます。</b>本文のページ数は増えません。書き出した閲覧HTMLでは、ボタンを押すと窓が開きます。</li>
</ul>
<h4>字下げ</h4>
<p>段落を選んで「書く」タブの<b>→ 下げる</b>（<code>Ctrl</code>+<code>Alt</code>+<code>]</code>）で、左端から1段内側へ寄せます。<b>← 戻す</b>（<code>Ctrl</code>+<code>Alt</code>+<code>[</code>）で戻ります。4段まで下げられます。見出し3の下の本文を寄せると、階層が目で追いやすくなります。</p>
<h4>元に戻す</h4>
<p><code>Ctrl</code>+<code>Z</code>で元に戻し、<code>Ctrl</code>+<code>Y</code>でやり直します。ツールバー左の矢印でも同じです。文字の入力は少しずつではなく、打っていた区切りごとにまとめて戻ります。削除・書式変更・並べ替え・段組・背景の変更も同じ履歴に入ります。</p>
<h4>ページの拡大縮小と移動</h4>
<table>
<tr><th><code>Ctrl</code>+ホイール</th><td>ポインタの位置を中心に拡大縮小します。</td></tr>
<tr><th>中ボタンでドラッグ</th><td>紙面をつかんで動かします。<code>Space</code>を押しながらの左ドラッグでも同じです。</td></tr>
<tr><th><code>Shift</code>+ホイール</th><td>左右にスクロールします。</td></tr>
<tr><th>ツールバーの &minus; &plus;</th><td>段階的に拡大縮小します。倍率の表示を押すと「幅に合わせる」に戻ります（<code>Ctrl</code>+<code>0</code>）。</td></tr>
</table>
<p>紙面の余白から左ドラッグすると、これまでどおり段落をまとめて選べます。</p>
<h4>幅の調整</h4>
<ul>
<li>ペインの境目をつかんで動かすと、道具パネル・本文・ページの幅を変えられます。</li>
<li>境目を<b>ダブルクリック</b>すると既定の幅に戻ります。</li>
<li>幅はこのブラウザに覚えさせます。窓を狭くすると、本文とページが上下に並びます。</li>
</ul>
<h4>保存</h4>
<ul>
<li>編集内容はこのブラウザに自動保存されます。打ち終えて0.7秒、打ち続けていても3秒ごとに保存します。</li>
<li>タブを閉じたり再読み込みしたりしても、打った字は残ります。保存しきれなかった分は控えておき、次に開いたときに戻します。</li>
<li>ツールバーの<b>保存</b>（<code>Ctrl</code>+<code>S</code>）で、ファイルに残せます。大切な原稿はこちらでも残してください。</li>
<li>Chrome・Edge では、はじめの<b>保存</b>でファイルの置き場所を選ぶと、以後は自動保存のたびにそのファイルにも書きます。ブラウザのデータが消えても、そのファイルを<b>開く</b>で戻せます。書く許可が切れたときは、上に帯が出るので<b>再開する</b>を押してください。</li>
<li>保存に失敗すると、上に赤い帯が出て、直るまで消えません。</li>
<li>ファイルに保存していない変更があると、ステータスに「未保存の変更あり」と出ます。</li>
<li><b>開く</b>で読み込んだファイルは、いまの作品を上書きせず、新しい作品として足されます。</li>
</ul>
<h4>作品</h4>
<ul>
<li>シナリオ（作品）はいくつでもこのブラウザに置いておけます。ツールバーの<b>作品</b>で一覧を出し、開く・新しく作る・複製・削除ができます。一覧には、最後にファイルへ保存した日時も出ます。</li>
<li>起動すると一覧が出ます。最後に開いていた作品が選ばれているので、そのまま<b>開く</b>か <code>Enter</code> で続きから書けます。<code>↑</code> <code>↓</code> で選び直せます。</li>
<li>同じ作品は1つのタブでしか開けません。ほかのタブで開いている作品には「別のタブで編集中」と出ます。</li>
<li><b>過去の版</b>：作品ごとに、開いたとき・書いているあいだ10分ごと・「全部消して最初から」の直前の姿を、10個まで残します。戻すと新しい作品になり、いまの作品はそのまま残ります。</li>
<li><b>削除</b>した作品は<b>ゴミ箱</b>に入り、30日のあいだは戻せます。</li>
<li>作品を切り替えると、元に戻す（<code>Ctrl</code>+<code>Z</code>）の履歴はその作品の分から始まります。</li>
<li>このブラウザで作品の置き場（IndexedDB）が使えないときは、これまでどおり1作品だけを保存します。その場合、画像やフォントで内容が大きくなると自動保存を省略します。</li>
</ul>`,
    'help.keys.title': 'キー操作',
    'help.keys.body': `
<h3>キー操作</h3>
<table>
<tr><th><code>Enter</code></th><td>そこで段落が分かれ、新しい段落を続けて書けます。</td></tr>
<tr><th><code>Backspace</code>/<code>Delete</code></th><td>段落を選んでいる状態（文字を打っていない状態）で押すと、その段落を削除します。</td></tr>
<tr><th><code>Shift</code>+<code>Enter</code></th><td><b>段落の中で改行します。</b>段落は分かれません。</td></tr>
<tr><th><code>Backspace</code></th><td>段落の先頭で押すと、前の段落と繋がります。</td></tr>
<tr><th><code>Esc</code></th><td>1回押すと文字の編集をやめてその段落を選んだ状態に、もう1回押すと<b>選択も外れます</b>。ウィンドウを閉じるときにも使えます。</td></tr>
<tr><th><code>Ctrl</code>+<code>S</code></th><td>ファイルに保存します。</td></tr>
<tr><th><code>Ctrl</code>+<code>Z</code></th><td>元に戻します。文字の入力だけでなく、削除・書式変更・並べ替え・ページ設定も戻せます。</td></tr>
<tr><th><code>Ctrl</code>+<code>Y</code></th><td>やり直します（<code>Ctrl</code>+<code>Shift</code>+<code>Z</code>も同じ）。</td></tr>
<tr><th><code>Ctrl</code>+<code>Shift</code>+<code>R</code></th><td>選んだ文字にルビを振ります。</td></tr>
<tr><th><code>Tab</code> / <code>Shift</code>+<code>Tab</code></th><td>字下げを1段ずつ増減します（<code>Ctrl</code>+<code>Shift</code>+<code>]</code> / <code>[</code>も同じ）。打っている途中でも使えます。</td></tr>
<tr><th><code>Ctrl</code>+<code>0</code> / <code>+</code> / <code>-</code></th><td>ページの表示倍率。<code>0</code>で幅に合わせます。<code>Ctrl</code>+<code>Shift</code>+<code>↑</code> / <code>↓</code> でも拡大縮小できます。</td></tr>
<tr><th>書式のショートカット</th><td>すべて <code>Ctrl</code>+<code>Shift</code>+キー です（<code>Ctrl</code>+<code>Alt</code>+キー も今までどおり使えます。ブラウザに取られる組み合わせがあったときの逃げ道です）。<br>
<code>0</code>描写文、<code>1</code>〜<code>3</code>見出し1〜3、<code>4</code>会話文、<code>5</code>注釈、<code>6</code>処理系、<code>8</code>シーン移行、<code>9</code>NPCシート、<br>
<code>C</code>表紙、<code>T</code>タイトル、<code>S</code>サブ、<code>K</code>奥付、<code>G</code>画像、<code>M</code>目次、<code>H</code>罫線、<code>V</code>縦線、<code>B</code>改ページ、<code>D</code>改段、<code>X</code>表、<code>W</code>別窓、<code>F</code>流れ図<br>
段落を<b>選んでいれば</b>その書式に変わり、<b>選んでいなければ</b>いちばん後ろに新しく足されます。<br>
ブラウザで開いているときは、<code>Ctrl</code>+<code>Shift</code>+<code>T</code>（タブを開き直す）などブラウザ側が先に取る組み合わせがあります。その場合は <code>Ctrl</code>+<code>Alt</code>+キー を使ってください。exe版ではどちらも使えます。</td></tr>
<tr><th><code>Ctrl</code>+<code>Shift</code>+<code>P</code></th><td>ページ一覧の欄を出したり隠したりします。</td></tr>
<tr><th><code>Ctrl</code>+<code>C</code> / <code>V</code></th><td>段落まるごとを控える／貼り付けます。表やNPCシートも、升目に入れた段落まで中身をそのまま写します。<br>
<b>文字を選んでいるとき</b>と<b>文字を打つ欄にいるとき</b>は、いつもどおり文字のコピー・貼り付けになります。段落を選んで、文字にカーソルが入っていないときだけ段落まるごとになります。<br>
控えた段落は、このツールを開いているあいだ覚えています（別のアプリへは貼れません）。</td></tr>
<tr><th><code>Ctrl</code>+<code>Alt</code>+<code>Shift</code>+<code>C</code> / <code>V</code></th><td>文字にカーソルがあっても、段落まるごとを控える／貼り付けます。</td></tr>
</table>
<h4>選択</h4>
<ul>
<li>段落の左に出る<b>つまみ</b>、または<b>書式名の欄</b>を押すと、その段落を選べます。文字を打っている途中でも使えます。</li>
<li>つまみや書式名の欄を<b>なぞる</b>、または本文の左余白から<b>ドラッグ</b>すると、範囲をまとめて選べます。</li>
<li>つまみを<b>つかんで動かす</b>と、別のページを含む好きな位置へ移せます。</li>
<li><code>Shift</code>+クリックで範囲選択、<code>Ctrl</code>+クリックで追加選択。</li>
<li>右のページ側でブロックをクリックしても選べます。左の該当箇所へ移動します。</li>
</ul>`,
    'help.layout.title': '段組とページ',
    'help.layout.body': `
<h3>段組とページ</h3>
<p>改ページは自動です。区切りたい位置には「書く」タブの<b>改ページ</b>で区切りを置けます。</p>
<h4>ページの段組</h4>
<p>段組は<b>ページ単位</b>で決まります。「書く」タブの<b>このページを1段／2段</b>で、選んでいる段落が載っているページを切り替えます（「ページ」タブでページを選んでいれば、そちらが対象になります）。2段組にすると<b>半分の幅の縦長の段</b>になり、文章は左の段を最後まで埋めてから右の段へ流れます。ページ見出しの「段組を切替」でも変えられます。</p>
<h4>ブロックの置き方</h4>
<table>
<tr><th>全幅</th><td>2段組のページで、段をまたいで横いっぱいに置きます。タイトルや見出し、NPCシート、画像に向きます。</td></tr>
<tr><th>段の中を流す</th><td>ふつうの本文。段の中に収まって流れます。</td></tr>
</table>
<p>1段組のページでは、どちらを選んでも見た目は変わりません。</p>`,
    'help.blocks.title': '書式と段落',
    'help.blocks.body': `
<h3>書式と段落</h3>
<p>「書く」タブの書式は<b>本文・見出し・区切り・差し込み</b>の4つに分かれています。段落を<b>選んでいれば</b>その書式に変わり、<b>何も選んでいなければ</b>いちばん後ろに新しく足されます。ボタンと同じことが <code>Ctrl</code>+<code>Alt</code>+各キーでもできます。</p>
<p>左の一覧では書式名が行の左に出ます（この文字はコピーには含まれません）。</p>
<h4>表紙ページと奥付</h4>
<p>「ページ」タブの<b>表紙ページを作る</b>／<b>奥付ページを作る</b>で、まとめて用意できます。表紙は先頭に題字と改ページを、奥付は末尾に改ページと著者・発行の雛形を置きます。すでにある場合はその位置へ移動します。</p>
<table>
<tr><th>表紙</th><td>ページの中ほどに大きく置く題字。</td></tr>
<tr><th>奥付</th><td>小さな文字と区切り線。著者や発行日を末尾に。</td></tr>
</table>
<p>表紙は <code>Ctrl</code>+<code>Alt</code>+<code>C</code>、奥付は <code>Ctrl</code>+<code>Alt</code>+<code>K</code> でも指定できます。</p>
<h4>流れ図（<code>Ctrl</code>+<code>Shift</code>+<code>F</code>）</h4>
<p>箱を<b>好きな場所に置いて、線でつなぐ</b>図です。分かれ道の先で、さらに分かれ道を作れます。戻る矢印や、離れた箱への合流も引けます。縦に長くなるので<b>いつも全幅</b>です。</p>
<p>流れ図を選んで<b>右の設定欄の「図をひらいて描く」</b>を押すと、編集の窓がひらきます（テキストの欄で<b>二度押し</b>しても開きます）。</p>
<ul>
<li><b>箱を足す</b>：窓の上の「＋箱」「＋角丸」「＋ひし形」「＋丸端」。箱を選んでから押すと、その下に置かれて線もつながります。</li>
<li><b>動かす</b>：箱をつかんで運びます。<code>Alt</code> を押しながらだと、細かく置けます。</li>
<li><b>大きさ</b>：箱を選ぶと右下に出る四角をつまみます。数値でも決められます。</li>
<li><b>線を引く</b>：箱を選ぶと上に出る<b>赤い丸</b>をつまみ、つなぎ先の箱を押します。線を選ぶと「成功／失敗」などの添え書きを付けられます。</li>
<li><b>枠のかたち</b>：四角・角丸・ひし形（判断）・丸端（開始と終わり）・平行四辺形。色も6色から選べます。</li>
<li><b>二段分け</b>：箱の「2段目」に書くと、箱が上下に分かれます（シーン名と中身、など）。</li>
<li><b>余白</b>：箱ごとに内側の余白を決められます。</li>
<li><b>消す</b>：箱や線を選んで <code>Backspace</code>（または <code>Delete</code>）。窓を開いているあいだは、紙面の段落のほうは消えません。</li>
<li><b>元に戻す</b>：<code>Ctrl</code>+<code>Z</code>。窓の中もその場で描き直されます。</li>
<li><b>あふれた文字</b>：箱の高さは決めた値のままですが、文字が入りきらないときはその分だけ下に伸びます。</li>
</ul>
<h4>まとめて選ぶ・そろえる</h4>
<p><code>Shift</code>を押しながら箱を押すと<b>選び足し</b>、余白をドラッグすると<b>囲んで選ぶ</b>ことができます。まとめて選ぶと、つかんで<b>一緒に動かせます</b>。</p>
<p>複数選んでいるときは、右の欄に<b>そろえかた</b>が出ます。</p>
<ul>
<li><b>左ぞろえ・左右中央・右ぞろえ</b>／<b>上ぞろえ・上下中央・下ぞろえ</b></li>
<li><b>横幅をそろえる・高さをそろえる</b>（いちばん大きいものに合わせます）</li>
<li><b>横の間を均等に・縦の間を均等に</b>（両端はそのままに、あいだの間隔をそろえます）</li>
</ul>
<p>かたち・色・大きさ・余白も、選んだ箱すべてにまとめて当てられます。<b>まとめて複製</b>と<b>まとめて消す</b>もできます。</p>
<p>図ぜんたいの大きさは mm で決めます。「中身に合わせる」を押すと、置いた箱がちょうど収まる大きさになります。版面より広くすると紙面からはみ出すので、そのときは幅を小さくしてください。</p>
<p>以前の「1行がひと箱、行頭の <code>-</code> で枝分かれ」で書いた原稿は、<b>開いたときに自動で図へ移し替わります</b>。元の文章もそのまま残ります。</p>
<h4>入れ子の書式（行の頭の印）</h4>
<p>箇条書きは独立した書式ではなく、<b>本文の中に置く入れ子の書式</b>です。行の頭に印を入れると、その行だけ別の書式になります。<b>描写文・注釈・処理系・別窓の中身・キャラシのメモ／タブ</b>で使えます。<br>
段落を選ぶと<b>右の設定欄</b>に「入れ子の書式」のボタンが出ます。押すと、いまカーソルのある行の頭に印を入れます（本文に触れていなければ末尾に新しい行として足します）。</p>
<table>
<tr><th><code>- </code>で始まる行</th><td><b>箇条書き（中黒）</b>。markdown と同じ書き方です（<code>*</code> <code>+</code> も同じ）。うしろに空白が要ります（<code>-5度</code> のような文はそのままです）。</td></tr>
<tr><th><code>1.</code> <code>2.</code> で始まる行</th><td><b>箇条書き（番号）</b>。書いた番号がそのまま出ます。markdown と同じです。</td></tr>
<tr><th><code>- [ ] </code>で始まる行</th><td><b>箇条書き（選択肢）</b>。選ばせるものを並べるときに。<code>- [x]</code> と書くと済みの印（☑）になります。markdown と同じです。</td></tr>
<tr><th>印の前の<b>スペース</b></th><td>半角2つ（全角1つ）で<b>1段下がります</b>（3段まで）。<code>  - 鍵がかかっている</code> のように書きます。</td></tr>
<tr><th><code>「</code>で始まり<code>」</code>で終わる行</th><td><b>会話文</b>。<code>灰島「よく来たね」</code> のように前に名前を書くと、話し手として出ます。行の途中で<code>」</code>が閉じたあとに文が続く場合は、ふつうの文のままです。</td></tr>
<tr><th><code>|項目|内容|</code> の行</th><td><b>表</b>。同じ形の行を続けると1つの表になり、<b>1行目が見出し</b>です。<code>|---|---|</code> の区切り行は書いても無視されます。</td></tr>
<tr><th><code>■</code>で始まる行</th><td>小見出しになります。「■成功した場合」「■失敗した場合」のように結果を分けて書けます。</td></tr>
<tr><th><code>&gt; </code>で始まる行</th><td>枠の中にもうひとつ<b>入れ子の枠</b>が入ります。<code>&gt; 目星：机の裏の封筒に気づく</code> のように、コロンの前が見出しになります。</td></tr>
</table>
<p><b>印は markdown と同じ書き方にそろえてあります。</b>これまでの <code>・</code> <code>□</code> <code>＞</code> もそのまま読めます。古い原稿は、開いたときに一度だけ新しい印へ書き換えます（見た目と注の位置は変わりません）。</p>
<p>もとの「箇条書き」の書式で書いた原稿は、開いたときに<b>描写文に直し、各行の頭に印を付け直します</b>。見た目はそのままです。</p>
<h4>処理系（囲み）</h4>
<p><b>処理系</b>は、もとの「技能判定」と「特殊ルール」を1つにまとめた書式です。中身の書き方は同じで、<b>見た目だけを設定欄で選びます</b>。「技能判定」「特殊ルール」のテンプレを押せば元どおりの見た目になり、そのうえで枠線の形（実線・破線・なし）、左の太い罫、地色、字の大きさ、色（朱・墨・藍・苔・金茶・灰）を個別に変えられます。古い原稿を開いたときは、自動でこの書式に読み替えます。</p>
<h4>コメント</h4>
<p>左の本文で文字を選び、「書く」タブの<b>コメントを付ける</b>を押すと、その文字に注がぶら下がります。紙面では<b>薄い点線と小さな番号</b>だけが付き、押すと<b>紙面の外、右側</b>に注が出ます。書き出したHTMLでも同じように右の欄外に出ます。</p>
<ul>
<li>本文そのものには何も混ぜていないので、<b>文章をコピーしても注は付いてきません</b>。</li>
<li>印刷とPDFでは、点線も番号も出ません。</li>
<li>「この段落の注を消す」で、選んだ段落の注をまとめて外せます。</li>
</ul>
<h4>区切りの書式</h4>
<table>
<tr><th>罫線</th><td>横に一本線を引きます。文字を入れると、線の中ほどに小さな見出しとして入ります。</td></tr>
<tr><th>縦線</th><td>左端に縦の線を立て、その右に文章を置きます。囲み記事や補足に。</td></tr>
<tr><th>シーン移行</th><td>右に寄せ、本文より少し小さく、太字と下線がつきます。場面の切り替わりを示すのに使います。</td></tr>
<tr><th>改ページ</th><td>そこでページを区切ります。<code>Ctrl</code>+<code>Alt</code>+<code>B</code>でも入ります。改ページを入れると、次のページに書き始められるよう<b>空の描写文がひとつ添えられます</b>。</td></tr>
<tr><th>改段</th><td>2段組のページで、そこから<b>次の段へ送ります</b>。左の段を途中で切り上げて右の段へ移りたいときに使います。1段組のページでは何も起こりません。<code>Ctrl</code>+<code>Alt</code>+<code>D</code>。</td></tr>
</table>
<h4>ページ一覧</h4>
<p>ツールバーの<b>ページ一覧</b>（<code>Ctrl</code>+<code>Alt</code>+<code>P</code>）を押すと、本文とページの間に一覧の欄が出ます（重なって隠す窓ではないので、出したまま作業できます）。表紙から奥付まで全ページが縮小して並び、ページ番号のほか、表紙・目次・奥付にはしるしとそのページの見出しが付きます。</p>
<ul>
<li>押すとそのページへ移動し、左の本文もその位置へ揃います。</li>
<li>上部のつまみでサムネイルの大きさを、境目のドラッグで欄の幅を変えられます。</li>
<li><b>×</b>で閉じます。開いているかどうかと幅は、このブラウザに覚えさせます。</li>
</ul>
<h4>まとめて選ぶ・動かす</h4>
<ul>
<li>右のページの<b>余白からドラッグ</b>すると、囲んだ段落をまとめて選べます。<code>Ctrl</code>を押しながらだと、いまの選択に足せます。</li>
<li>選んだ段落を<b>つかんで動かす</b>と、別のページを含む好きな位置へ移せます。落ちる位置は線で示されます。</li>
<li>左の本文でも、選んである段落をつかめば同じように動かせます。</li>
</ul>
<h4>できること</h4>
<ul>
<li><b>選択を結合</b>：選んだ段落をひとつにまとめます。書式は先頭のものを引き継ぎます。</li>
<li><b>複製・削除・上下移動</b>：選択中の段落に対して働きます。</li>
<li><b>この段落だけの余白</b>：上下の余白をmmで指定できます。</li>
</ul>
<h4>本文のコピー</h4>
<ul>
<li>「書く」タブの<b>文章をコピー</b>で、書式名や記号を含まない<b>文章だけ</b>をコピーします。</li>
<li>段落を選んでいればその範囲、選んでいなければ全文が対象です。</li>
<li>段落を選んだまま <code>Ctrl</code>+<code>C</code> でも同じようにコピーできます。</li>
</ul>
<div class="note">段落をまたいだドラッグでの文字選択は、ブラウザの仕組み上できません（段落ごとに別々の編集領域になっているためです）。複数の段落をコピーしたいときは、上のやり方をお使いください。</div>
<h4>貼り付け</h4>
<p>空行で区切った文章を貼ると、段落ごとのブロックに分かれて取り込まれます。行頭の <code>#</code> <code>##</code> <code>###</code> は見出しに、<code>「</code>で始まる行は会話文に、<code>※</code>で始まる行は注釈に、「シーン」で始まる行や「〜へ移行」で終わる行はシーン移行に、自動で振り分けます。段落の中の単独の改行はそのまま残ります。</p>
<h4>目次</h4>
<p>目次を選ぶと、右の設定欄で中身を決められます。</p>
<ul>
<li><b>見出し語</b>：「目　次」の文字を変えられます。空にすると見出しそのものを出しません。</li>
<li><b>何を載せるか</b>：タイトル・見出し1〜3・サブ・シーン移行から選びます。押すたびに載せる／載せないが切り替わります（既定は見出し1〜3）。</li>
<li><b>体裁</b>：ページ番号と、項目とページ番号をつなぐ点線を、それぞれ出し入れできます。</li>
</ul>
<p>ここまでは<b>書式ごと</b>（見出し1、見出し2…）の決めです。<b>見出し1つずつ</b>の決めは、その見出しを選ぶと右の設定欄に出ます。</p>
<ul>
<li><b>目次での書き方</b>：目次に出る文字を、見出し本体とは別に決められます（例：見出しは「第一章　雨の交差点」、目次では「第一章」）。空なら見出しの文字がそのまま出ます。</li>
<li><b>目次に載せるか</b>：<b>目次の設定どおり</b>／<b>かならず載せる</b>／<b>載せない</b>の3つから選びます。「かならず載せる」を使うと、目次の側で外してある書式でも、その見出しだけ載せられます。逆に「載せない」で、同じ書式の中からその1つだけ外せます。</li>
<li><b>目次での段さげ</b>：目次での見た目の段を、見出しごとに変えられます（例：見出し2だが目次では1段目に出す）。紙面の見出しの大きさは変わりません。</li>
</ul>
<p>「書く」タブの<b>目次</b>で作れます。タイトルと見出し1〜3から組み立てられ、書き出したHTMLでは目次からその位置へ飛べます。<b>ページ一覧</b>の欄を「見出し」に切り替えると、いまの見出しが一覧で出て、押すとその位置へ飛べます。</p>`,
    'help.ruby.title': 'ルビ',
    'help.ruby.body': `
<h3>ルビ</h3>
<p>青空文庫の書きかたに合わせています。<b>｜</b>（縦線）で親文字のはじまりを示し、<b>《　》</b>に読みを書きます。</p>
<table>
<tr><th>書きかた</th><td><code>｜彼方《かなた》</code></td></tr>
<tr><th>出るもの</th><td>彼方（かなた）のように、上に小さくルビが付きます</td></tr>
</table>
<p>「書く」タブの<b>ルビを振る</b>（<code>Ctrl</code>+<code>Alt</code>+<code>R</code>）を押すと、選んだ文字を <code>｜…《》</code> で包み、《　》の中にカーソルを置きます。｜は日本語入力のままでは打ちにくいので、こちらを使うのが楽です。半角の <code>|</code> でも同じように働きます。</p>
<div class="note">青空文庫では｜を省いても直前の文字の並びから親文字を推測しますが、このツールでは<b>｜を必ず書く決まり</b>にしています。ダブルクロスのエフェクト名が《コンセントレイト》のように書かれるため、推測に任せると直前のカタカナにルビを振ってしまうからです。｜のない《　》は、そのままの文字として紙面に出ます。</div>
<p>目次やページ一覧では、ルビの記号を外した文字が並びます。</p>`,
    'help.image.title': '画像',
    'help.image.body': `
<h3>画像</h3>
<p>大きさの％は<b>紙面が基準</b>です。行内と左右の回り込みは版面（本文が入る幅）の、自由配置は紙の幅の何％かで決まります。段組を1段と2段で切り替えても、全幅と段の中のどちらに置いても、<b>実際の大きさは変わりません</b>。</p>
<ul>
<li>「書く」タブの<b>画像</b>を押すとファイルを選ぶ画面が開き、いちばん後ろに入ります。段落を選んでから押すと、その段落が画像に変わります。</li>
<li><b>文字との並べ方</b>を選べます。Wordの「四角」と同じように、画像の横に本文が流れます。
<table>
<tr><th>行内</th><td>画像だけで幅いっぱいを使い、本文は画像の下から続きます。</td></tr>
<tr><th>左に回り込み</th><td>画像を左端に寄せ、その右側に本文が流れます。</td></tr>
<tr><th>右に回り込み</th><td>画像を右端に寄せ、その左側に本文が流れます。</td></tr>
</table></li>
<li>回り込みは、画像の高さぶんが終われば自然に解けます。途中で切りたいときは、切りたい位置の段落を選んで「書く」タブの<b>回り込みを解除</b>を押すと、その段落は画像の下から始まります。</li>
<li>回り込ませているときは、<b>大きさ</b>が画像の占める幅になります（35〜45%くらいが読みやすいです）。数値は右の欄に直接打ち込めます。</li>
<li><b>置く位置をずらす</b>で、段落の並びを無視して好きな位置に置けます。「下へ」で紙面の下の方へ、「内側へ」で紙面の中央寄りへ、mmで動かします。<b>文字は自動でよけます。</b>ページの先頭に画像を置いてから数値で動かすと、そのページの好きな場所に配置できます。</li>
<li>ずらしが効くのは<b>1段組のページだけ</b>です。2段組では段の枠から画像がはみ出して文字と重なってしまうため、ずらしは無視されます。</li>
<li><b>自由配置</b>にすると、紙の左上からの距離（mm）で好きな位置に置けます。段落の並びから完全に外れるので、ページ数にも影響しません。<b>下端に寄せる</b>などのボタンで、紙の余白の内側にぴたりと合わせられます。ただし<b>文字は避けません</b>（重ねて置く用です）。文字によけてほしいときは「左に流す」「右に流す」を使ってください。</li>
<li>段落パネルで<b>大きさ</b>（段の幅に対する％）と<b>説明</b>を指定できます。</li>
<li>長辺が1600pxを超える画像は、保存できる大きさに自動で縮めてから取り込みます。</li>
<li>他のブロックと同じく「全幅」「段の中を流す」を選べます。</li>
</ul>`,
    'help.font.title': 'フォント',
    'help.font.body': `
<h3>フォント</h3>
<ul>
<li>「設定」タブの<b>フォントを追加</b>から <code>.ttf</code> / <code>.otf</code> を読み込めます。</li>
<li><b>本文</b>と<b>見出し</b>に別々のフォントを指定できます。</li>
<li>追加したフォントは<b>書き出した閲覧HTMLにも埋め込まれる</b>ので、渡した相手の環境でも同じ字面で表示されます。</li>
</ul>
<div class="note">フォントのファイルが大きいと、保存や書き出しが重くなります。12MBを超えるものは扱えません。サブセット化したフォントをおすすめします。</div>`,
    'help.npc.title': 'NPCシート',
    'help.npc.body': `
<h3>NPCシート</h3>
<h4>名前まわり</h4>
<p>フリガナは名前の上に、名前の左端にそろえて小さく入ります。年齢・性別・立場は名前のすぐ右です。ccfoliaのコマのメモには、この<b>フリガナと年齢・立場だけ</b>が入ります（シートの「メモ」はGM向けなのでコマには出ません）。</p>
<h4>タブ</h4>
<ul>
<li><b>＋タブを追加</b>で、見出しと中身を自由に書ける区画をいくつでも足せます。見出しの欄に名前を打ち、×で消せます。開いていれば紙面にも出ます。</li>
<li><b>ベース技能</b>は決まりきった一覧なので紙面には出しません。詳細ウィンドウでだけ見られます。</li>
<li>開いた結果ページに収まらなくなるときは、<b>紙面は閉じたままにして詳細ウィンドウの方だけを開きます</b>。紙面の組みが崩れません。</li>
</ul>
<h4>立ち絵</h4>
<p><b>立ち絵をつける</b>で画像を選ぶと、シートが<b>立ち絵つきの形に切り替わります</b>。表などが左に寄り、右側に立ち絵が入ります。幅は既定30%で、15〜50%の間で変えられます。<b>立ち絵を外す</b>で元の形に戻ります。</p>
<p>段落の書式を「NPCシート」にすると置けます。上部のプルダウンでシステムを選びます（クトゥルフは6版／7版も切り替えられます）。</p>
<h4>入力のしかた</h4>
<ul>
<li>数値の欄はクリックすると候補が出ます。候補にない値も手で入力できます。</li>
<li><b>薄い斜体の数字は自動計算</b>です。上書きすると手入力が優先され、欄を空にすると自動計算に戻ります。</li>
<li>技能は「系統を選ぶ→その中の技能を選ぶ」の順で指定します。</li>
<li>ベース技能とメモは見出しを押すと開閉します。閉じた区画は印刷・書き出しにも出ません。</li>
</ul>
<h4>詳細ウィンドウ</h4>
<p>開いた内容がページに収まらなくなると、専用のウィンドウが開きます。紙面を崩さずにそこで編集でき、内容はすぐページへ反映されます。「詳細ウィンドウで開く」ボタンからいつでも開けます。</p>`,
    'help.ccfolia.title': 'ccfoliaへの出力',
    'help.ccfolia.body': `
<h3>別窓（長い文章を格納する）</h3>
<p>別窓の中身にも、<b>本文と同じ入れ子の書式が使えます</b>。編集窓の上のボタンを押すと、いまカーソルのある行の頭に印が入ります。</p>
<table>
<tr><th><code>#</code> <code>##</code> <code>###</code></th><td><b>見出し1・2・3</b>。別窓の中だけの記法です（本文の段落では <code>#</code> はそのままの文字になります）。</td></tr>
<tr><th><code>- </code> <code>1.</code> <code>- [ ] </code></th><td>箇条書き。印の前のスペース2つで1段下がります。</td></tr>
<tr><th><code>|項目|内容|</code></th><td>表。同じ形の行を続けると1つの表になり、1行目が見出しです。</td></tr>
<tr><th><code>「…」</code></th><td>会話文。前に名前を書くと話し手になります。</td></tr>
<tr><th><code>■</code> <code>＞</code></th><td>小見出しと、入れ子の判定枠。</td></tr>
</table>
<p>入れられないのは<b>画像とNPCシート</b>です。どちらも文字だけでは書けないためで、これらは本文の段落として置いてください。</p>
<h3>ゆとシートの表を読み込む</h3>
<p>ダブルクロスのNPCシートを選ぶと、右の設定欄に<b>ゆとシートの表を読み込む</b>が出ます。ゆとシートで<b>エフェクト表かコンボ表を選んでコピー</b>し、そのまま貼り付けてください。見出しの行は入れても入れなくてもかまいません。</p>
<ul>
<li>1行が「｜」で始まり、項目が「 / 」で区切られた形を読みます。どちらの表かは中身から見分けますが、ボタンで指定もできます。</li>
<li>コンボ表の列は <b>コンボ名／組み合わせ／技能／命中／攻撃力／対象／射程／侵蝕値／条件／効果</b>。取り込んだ組み合わせは文字のまま入ります（選び直せば下の自動計算が働きます）。</li>
<li>エフェクト表の列は <b>種別／名称／LV／タイミング／技能／難易度／対象／射程／侵蝕値／制限</b>。種別はシンドロームの名前と照らして色をつけます。</li>
<li>効果欄の <code>&amp;lt;br&amp;gt;</code> は改行に戻します。</li>
<li><b>読み込むと、その表の中身はすべて置き換わります。</b>足すのではありません。</li>
</ul>
<h3>コンボの組み合わせと自動計算</h3>
<p>コンボの<b>組み合わせ</b>は、入力ずみのエフェクトからドロップダウンで選びます。「＋エフェクト」で選び口を増やし、「−」で減らします。武器のようにエフェクト表にないものは<b>その他</b>の欄に書いてください。</p>
<p>選んだエフェクトから、次の欄が自動で入ります。行動値と同じで、<b>自動の値は薄く出て、手で書けばそちらが優先</b>されます。空にすれば自動に戻ります。</p>
<table>
<tr><th>侵蝕値</th><td>選んだエフェクトの侵蝕値の<b>合計</b>。</td></tr>
<tr><th>技能・対象・射程・タイミング</th><td>選んだエフェクトに入っている値を並べます。ばらついていれば「マイナー／メジャー」のように<b>候補として</b>つないで出すので、正しいほうに直してください。</td></tr>
</table>
<p><b>命中と攻撃力は自動にできません。</b>エフェクト表がダイス修正・クリティカル値・攻撃力修正を持っていないためで、<code>(5+3)dx+(5-2)@8</code> の <code>+3</code> や <code>@8</code> はいまのデータからは出せません。手で書いてください。</p>
<h3>画像の回り込み</h3>
<p>置き方は4つです。</p>
<table>
<tr><th>行内</th><td>画像だけで一行を使います。</td></tr>
<tr><th>左に流す／右に流す</th><td>本文の流れの中に置き、<b>そのあとに続く段落が何段落あっても</b>横に流れます。書き足しても位置は本文についていきます。</td></tr>
<tr><th>自由配置</th><td>紙の好きな位置に固定します。本文を書き足しても動きません。</td></tr>
</table>
<p>自由配置には<b>文字の流し方</b>の設定があります。</p>
<table>
<tr><th>よける（四角）</th><td>Wordの「四角」と同じで、画像の四角ぶんだけ<b>いくつもの段落にまたがって</b>文字が避けます。画像より上と下の段落は全幅のままです。<b>これが既定です。</b></td></tr>
<tr><th>重ねる</th><td>文字は避けず、画像の下を通ります。地紋や飾りを敷きたいときに。</td></tr>
</table>
<p>「よける」が効くのは<b>1段組のページ</b>だけです。2段組では段の流れを壊してしまうため効かせていません。2段組で回り込ませたいときは「左に流す」「右に流す」を使ってください。<br>
また、画像の縦横比が分かっていないと避ける高さを決められません。古い原稿の画像は<b>一度紙面に表示された時点で</b>縦横比を覚え、そこから避けるようになります。</p>
<h3>ccfoliaのコマを読み込む</h3>
<p>NPCシートを選ぶと、右の設定欄に<b>コマを読み込む</b>が出ます。ccfoliaでコマを右クリックしてコピーした文字や、キャラクターシート作成ツールの「ccfolia出力」で得た文字を、そのまま貼り付けてください。</p>
<ul>
<li>能力値のパラメータの顔ぶれから、<b>エモクロア／ダブルクロス3rd／クトゥルフ</b>のどれかを見分けます。</li>
<li>名前・フリガナ・年齢や立場（コマのメモの1行目と2行目）・能力値・HP・MP・技能を埋めます。ダブルクロスは侵蝕率・行動値・シンドローム・エフェクト・コンボも読みます。</li>
<li>クトゥルフの技能は、<b>一覧にある技能はそのまま、無いものは「自分で書く」あつかい</b>で入ります。<code>芸術:写真</code> のようにコロンで種別が付いていれば、種別の欄に分けて入れます。</li>
<li><b>武器は技能として入ります。</b>コマの文字だけでは技能と見分けられないためです。読み込んだあと、武器の欄へ手で移してください。</li>
<li>読めなかった行があれば件数を知らせます。作ったツールによってコマンドの書き方が違うためで、その分は手で足してください。</li>
</ul>
<h3>ccfoliaへの出力</h3>
<p>NPCシート上部の<b>ccfoliaのコマをコピー</b>を押すと、コマのデータがクリップボードに入ります。ccfoliaの盤面で貼り付けてください。自動でコピーできない環境では、手動でコピーするための窓が開きます。</p>
<h4>出力の中身</h4>
<table>
<tr><th>エモクロア</th><td>HP・MPをステータス、能力値8項目をパラメータに。判定は <code>{共鳴}DM&lt;={強度}</code> のように変数で参照します。〈∞共鳴〉3種とベース技能13種が並びます。</td></tr>
<tr><th>クトゥルフ6版</th><td><code>CCB&lt;=</code> 形式。能力値ロールは <code>CCB&lt;={STR}*5</code>、正気度ロールは <code>1d100&lt;={SAN}</code>。ダメージ判定にはダメージボーナスが織り込まれます。</td></tr>
<tr><th>クトゥルフ7版</th><td><code>CC&lt;=</code> 形式。能力値はそのまま参照。幸運はステータス、BLDとMOVはパラメータに入ります。</td></tr>
<tr><th>ダブルクロス</th><td>能力値と技能をパラメータに入れ、判定は <code>{白兵}dx@10</code> のように参照します。</td></tr>
</table>
<div class="note">ダブルクロスの書式は他の2つに合わせて組んだもので、実機での貼り付けは未確認です。</div>`,
    'help.export.title': '印刷と書き出し',
    'help.export.body': `
<h3>印刷と書き出し</h3>
<ul>
<li><b>印刷 / PDF</b>：ページだけが印刷されます。編集用の表示（左のテキスト、ボタン、閉じた区画）は出ません。</li>
<li><b>閲覧HTMLを書き出す</b>：目次つきの1枚のHTMLになります。追加したフォントも埋め込まれます。</li>
<li>編集中の内容そのものは「保存」でJSONとして残せます。読み込めば続きから編集できます。</li>
</ul>`
  }
});
