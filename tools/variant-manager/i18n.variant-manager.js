/* variant-manager（角色差分管理器） 字典。載入前需先載入 ../../assets/i18n.js。
 *
 * 上游：@KumachanSteps 的「TRPG WEB 工具觀測所」裡的角色差分管理工具 v0.16。
 * ja 的值逐字照抄上游。差分名稱建議（suggest.*）是按了才寫進輸入欄的
 * 介面文字：寫進去之後就是使用者的資料，不會再跟著語言變。
 */
I18N.register({
  'zh-TW': {
    /* ---- 外殼 ---- */
    'nav.home': '← TRPG Toolkit',
    'lang.aria': '顯示語言',
    'app.title': '角色差分管理器',

    /* ---- 頁首 ---- */
    'header.eyebrow': 'TRPG WEB 工具觀測所',
    'app.heading': '角色差分管理器',
    'header.lead': '一次檢查所有立繪與表情差分、整理好檔名，並產生 CCFOLIA 用的 <strong>@差分</strong> 聊天面板。',
    'header.navAria': '頁首操作',
    'share.aria': '發文到 X',
    'share.text': '用「角色差分管理器｜TRPG WEB 工具觀測所」整理好角色差分了！',
    'header.usage': '使用方式',
    'header.shortcut': '快捷鍵',
    'header.reset': '重設',

    /* ---- 使用方式 ---- */
    'usage.title': '使用方式',
    'usage.1': '把圖片拖放進來，或點一下選擇多張圖片。',
    'usage.2': '輸入主檔名，再編輯每張縮圖旁的差分名稱。',
    'usage.3': '需要時打開「加上編號」，檔名就會變成 <code>主檔名01_差分名.png</code> 的格式。',
    'usage.4': '按「以 ZIP 下載圖片」可以把整組圖片存下來。',
    'usage.5': '按「複製 @差分聊天面板」，可以複製切換差分用的聊天面板，貼到 CCFOLIA 等地方使用。',

    /* ---- 快捷鍵 ---- */
    'shortcut.title': '快捷鍵',
    'shortcut.open': '選擇圖片檔案',
    'shortcut.export': '匯出 ZIP',
    'shortcut.copy': '複製 @差分聊天面板',
    'shortcut.number': '加上編號 ON / OFF',
    'shortcut.esc': '關閉使用方式／快捷鍵。沒有展開時則是重設（會跳出確認對話框）',

    /* ---- 01 載入 ---- */
    'upload.heading': '載入圖片',
    'files.count': '{0} 個檔案',
    'drop.main': '把 <strong>PNG / JPG / WEBP</strong> 拖放到這裡',
    'drop.sub': '或點一下選擇多個檔案',
    'mainName.label': '主檔名',
    'mainName.placeholder': '例：hanabishi_hibana',
    'mainName.help': '輸出的檔名會是 <code>主檔名_差分名.png</code>。',

    /* ---- 02 命名 ---- */
    'thumbs.heading': '縮圖列表',
    'thumbs.number': '加上編號',
    'thumbs.note': '點一下放大顯示',
    'thumbs.empty': '加入圖片後，這裡會顯示縮圖與差分名稱的輸入欄。',
    'thumbs.selectAria': '選擇 {0}',
    'thumbs.previewAria': '預覽 {0}',
    'thumbs.nameAria': '差分名稱',
    'name.fallback': '差分{0}',

    /* ---- 03 檢查 ---- */
    'preview.heading': '大圖預覽',
    'preview.noImage': '沒有圖片',
    'preview.empty': '預覽',
    'preview.alt': '目前選取的差分預覽',
    'preview.filename': '輸出檔名：{0}',
    'preview.unnamed': '未輸入',
    'suggest.heading': '差分名稱建議',

    /* ---- 差分名稱建議 ---- */
    'suggest.normal': '一般',
    'suggest.smile': '笑臉',
    'suggest.angry': '生氣',
    'suggest.cry': '哭泣',
    'suggest.surprise': '驚訝',
    'suggest.confused': '困惑',
    'suggest.shy': '害羞',
    'suggest.flustered': '焦急',
    'suggest.grin': '微笑',
    'suggest.serious': '認真',
    'suggest.sorrow': '悲傷',
    'suggest.joy': '開心',
    'suggest.exasperated': '無奈',
    'suggest.question': '疑惑',
    'suggest.coy': '撒嬌',
    'suggest.anxious': '不安',
    'suggest.eyesClosed': '閉眼',
    'suggest.halfLidded': '鄙視眼',
    'suggest.wink': '眨眼',
    'suggest.injured': '負傷',
    'suggest.battle': '戰鬥',
    'suggest.insane': '發狂',
    'suggest.despair': '絕望',

    /* ---- 04 輸出 ---- */
    'output.heading': '輸出',
    'output.zip': '以 ZIP 下載圖片',
    'output.copy': '複製 @差分聊天面板',
    'output.label': '產生的聊天面板',
    'output.placeholder': '@一般\n@笑臉\n@生氣',

    /* ---- 頁尾 ---- */
    'footer.note': '<strong>使用注意事項</strong> 本工具是開發者 <a href="https://x.com/KumachanSteps" target="_blank" rel="noopener noreferrer">@KumachanSteps</a> 個人製作的非官方 TRPG 輔助工具。各 TRPG 系統、劇本與外部服務的使用條款與權利標示，請使用者自行確認。',

    /* ---- 狀態訊息 ---- */
    'toast.done': '下載完成。',
    'toast.zipDone': '圖片 ZIP 下載完成。',
    'status.initial': '請載入圖片。',
    'status.numbering': '已將加上編號設為 {0}。',
    'status.selectFirst': '請先選擇圖片。',
    'status.noImages': '找不到圖片檔案。',
    'status.added': '已加入 {0} 張圖片。',
    'status.reordered': '已調整縮圖順序。',
    'status.noJszip': '無法載入 ZIP 輸出函式庫，請確認網路連線。',
    'status.zipping': '正在產生 ZIP。',
    'status.zipStarted': '已開始下載圖片 ZIP。',
    'status.zipFailed': 'ZIP 輸出失敗。',
    'status.copied': '已複製 @差分聊天面板。',
    'status.copyFallback': '已執行複製。如果沒有成功，請從文字欄手動複製。',
    'status.reset': '已重設。',
    'confirm.reset': '將重設所有圖片、差分名稱與輸入內容。確定嗎？'
  },

  ja: {
    /* ---- 外殼 ---- */
    'nav.home': '← TRPG Toolkit',
    'lang.aria': '表示言語',
    'app.title': 'キャラ差分管理ツール',

    /* ---- 頁首 ---- */
    'header.eyebrow': 'TRPG WEBツール観測所',
    'app.heading': 'キャラ差分管理ツール',
    'header.lead': '立ち絵・表情差分をまとめて確認し、ファイル名を整えて、CCFOLIA向けの <strong>@差分</strong> チャットパレットを生成します。',
    'header.navAria': 'ヘッダー操作',
    'share.aria': 'Xに投稿',
    'share.text': 'キャラ差分管理ツール｜TRPG WEBツール観測所 で差分を管理しました！',
    'header.usage': '使い方',
    'header.shortcut': 'ショートカット',
    'header.reset': 'リセット',

    /* ---- 使用方式 ---- */
    'usage.title': '使い方',
    'usage.1': '画像をドラッグ&ドロップ、またはクリックして複数画像を選択します。',
    'usage.2': 'メインファイル名を入力し、各サムネイル横の差分名を編集します。',
    'usage.3': '必要に応じて「番号追加」をONにすると、<code>メインファイル名01_差分名.png</code> の形式になります。',
    'usage.4': '「画像をZIPでダウンロード」で画像一式を保存できます。',
    'usage.5': '「@差分チャパレをコピー」で、CCFOLIAなどに貼り付ける差分切替用チャットパレットをコピーできます。',

    /* ---- 快捷鍵 ---- */
    'shortcut.title': 'ショートカット',
    'shortcut.open': '画像ファイルを選択',
    'shortcut.export': 'ZIP出力',
    'shortcut.copy': '@差分チャパレをコピー',
    'shortcut.number': '番号追加 ON / OFF',
    'shortcut.esc': '使い方 / ショートカットを閉じる。未展開時はリセット（確認ダイアログを表示）',

    /* ---- 01 載入 ---- */
    'upload.heading': '画像アップロード',
    'files.count': '{0} files',
    'drop.main': '<strong>PNG / JPG / WEBP</strong> をドラッグ&ドロップ',
    'drop.sub': 'またはクリックして複数ファイルを選択',
    'mainName.label': 'メインファイル名',
    'mainName.placeholder': '例：hanabishi_hibana',
    'mainName.help': '出力名は <code>メインファイル名_差分名.png</code> になります。',

    /* ---- 02 命名 ---- */
    'thumbs.heading': 'サムネイル一覧',
    'thumbs.number': '番号追加',
    'thumbs.note': 'クリックで大きく表示',
    'thumbs.empty': '画像を追加すると、ここにサムネイルと差分名入力欄が表示されます。',
    'thumbs.selectAria': '{0}を選択',
    'thumbs.previewAria': '{0}をプレビュー',
    'thumbs.nameAria': '差分名',
    'name.fallback': '差分{0}',

    /* ---- 03 檢查 ---- */
    'preview.heading': '大プレビュー',
    'preview.noImage': 'No image',
    'preview.empty': 'Preview',
    'preview.alt': '選択中の差分プレビュー',
    'preview.filename': '出力ファイル名：{0}',
    'preview.unnamed': '未入力',
    'suggest.heading': '差分名サジェスト',

    /* ---- 差分名稱建議 ---- */
    'suggest.normal': '通常',
    'suggest.smile': '笑顔',
    'suggest.angry': '怒り',
    'suggest.cry': '泣き',
    'suggest.surprise': '驚き',
    'suggest.confused': '困惑',
    'suggest.shy': '照れ',
    'suggest.flustered': '焦り',
    'suggest.grin': '微笑',
    'suggest.serious': '真剣',
    'suggest.sorrow': '悲哀',
    'suggest.joy': '喜び',
    'suggest.exasperated': '呆れ',
    'suggest.question': '疑問',
    'suggest.coy': '媚び',
    'suggest.anxious': '不安',
    'suggest.eyesClosed': '目閉じ',
    'suggest.halfLidded': 'ジト目',
    'suggest.wink': 'ウィンク',
    'suggest.injured': '負傷',
    'suggest.battle': '戦闘',
    'suggest.insane': '発狂',
    'suggest.despair': '絶望',

    /* ---- 04 輸出 ---- */
    'output.heading': '出力',
    'output.zip': '画像をZIPでダウンロード',
    'output.copy': '@差分チャパレをコピー',
    'output.label': '生成されるチャットパレット',
    'output.placeholder': '@通常\n@笑顔\n@怒り',

    /* ---- 頁尾 ---- */
    'footer.note': '<strong>利用上の注意</strong> 本ツールは、開発者 <a href="https://x.com/KumachanSteps" target="_blank" rel="noopener noreferrer">@KumachanSteps</a> による個人制作の非公式TRPG支援ツールです。各TRPGシステム、シナリオ、外部サービスの利用規約・権利表記については、利用者自身でご確認ください。',

    /* ---- 狀態訊息 ---- */
    'toast.done': 'ダウンロードが完了しました。',
    'toast.zipDone': '画像ZIPのダウンロードが完了しました。',
    'status.initial': '画像を読み込んでください。',
    'status.numbering': '番号追加を{0}にしました。',
    'status.selectFirst': '先に画像を選択してください。',
    'status.noImages': '画像ファイルが見つかりませんでした。',
    'status.added': '{0}件の画像を追加しました。',
    'status.reordered': 'サムネイルの順番を変更しました。',
    'status.noJszip': 'ZIP出力ライブラリを読み込めませんでした。ネット接続を確認してください。',
    'status.zipping': 'ZIPを生成しています。',
    'status.zipStarted': '画像ZIPのダウンロードを開始しました。',
    'status.zipFailed': 'ZIP出力に失敗しました。',
    'status.copied': '@差分チャットパレットをコピーしました。',
    'status.copyFallback': 'コピーを実行しました。うまくいかない場合はテキスト欄から手動コピーしてください。',
    'status.reset': 'リセットしました。',
    'confirm.reset': 'すべての画像・差分名・入力内容をリセットします。よろしいですか？'
  }
});
