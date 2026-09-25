/* TRPG 地圖編輯器（上游：TRPGマップエディタ）的字典。共用的頁首、頁尾在 ../i18n.trpg-lab.js。 */
I18N.register({
  'zh-TW': {
    'app.title': 'TRPG 地圖編輯器',

    /* ---- 頁面說明與操作列 ---- */
    'list.intro1': '只要有瀏覽器就能畫 TRPG 地圖。沿著格子拉出地面、牆壁與房間，再放上床、書桌等家具圖章就完成了，方格與六角格都支援。畫好的地圖可以匯出成 PNG、JPEG 或 SVG，直接帶進 CCFOLIA 等線上團工具使用。',
    'list.intro2': '資料會自動儲存在瀏覽器裡，隨時都能接著畫。請從下方的「新增地圖」開始。',
    'list.new': '新增地圖',
    'list.import': '讀取 JSON',
    'list.empty': '還沒有儲存的地圖',

    /* ---- 地圖卡片 ---- */
    'list.updated': '更新：{0}',
    'list.duplicate': '複製',
    'list.rename': '重新命名',
    'list.exportJson': '匯出 JSON',
    'list.delete': '刪除',
    'list.copyName': '{0}（副本）',
    'list.renamePrompt': '新名稱',
    'list.deleteConfirm': '要刪除「{0}」嗎？\n刪除後無法復原。',
    'list.invalidFile': '檔案格式無效',
    'list.importName': '匯入 {0}',
    'list.importError': '讀取錯誤：{0}',
    'list.defaultName': '地圖 {0}',

    /* ---- 網格種類 ---- */
    'grid.square': '方格',
    'grid.hex': '六角格',
    'grid.flatTop': '平頂',
    'grid.pointyTop': '尖頂',
    'grid.flat': '平頂',
    'grid.flatFit': '平頂（fit）',
    'grid.pointy': '尖頂',
    'grid.pointyFit': '尖頂（fit）',

    /* ---- 建立新地圖的精靈 ---- */
    'wizard.title': '建立新地圖',
    'wizard.titleType': '建立新地圖 — 類型',
    'wizard.titleOrientation': '建立新地圖 — 方向',
    'wizard.titleName': '建立新地圖 — 名稱',
    'wizard.pickType': '請選擇地圖類型',
    'wizard.squareSub': '正方形格子',
    'wizard.hexSub': '六角形格子',
    'wizard.pickOrientation': '請選擇六角格的方向',
    'wizard.flatSub': '上下是平邊',
    'wizard.pointySub': '上下是頂點',
    'wizard.enterInfo': '請輸入地圖資訊',
    'wizard.name': '地圖名稱',
    'wizard.fit': '用於 CCFOLIA 等工具（對齊網格）',
    'wizard.fitDesc': '稍微變形六角格，讓它對齊方格網格',
    'wizard.create': '建立並開啟',
    'wizard.back': '返回',
    'wizard.summaryFit': '+ CCFOLIA 對齊',
    'wizard.nameRequired': '請輸入地圖名稱'
  },
  ja: {
    'app.title': 'TRPGマップエディタ',

    /* ---- 頁面說明與操作列 ---- */
    'list.intro1': 'ブラウザだけで TRPG のマップが描けるツールです。マス目に沿って地面・壁・部屋を引き、ベッドや机などの家具スタンプを置くだけ。スクエアもヘクスも対応しています。描いたマップは PNG / JPEG / SVG で書き出して、ココフォリアなどのオンラインセッションツールにそのまま持ち込めます。',
    'list.intro2': 'データはブラウザに自動保存されるので、続きはいつでも再開できます。下の「新規マップ」から始めてください。',
    'list.new': '新規マップ',
    'list.import': 'JSONから読込',
    'list.empty': '保存されたマップはまだありません',

    /* ---- 地圖卡片 ---- */
    'list.updated': '更新: {0}',
    'list.duplicate': '複製',
    'list.rename': '名前変更',
    'list.exportJson': 'JSON出力',
    'list.delete': '削除',
    'list.copyName': '{0} (コピー)',
    'list.renamePrompt': '新しい名前',
    'list.deleteConfirm': '「{0}」を削除しますか？\nこの操作は元に戻せません。',
    'list.invalidFile': '無効なファイル形式です',
    'list.importName': 'インポート {0}',
    'list.importError': '読込エラー: {0}',
    'list.defaultName': 'マップ {0}',

    /* ---- 網格種類 ---- */
    'grid.square': 'スクエア',
    'grid.hex': 'ヘクス',
    'grid.flatTop': 'フラットトップ',
    'grid.pointyTop': 'ポインティトップ',
    'grid.flat': 'フラット',
    'grid.flatFit': 'フラット (fit)',
    'grid.pointy': 'ポインティ',
    'grid.pointyFit': 'ポインティ (fit)',

    /* ---- 建立新地圖的精靈 ---- */
    'wizard.title': '新規マップ作成',
    'wizard.titleType': '新規マップ作成 — 種類',
    'wizard.titleOrientation': '新規マップ作成 — 向き',
    'wizard.titleName': '新規マップ作成 — 名前',
    'wizard.pickType': 'マップの種類を選択してください',
    'wizard.squareSub': '正方形マス',
    'wizard.hexSub': '六角形マス',
    'wizard.pickOrientation': 'ヘクスの向きを選択してください',
    'wizard.flatSub': '上下が平らな辺',
    'wizard.pointySub': '上下が頂点',
    'wizard.enterInfo': 'マップ情報を入力してください',
    'wizard.name': 'マップ名',
    'wizard.fit': 'ココフォリア等で使う (グリッド整合)',
    'wizard.fitDesc': 'ヘクスを少し変形させて方眼グリッドに合わせます',
    'wizard.create': '作成して開く',
    'wizard.back': '戻る',
    'wizard.summaryFit': '+ ココフォリア整合',
    'wizard.nameRequired': 'マップ名を入力してください'
  }
});
