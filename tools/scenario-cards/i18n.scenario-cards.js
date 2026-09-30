/* scenario-cards（劇本資訊卡片產生器） 字典。載入前需先載入 ../../assets/i18n.js。
 *
 * 上游：@KumachanSteps 的「TRPG WEB 工具觀測所」裡的劇本資訊卡片工具 v2.7（開發中版本）。
 * ja 的值逐字照抄上游（上游 js/i18n.js 只有標題與副標兩句，其餘散在 HTML 與 JS 裡）。
 * fmt.* 是複製出去的文字（CCFOLIA／Discord 用）裡的固定字樣，依按下複製當下的語言產生。
 */
I18N.register({
  'zh-TW': {
    /* ---- 外殼 ---- */
    'nav.home': '← TRPG Toolkit',
    'lang.aria': '顯示語言',
    'app.title': '劇本資訊卡片產生器',

    /* ---- 頁首 ---- */
    'app.heading': '劇本資訊卡片產生器 v2.7',
    'app.subtitle': '從 PDF Parser／TXT 檔案讀入內文，把需要的資訊做成卡片，再複製成 CCFOLIA 用的文字片段。',
    'theme.aria': '切換淺色模式與夜間模式',

    /* ---- 左欄：編輯用內文 ---- */
    'source.heading': '編輯用內文',
    'source.openTxt': '開啟劇本 TXT 檔案',
    'source.clear': '清除內文',
    'search.placeholder': '搜尋內文…',
    'search.button': '搜尋',
    'search.prevTitle': '上一個搜尋結果',
    'search.nextTitle': '下一個搜尋結果',
    'source.placeholder': '從 PDF Parser 送來的內文，或開啟的 TXT 檔案內文，會顯示在這裡。',
    'selection.create': '用選取範圍建立卡片',
    'selection.hint': '在內文上選取範圍後做成卡片（按 \'c\' 也可以）',

    /* ---- 右欄：資訊卡片 ---- */
    'cards.heading': '資訊卡片',
    'cards.add': '+ 新增卡片',
    'project.namePlaceholder': '專案名稱／劇本名稱',
    'project.savedTitle': '已儲存的專案列表',
    'project.savedOption': '已儲存列表',
    'project.save': '儲存',
    'project.load': '讀取',
    'project.ccfDeckTitle': '把所有卡片複製成 CCFOLIA 用的卡片組',
    'project.ccfDeck': '複製 CCFOLIA 卡片組',
    'project.export': '匯出 JSON',
    'project.import': '讀取 JSON',
    'cards.scrollAria': '資訊卡片捲動操作',
    'cards.scrollUp': '往上捲動',
    'cards.scrollDown': '往下捲動',

    /* ---- 卡片類型 ---- */
    'type.scene': '場景',
    'type.location': '探索地點',
    'type.document': '資料',
    'type.npc': 'NPC 資訊',
    'type.skill': '技能成功',
    'type.memo': '備忘',
    'type.item': '道具',
    'type.rule': '規則',
    'type.sceneHeader': '場景描寫',
    'type.hoHeader': '{0} 秘匿',
    'filter.all': '全部',

    /* ---- 卡片 ---- */
    'card.dragTitle': '拖曳來調整順序',
    'card.copy': '複製',
    'card.ccfTitle': '複製 CCFOLIA 輸入用資料',
    'card.ccfSend': '送到 CCFOLIA',
    'card.duplicate': '建立副本',
    'card.delete': '刪除',
    'card.skillExtraPlaceholder': '成功時的標題',
    'card.bodyPlaceholder': '資訊內文',
    'card.copyTitle': '{0} 副本',
    'placeholder.document': '資料標題',
    'placeholder.location': '地點',
    'placeholder.skill': '技能名稱',
    'placeholder.npc': 'NPC 名稱／資訊標題',
    'placeholder.ho': '標題',
    'placeholder.default': '卡片標題',

    /* ---- 複製出去的固定字樣 ---- */
    'fmt.docPrefix': '資料：「',
    'fmt.skillSuffix': '》成功：',
    'fmt.hoPrefix': '{0} 秘匿：',

    /* ---- 快捷鍵 ---- */
    'shortcut.newCard': '新增卡片',
    'shortcut.selectionCard': '選取卡片',
    'status.typeSelected': '{0}：{1} {2}',

    /* ---- 狀態訊息 ---- */
    'status.typeChanged': '已變更卡片類型。',
    'status.deleted': '已刪除卡片。',
    'status.duplicated': '已建立卡片副本。',
    'status.needProjectName': '請輸入專案名稱／劇本名稱。',
    'status.projectSaved': '已儲存專案：{0}',
    'status.projectSaveFailed': '專案儲存失敗。',
    'status.needLoadName': '請輸入要讀取的專案名稱／劇本名稱。',
    'status.projectNotFound': '找不到已儲存的專案：{0}',
    'status.projectLoaded': '已讀取專案：{0}',
    'status.projectLoadFailed': '專案讀取失敗。',
    'status.jsonExported': '已匯出專案 JSON。',
    'status.jsonImported': '已讀取專案 JSON：{0}',
    'status.jsonImportFailed': '專案 JSON 讀取失敗。',
    'status.reordered': '已調整卡片順序。',
    'status.txtLoaded': '已讀取 TXT 檔案：{0}',
    'status.txtFailed': 'TXT 檔案讀取失敗。',
    'status.cardCreated': '已建立新卡片。',
    'status.needSelection': '請選取要做成卡片的內文。',
    'status.emptySelection': '選取範圍是空的。',
    'status.cardCopied': '已複製卡片內容。',
    'status.ccfCopied': '已複製 CCFOLIA 輸入用資料。',
    'status.noCards': '沒有可以複製的資訊卡片。',
    'status.deckCopied': '已複製 CCFOLIA 卡片組。',
    'status.needQuery': '請輸入搜尋關鍵字。',
    'status.notFound': '找不到搜尋關鍵字。',
    'status.textCleared': '已清除內文。',
    'status.autosaveFailed': '自動儲存失敗。',
    'bridge.received': '已從 PDF Parser 收到內文。',
    'bridge.loaded': '已讀入內文。',
    'bridge.cleared': '已清除內文。請從 PDF Parser 傳送，或開啟 TXT 檔案。',

    /* ---- 頁尾 ---- */
    'footer.heading': '使用注意事項',
    'footer.p1': '本工具是開發者 @KumachanSteps 個人製作的非官方 TRPG 輔助工具。 各 TRPG 系統、劇本與外部服務的使用條款與權利標示，請使用者自行確認。',
  },

  ja: {
    /* ---- 外殼 ---- */
    'nav.home': '← TRPG Toolkit',
    'lang.aria': '表示言語',
    'app.title': 'シナリオ情報カード作成ツール v2.7',

    /* ---- 頁首 ---- */
    'app.heading': 'シナリオ情報カード作成ツール v2.7',
    'app.subtitle': 'PDF Parser / TXTファイルから本文を読み込み、必要情報をカード化してココフォリア用スニペットとしてコピーできます。',
    'theme.aria': 'ライトモードとナイトモードを切り替え',

    /* ---- 左欄：編輯用內文 ---- */
    'source.heading': '編集用本文',
    'source.openTxt': 'シナリオTXTファイルを開く',
    'source.clear': '本文クリア',
    'search.placeholder': '本文検索...',
    'search.button': '検索',
    'search.prevTitle': '前の検索結果へ',
    'search.nextTitle': '次の検索結果へ',
    'source.placeholder': 'PDF Parserから送られた本文、またはTXTファイルを開いた本文がここに表示されます。',
    'selection.create': '選択範囲からカード作成',
    'selection.hint': '本文上で範囲選択してカード化（\'c\'入力でも作動）',

    /* ---- 右欄：資訊卡片 ---- */
    'cards.heading': '情報カード',
    'cards.add': '+ 新規カード',
    'project.namePlaceholder': 'プロジェクト名 / シナリオ名',
    'project.savedTitle': '保存済みプロジェクト一覧',
    'project.savedOption': '保存一覧',
    'project.save': '保存',
    'project.load': '読込',
    'project.ccfDeckTitle': '全カードをCCFOLIA用カードセットとしてコピー',
    'project.ccfDeck': 'CCFOLIAカードセットコピー',
    'project.export': 'JSON出力',
    'project.import': 'JSON読込',
    'cards.scrollAria': '情報カードスクロール操作',
    'cards.scrollUp': '上へスクロール',
    'cards.scrollDown': '下へスクロール',

    /* ---- 卡片類型 ---- */
    'type.scene': 'シーン',
    'type.location': '探索箇所',
    'type.document': '資料情報',
    'type.npc': 'NPC情報',
    'type.skill': '技能成功',
    'type.memo': 'メモ',
    'type.item': 'アイテム',
    'type.rule': 'ルール',
    'type.sceneHeader': 'シーン描写',
    'type.hoHeader': '{0}秘匿',
    'filter.all': 'All',

    /* ---- 卡片 ---- */
    'card.dragTitle': 'ドラッグして順番を入れ替え',
    'card.copy': 'コピー',
    'card.ccfTitle': 'CCFOLIA入力用データをコピー',
    'card.ccfSend': 'CCFOLIAへ送る',
    'card.duplicate': '複製',
    'card.delete': '削除',
    'card.skillExtraPlaceholder': '成功時見出し',
    'card.bodyPlaceholder': '情報本文',
    'card.copyTitle': '{0} コピー',
    'placeholder.document': '資料タイトル',
    'placeholder.location': 'Location',
    'placeholder.skill': 'Skill Name',
    'placeholder.npc': 'NPC名 / 情報タイトル',
    'placeholder.ho': 'Title',
    'placeholder.default': 'カードタイトル',

    /* ---- 複製出去的固定字樣 ---- */
    'fmt.docPrefix': '資料：「',
    'fmt.skillSuffix': '》成功：',
    'fmt.hoPrefix': '{0}秘匿：',

    /* ---- 快捷鍵 ---- */
    'shortcut.newCard': '新規カード',
    'shortcut.selectionCard': '選択カード',
    'status.typeSelected': '{0}: {1} {2}',

    /* ---- 狀態訊息 ---- */
    'status.typeChanged': 'カードタイプを変更しました。',
    'status.deleted': 'カードを削除しました。',
    'status.duplicated': 'カードを複製しました。',
    'status.needProjectName': 'プロジェクト名 / シナリオ名を入力してください。',
    'status.projectSaved': 'プロジェクトを保存しました: {0}',
    'status.projectSaveFailed': 'プロジェクト保存に失敗しました。',
    'status.needLoadName': '読み込むプロジェクト名 / シナリオ名を入力してください。',
    'status.projectNotFound': '保存済みプロジェクトが見つかりません: {0}',
    'status.projectLoaded': 'プロジェクトを読み込みました: {0}',
    'status.projectLoadFailed': 'プロジェクト読込に失敗しました。',
    'status.jsonExported': 'プロジェクトJSONを書き出しました。',
    'status.jsonImported': 'プロジェクトJSONを読み込みました: {0}',
    'status.jsonImportFailed': 'プロジェクトJSONの読み込みに失敗しました。',
    'status.reordered': 'カードの順番を変更しました。',
    'status.txtLoaded': 'TXTファイルを読み込みました: {0}',
    'status.txtFailed': 'TXTファイルの読み込みに失敗しました。',
    'status.cardCreated': '新しいカードを作成しました。',
    'status.needSelection': 'カード化したい本文を選択してください。',
    'status.emptySelection': '選択範囲が空です。',
    'status.cardCopied': 'カード内容をコピーしました。',
    'status.ccfCopied': 'CCFOLIA入力用データをコピーしました。',
    'status.noCards': 'コピーできる情報カードがありません。',
    'status.deckCopied': 'CCFOLIAカードセットをコピーしました。',
    'status.needQuery': '検索語を入力してください。',
    'status.notFound': '検索語が見つかりませんでした。',
    'status.textCleared': '本文をクリアしました。',
    'status.autosaveFailed': '自動保存に失敗しました。',
    'bridge.received': 'PDF Parserから本文を受け取りました。',
    'bridge.loaded': '本文を読み込みました。',
    'bridge.cleared': '本文をクリアしました。PDF Parserから送るか、TXTファイルを開いてください。',

    /* ---- 頁尾 ---- */
    'footer.heading': '利用上の注意',
    'footer.p1': '本ツールは、開発者 @KumachanSteps による個人制作の非公式TRPG支援ツールです。 各TRPGシステム、シナリオ、外部サービスの利用規約・権利表記については、利用者自身でご確認ください。',
  }
});
