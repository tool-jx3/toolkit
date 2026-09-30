/* icon-maker（簡易頭像產生器） 字典。載入前需先載入 ../../assets/i18n.js。
 *
 * 上游：くま。「かんたんアイコンメーカー v0.1」（TRPG WEBツール観測所）。
 * ja 的值逐字照抄上游 index.html／main.js 的原文；key 順序與上游標記順序一致。
 */
I18N.register({
  'zh-TW': {
    /* ---- 外殼 ---- */
    'nav.home': '← TRPG Toolkit',
    'lang.aria': '顯示語言',
    'app.title': '簡易頭像產生器',

    /* ---- 頁首 ---- */
    'header.mode': '✦ 頭像產生',
    'header.help': '使用方式',
    'header.shortcuts': '快速鍵',
    'theme.night': '夜間模式',
    'theme.light': '日間模式',
    'app.heading': '簡易頭像產生器 v0.1',
    'app.lead': '載入 PNG 立繪，調整外框、背景、名字與 HO 標籤，製作 TRPG 用的 1:1 角色頭像。',
    'help.body': '<strong>使用方式：</strong>載入 PNG 圖片後，直接在預覽上拖曳圖片、名字與 HO 標籤來調整位置。名字與 HO 選取後，可以拖曳右下角的控點調整大小。拖曳時會顯示紅色虛線參考線。',
    'shortcut.body': '<strong>快速鍵：</strong>Delete／Backspace：取消選取；Esc：關閉面板；方向鍵：將選取中的部件移動 1px；Shift＋方向鍵：移動 10px。',

    /* ---- 上傳圖片 ---- */
    'upload.title': '上傳圖片',
    'upload.drop': '拖放 PNG 檔',
    'upload.or': '或點一下選擇檔案',
    'upload.choose': '選擇 PNG',
    'upload.loaded': '已載入圖片',
    'upload.minimized': '上傳區已縮到最小',
    'upload.replace': '更換',

    /* ---- 外框／背景 ---- */
    'frame.title': '外框／背景',
    'frame.type': '外框類型',
    'frame.typeAria': '外框類型',
    'frame.solid': '單色',
    'frame.gradation': '漸層',
    'frame.preset': '預設樣式',
    'bg.type': '背景類型',
    'bg.solid': '單色',
    'bg.gradation': '漸層',
    'bg.transparent': '透明',
    'bg.dot': '圓點',
    'bg.stripe': '斜線',
    'bg.check': '格紋',
    'frame.width': '外框粗細',

    /* ---- 名字文字 ---- */
    'name.title': '名字文字',
    'name.label': '角色名稱',
    'name.font': '字型',
    'font.serif': '明體系',
    'font.sans': '黑體系',
    'font.rounded': '圓體系',
    'font.mono': '現代英文字體',
    'name.layout': '位置',
    'layout.vertical': '右上・直書',
    'layout.horizontal': '下方・橫書',

    /* ---- HO 標籤 ---- */
    'ho.title': 'HO 標籤',
    'ho.label': 'HO／標籤',
    'ho.style': '樣式',
    'hoStyle.dark': '黑色標籤',
    'hoStyle.glass': '玻璃風',
    'hoStyle.ribbon': '緞帶風',
    'ho.help': 'HO1 的數字部分可以自由輸入。例：PC1／調香師／美國裁縫',

    /* ---- 預覽 ---- */
    'preview.title': '頭像預覽',
    'preview.note': '可以直接拖曳圖片、名字與 HO 來編輯。拖曳時會顯示紅色虛線參考線。',
    'action.save': '儲存 PNG',
    'action.copy': '複製',
    'action.reset': '重設',
    'action.zoomIn': '放大圖片',
    'action.zoomOut': '縮小圖片',
    'editor.aria': '頭像編輯區',
    'character.aria': '角色圖片',
    'character.alt': '載入的角色圖片',
    'nameBox.aria': '名字文字框',
    'hoBadge.aria': 'HO 標籤',

    /* ---- 目前設定 ---- */
    'summary.title': '目前設定',
    'summary.live': '已即時反映到預覽',
    'note.privacy': '※圖片處理與 PNG 輸出全部在瀏覽器內完成，上傳的圖片不會傳送到伺服器。',
    'settings.preset': '預設樣式',
    'settings.frame': '外框',
    'settings.bg': '背景',
    'settings.border': '框',
    'settings.scale': '圖片倍率',
    'settings.name': '名字',
    'settings.ho': 'HO',
    'settings.selected': '選取中',
    'selected.image': '圖片',
    'selected.name': '名字',
    'selected.ho': 'HO',
    'name.fallback': '名字',

    /* ---- 拖曳參考線（main.js） ---- */
    'guide.x': '左 {0}% / 右 {1}%',
    'guide.y': '上 {0}% / 下 {1}%',

    /* ---- 複製結果（main.js） ---- */
    'msg.copied': '已將 PNG 複製到剪貼簿。',
    'msg.copyFailed': '這個瀏覽器可能不支援複製圖片，請改用「儲存 PNG」。',

    /* ---- 頁尾 ---- */
    'footer.credit': '<a href="https://kumachansteps.github.io/trpg-web-tools/" target="_blank" rel="noopener noreferrer">TRPG WEB 工具觀測所</a>／簡易頭像產生器 v0.1'
  },

  ja: {
    /* ---- 外殼 ---- */
    'nav.home': '← TRPG Toolkit',
    'lang.aria': '表示言語',
    'app.title': 'かんたんアイコンメーカー',

    /* ---- 頁首 ---- */
    'header.mode': '✦ アイコン生成',
    'header.help': '使い方',
    'header.shortcuts': 'ショートカット',
    'theme.night': 'ナイトモード',
    'theme.light': 'ライトモード',
    'app.heading': 'かんたんアイコンメーカーv0.1',
    'app.lead': 'PNG立ち絵を読み込み、フレーム・背景・名前・HOラベルを整えて、TRPG用の1:1キャラクターアイコンを作成します。',
    'help.body': '<strong>使い方：</strong> PNG画像を読み込み、プレビュー上で画像・名前・HOラベルを直接ドラッグして位置調整します。名前とHOは選択後、右下ハンドルでサイズ変更できます。ドラッグ中は赤い点線ガイドが表示されます。',
    'shortcut.body': '<strong>ショートカット：</strong> Delete / Backspace：選択解除、Esc：パネルを閉じる、矢印キー：選択中パーツを1px移動、Shift+矢印：10px移動。',

    /* ---- 上傳圖片 ---- */
    'upload.title': '画像アップロード',
    'upload.drop': 'PNGをドラッグ＆ドロップ',
    'upload.or': 'またはクリックしてファイルを選択',
    'upload.choose': 'PNGを選択',
    'upload.loaded': '画像を読み込み済み',
    'upload.minimized': 'アップロード欄を最小化中',
    'upload.replace': '差し替え',

    /* ---- 外框／背景 ---- */
    'frame.title': 'フレーム / 背景',
    'frame.type': 'フレーム種類',
    'frame.typeAria': 'フレーム種類',
    'frame.solid': '単色',
    'frame.gradation': 'グラデーション',
    'frame.preset': 'プリセット',
    'bg.type': '背景タイプ',
    'bg.solid': '単色',
    'bg.gradation': 'グラデーション',
    'bg.transparent': '透明',
    'bg.dot': 'ドット',
    'bg.stripe': '斜線',
    'bg.check': 'チェック',
    'frame.width': '枠の太さ',

    /* ---- 名字文字 ---- */
    'name.title': '名前テキスト',
    'name.label': 'キャラクター名',
    'name.font': 'フォント',
    'font.serif': '明朝系',
    'font.sans': 'ゴシック系',
    'font.rounded': '丸ゴシック系',
    'font.mono': 'モダン英字',
    'name.layout': '配置',
    'layout.vertical': '右上・縦書き',
    'layout.horizontal': '下部・横書き',

    /* ---- HO 標籤 ---- */
    'ho.title': 'HOラベル',
    'ho.label': 'HO / ラベル',
    'ho.style': 'スタイル',
    'hoStyle.dark': '黒ラベル',
    'hoStyle.glass': 'ガラス風',
    'hoStyle.ribbon': 'リボン風',
    'ho.help': 'HO1の数字部分は自由入力可能です。例：PC1 / 調香師 / 米国テーラー',

    /* ---- 預覽 ---- */
    'preview.title': 'アイコンプレビュー',
    'preview.note': '画像・名前・HOを直接ドラッグ編集できます。ドラッグ中は赤い点線ガイドが表示されます。',
    'action.save': 'PNG保存',
    'action.copy': 'コピー',
    'action.reset': 'リセット',
    'action.zoomIn': '画像を拡大',
    'action.zoomOut': '画像を縮小',
    'editor.aria': 'アイコン編集エリア',
    'character.aria': 'キャラクター画像',
    'character.alt': '読み込んだキャラクター画像',
    'nameBox.aria': '名前テキストボックス',
    'hoBadge.aria': 'HOラベル',

    /* ---- 目前設定 ---- */
    'summary.title': '現在の設定',
    'summary.live': 'プレビュー反映中',
    'note.privacy': '※画像処理とPNG出力はブラウザ内で完結します。アップロードした画像はサーバーへ送信されません。',
    'settings.preset': 'プリセット',
    'settings.frame': 'フレーム',
    'settings.bg': '背景',
    'settings.border': '枠',
    'settings.scale': '画像倍率',
    'settings.name': '名前',
    'settings.ho': 'HO',
    'settings.selected': '選択中',
    'selected.image': '画像',
    'selected.name': '名前',
    'selected.ho': 'HO',
    'name.fallback': '名前',

    /* ---- 拖曳參考線（main.js） ---- */
    'guide.x': '左 {0}% / 右 {1}%',
    'guide.y': '上 {0}% / 下 {1}%',

    /* ---- 複製結果（main.js） ---- */
    'msg.copied': 'PNGをクリップボードにコピーしました。',
    'msg.copyFailed': 'このブラウザでは画像コピーに対応していない可能性があります。PNG保存をご利用ください。',

    /* ---- 頁尾 ---- */
    'footer.credit': '<a href="https://kumachansteps.github.io/trpg-web-tools/" target="_blank" rel="noopener noreferrer">TRPG WEBツール観測所</a> / かんたんアイコンメーカーv0.1'
  }
});
