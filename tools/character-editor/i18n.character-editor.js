/* character-editor 字典。載入前需先載入 ../../assets/i18n.js。
 *
 * 這個工具是 React 應用程式，畫面上沒有內嵌文字，所有字串都在算繪時
 * 以 window.T() 取值（見 vendor/ccfolia-character-editor/src/i18n.ts）。 */
I18N.register({
  'zh-TW': {
    /* ---- shell ---- */
    'app.title': '角色資料編輯器',
    'nav.home': '← TRPG Toolkit',
    'lang.aria': '顯示語言',
    'noscript': '這個工具需要 JavaScript，請啟用後重新載入。',

    /* ---- 版面 ---- */
    'io.aria': 'JSON 輸入與輸出',
    'credit.by': '製作：',
    'form.aria': '角色編輯表單',

    /* ---- 共用動作 ---- */
    'action.load': '讀取',
    'action.save': '儲存',
    'action.copy': '複製',
    'action.reset': '重設',
    'action.close': '關閉',
    'action.cancel': '取消',
    'action.doReset': '確定重設',
    'action.selectAll': '全部選取',
    'action.selectNone': '全部取消',
    'action.applySelected': '覆寫選取的項目',
    'action.applyAll': '全部覆寫',
    'action.add': '新增',
    'action.remove': '刪除',

    /* ---- 輸入與輸出 ---- */
    'json.inputHeading': '輸入 JSON',
    'json.outputHeading': '輸出 JSON',
    'json.hint': '貼上 CCFOLIA 的角色 JSON 就能讀取。',
    'editText.heading': '編輯畫面文字',
    'editText.placeholder': '把 CCFOLIA 角色編輯畫面整個複製後貼上',
    'editText.hint': '可以把 CCFOLIA 的角色編輯畫面全選複製後貼上。',
    'file.heading': '本機檔案',
    'file.hint': '可以存成本機檔案，也可以從本機檔案讀取。',
    'file.loadAria': '讀取本機檔案',
    'source.json': 'JSON',
    'source.editText': '編輯畫面文字',
    'source.file': '檔案「{0}」',

    /* ---- 角色欄位 ---- */
    'character.defaultName': '新角色',
    'field.name': '名稱',
    'field.initiative': '先攻值',
    'field.externalUrl': '外部網址',
    'field.color': '顏色',
    'field.colorCode': '色碼',
    'field.chatDisplay': '聊天顯示',
    'field.memo': '備註',
    'field.width': '棋子大小',
    'field.status': '狀態',
    'field.params': '參數',
    'field.commands': '聊天面板',
    'commands.refAria': '聊天面板的引用',
    'commands.refEmpty': '新增狀態或參數之後就可以引用。',
    'col.label': '標籤',
    'col.value': '數值',
    'col.current': '目前值',
    'col.max': '最大值',
    'col.currentMax': '目前值 / 最大值',
    'row.status': '狀態{0}',
    'row.params': '參數{0}',
    'drag.aria': '拖曳 {0} 來重新排序',
    'drag.title': '拖曳可重新排序',
    'value.none': '（無）',
    'value.empty': '（空）',

    /* ---- 差異確認 ---- */
    'dialog.noDiff': '沒有差異',
    'dialog.reviewTitle': '確認差異',
    'dialog.resetTitle': '要重設嗎？',
    'dialog.resetBody': '會捨棄目前的編輯內容，回到新角色的初始狀態。',
    'diff.incoming': '要匯入的',
    'diff.current': '目前',
    'diff.status': '狀態：{0}',
    'diff.params': '參數：{0}',
    'diff.blankLabel': '空白標籤',
    'msg.noDiff': '{0}與目前的資料沒有差異。',
    'msg.loaded': '已讀取{0}。請確認差異。',

    /* ---- 訊息 ---- */
    'msg.copied': '已複製到剪貼簿。',
    'msg.copyFailed': '複製失敗。請手動複製輸出 JSON。',
    'msg.fileSavedAt': '已把本機檔案存到指定的位置。',
    'msg.fileSavedDownload': '已把本機檔案存到瀏覽器的下載位置。',
    'msg.fileSaveCancelled': '已取消儲存本機檔案。',
    'msg.fileSaveFailed': '無法儲存本機檔案。',

    /* ---- 錯誤 ---- */
    'err.jsonSyntax': 'JSON 的語法不正確。',
    'err.rootObject': '最外層必須是物件。',
    'err.kindCharacter': 'kind 必須是 "character"。',
    'err.dataObject': 'data 必須是物件。',
    'err.editScreenParse': '無法當成 CCFOLIA 的角色編輯畫面文字來讀取。',
    'err.jsonLoad': '無法讀取 JSON。',
    'err.editTextLoad': '無法讀取編輯畫面文字。',
    'err.fileLoad': '無法讀取檔案。'
  },

  ja: {
    /* ---- shell ---- */
    'app.title': 'Character Editor for CCFOLIA',
    'nav.home': '← TRPG Toolkit',
    'lang.aria': '表示言語',
    'noscript': 'このツールは JavaScript を使います。有効にしてから読み込み直してください。',

    /* ---- レイアウト ---- */
    'io.aria': 'JSON入出力',
    'credit.by': 'Created by',
    'form.aria': 'キャラクター編集フォーム',

    /* ---- 共通アクション ---- */
    'action.load': '読み込む',
    'action.save': '保存',
    'action.copy': 'コピー',
    'action.reset': 'リセット',
    'action.close': '閉じる',
    'action.cancel': 'キャンセル',
    'action.doReset': 'リセットする',
    'action.selectAll': 'すべて選択',
    'action.selectNone': 'すべて外す',
    'action.applySelected': '選択項目を上書き',
    'action.applyAll': 'すべて上書き',
    'action.add': '追加',
    'action.remove': '削除',

    /* ---- 入出力 ---- */
    'json.inputHeading': '入力JSON',
    'json.outputHeading': '出力JSON',
    'json.hint': 'CCFOLIA用のキャラクターJSONを貼り付けて読み込めます。',
    'editText.heading': '編集画面テキスト',
    'editText.placeholder': 'CCFOLIAのキャラクター編集画面全体をコピーして貼り付け',
    'editText.hint': 'CCFOLIAのキャラクター編集画面を全選択コピーして貼り付けられます。',
    'file.heading': 'ローカルファイル',
    'file.hint': 'ローカルファイルとして保存・読み込みできます。',
    'file.loadAria': 'ローカルファイルを読み込む',
    'source.json': 'JSON',
    'source.editText': '編集画面テキスト',
    'source.file': 'ファイル「{0}」',

    /* ---- キャラクターの項目 ---- */
    'character.defaultName': '新しいキャラクター',
    'field.name': '名前',
    'field.initiative': 'イニシアティブ',
    'field.externalUrl': '外部URL',
    'field.color': '色',
    'field.colorCode': 'カラーコード',
    'field.chatDisplay': 'チャット表示',
    'field.memo': 'メモ',
    'field.width': '駒サイズ',
    'field.status': 'ステータス',
    'field.params': 'パラメータ',
    'field.commands': 'チャットパレット',
    'commands.refAria': 'チャットパレット引用',
    'commands.refEmpty': 'ステータスやパラメータを追加すると引用できます。',
    'col.label': 'ラベル',
    'col.value': '値',
    'col.current': '現在値',
    'col.max': '最大値',
    'col.currentMax': '現在値 / 最大値',
    'row.status': 'ステータス{0}',
    'row.params': 'パラメータ{0}',
    'drag.aria': '{0}をドラッグして並べ替え',
    'drag.title': 'ドラッグして並べ替え',
    'value.none': '(なし)',
    'value.empty': '(空)',

    /* ---- 差分の確認 ---- */
    'dialog.noDiff': '差分はありません',
    'dialog.reviewTitle': '差分を確認',
    'dialog.resetTitle': 'リセットしますか？',
    'dialog.resetBody': '現在の編集内容を破棄して、新しいキャラクターの初期状態に戻します。',
    'diff.incoming': '取り込み',
    'diff.current': '現在',
    'diff.status': 'ステータス: {0}',
    'diff.params': 'パラメータ: {0}',
    'diff.blankLabel': '空ラベル',
    'msg.noDiff': '{0}に現在のデータとの差分はありません。',
    'msg.loaded': '{0}を読み込みました。差分を確認してください。',

    /* ---- メッセージ ---- */
    'msg.copied': 'クリップボードにコピーしました。',
    'msg.copyFailed': 'コピーに失敗しました。出力JSONを手動でコピーしてください。',
    'msg.fileSavedAt': '指定した場所にローカルファイルを保存しました。',
    'msg.fileSavedDownload': 'ブラウザのダウンロード先にローカルファイルを保存しました。',
    'msg.fileSaveCancelled': 'ローカルファイルの保存をキャンセルしました。',
    'msg.fileSaveFailed': 'ローカルファイルを保存できませんでした。',

    /* ---- エラー ---- */
    'err.jsonSyntax': 'JSONの構文が正しくありません。',
    'err.rootObject': 'ルートはオブジェクトである必要があります。',
    'err.kindCharacter': 'kind は "character" である必要があります。',
    'err.dataObject': 'data はオブジェクトである必要があります。',
    'err.editScreenParse': 'CCFOLIAのキャラクター編集画面テキストとして読み取れませんでした。',
    'err.jsonLoad': 'JSONを読み込めませんでした。',
    'err.editTextLoad': '編集画面テキストを読み込めませんでした。',
    'err.fileLoad': 'ファイルを読み込めませんでした。'
  }
});
