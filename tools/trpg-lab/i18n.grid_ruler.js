/* 網格量尺產生器（上游：グリッド定規作成ツール）的字典。共用的頁首、頁尾在 i18n.trpg-lab.js。 */
I18N.register({
  'zh-TW': {
    'app.title': '網格量尺產生器',

    /* ---- 設定面板 ---- */
    'sec.basic': '基本設定',
    'field.cellSize': '格子大小',
    'field.range': '範圍',
    'unit.cells': '格',
    'field.distance': '距離計算',
    'dist.manhattan': '曼哈頓',
    'dist.chebyshev': '切比雪夫',
    'dist.ceil': '無條件進位',
    'dist.round': '四捨五入',
    'dist.floor': '無條件捨去',
    'sec.cellColor': '格子顏色',
    'field.scheme': '配色',
    'scheme.rainbow': '彩虹',
    'scheme.heat': '暖色（紅→黃）',
    'scheme.cold': '冷色（藍→深藍）',
    'scheme.mono': '灰階',
    'scheme.none': '無色',
    'scheme.custom': '自訂',
    'field.opacity': '不透明度',
    'sec.customCell': '自訂格子',
    'customCell.info': '點擊預覽中的格子，<br />即可個別設定文字與顏色。',
    'customCell.count': '自訂格數',
    'customCell.clearAll': '全部清除',
    'field.text': '文字',
    'field.textColor': '文字顏色',
    'field.fontSize': '文字大小',
    'field.stroke': '描邊',
    'field.color': '顏色',
    'download.png': '下載 PNG',

    /* ---- 預覽與各距離的顏色列（JS 產生） ---- */
    'canvas.hint': '點擊格子即可編輯',
    'dist.center': '中心',
    'dist.label': '距離 {0}',

    /* ---- 編輯格子的浮動視窗 ---- */
    'popup.title': '編輯格子',
    'popup.textPlaceholder': '距離數字',
    'popup.reset': '重設這一格',
    'popup.coord': '格子 ({0}, {1})／預設距離：{2}',

    /* ---- 顏色選擇器（Pickr）的按鈕 ---- */
    'picker.save': '確定',

    /* ---- 使用說明 ---- */
    'guide.basics': '基本操作',
    'guide.preview.title': '即時預覽',
    'guide.preview.desc': '變更設定面板的數值，右側的預覽會立即更新。',
    'guide.customCell.title': '編輯自訂格子',
    'guide.customCell.desc': '點擊預覽中的格子，就能個別設定該格的文字、顏色、文字顏色與文字大小，變更會立即反映。',
    'guide.download.desc': '將目前的預覽直接存成 PNG 圖片，背景為透明。',
    'guide.range.desc': '設定從中心格算起的最大距離（格數）。',
    'guide.distance.title': '距離計算方式',
    'guide.distance.desc': '<strong>曼哈頓</strong>（縱橫移動距離的總和）、<strong>切比雪夫</strong>（縱、橫、斜向中的最大值，適用於 8 方向移動）、<strong>無條件進位／四捨五入／無條件捨去</strong>（分別處理直線距離）。',
    'guide.opacity.title': '不透明度（整體）',
    'guide.cellOpacity.desc': '一次調整所有格子顏色的不透明度。這個值會乘上各距離顏色選擇器所設定的 α 值。',
    'guide.scheme.desc': '可以選擇彩虹、暖色、冷色、灰階、無色（全透明）或自訂。切換配色時，各距離顏色選擇器的顏色會一併更新。',
    'guide.distColor.title': '各距離的顏色',
    'guide.distColor.desc': '可以用顏色選擇器個別設定每個距離（0 = 中心～N）的顏色，也能用 Alpha 通道為各距離設定透明度。',
    'guide.textOpacity.desc': '一次調整所有文字的不透明度，會乘上顏色選擇器的 α 值。',
    'guide.fontSize.desc': '預設的文字大小（px），可以在自訂格子中個別覆寫。',
    'guide.stroke.desc': '為文字加上描邊，即使背景透明也能讓文字清楚易讀。',
    'guide.fileName': '下載檔名',
    'guide.fileName.title': '檔名格式',
    'guide.fileName.desc': '<code>grid_ruler_{每邊格數}x{每邊格數}.png</code>（例如 <code>grid_ruler_11x11.png</code>）'
  },
  ja: {
    'app.title': 'グリッド定規作成ツール',

    /* ---- 設定面板 ---- */
    'sec.basic': '基本設定',
    'field.cellSize': 'セルサイズ',
    'field.range': '範囲',
    'unit.cells': 'マス',
    'field.distance': '距離計測',
    'dist.manhattan': 'マンハッタン',
    'dist.chebyshev': 'チェビシェフ',
    'dist.ceil': '切り上げ',
    'dist.round': '四捨五入',
    'dist.floor': '切り捨て',
    'sec.cellColor': 'セルの色',
    'field.scheme': 'スキーム',
    'scheme.rainbow': 'レインボー',
    'scheme.heat': '熱 (赤→黄)',
    'scheme.cold': '寒 (青→紺)',
    'scheme.mono': 'モノクロ',
    'scheme.none': '無色',
    'scheme.custom': 'カスタム',
    'field.opacity': '不透明度',
    'sec.customCell': 'カスタムセル',
    'customCell.info': 'プレビュー上のマスをクリックして<br />テキスト・色を個別設定できます。',
    'customCell.count': '設定数:',
    'customCell.clearAll': 'すべて解除',
    'field.text': 'テキスト',
    'field.textColor': '文字色',
    'field.fontSize': '文字サイズ',
    'field.stroke': '縁取り',
    'field.color': '色',
    'download.png': 'PNG ダウンロード',

    /* ---- 預覽與各距離的顏色列（JS 產生） ---- */
    'canvas.hint': 'クリックでセルを編集',
    'dist.center': '中心',
    'dist.label': '距離 {0}',

    /* ---- 編輯格子的浮動視窗 ---- */
    'popup.title': 'セルを編集',
    'popup.textPlaceholder': '距離の数字',
    'popup.reset': 'このセルをリセット',
    'popup.coord': 'マス ({0}, {1})  / デフォルト距離: {2}',

    /* ---- 顏色選擇器（Pickr）的按鈕 ---- */
    'picker.save': '確定',

    /* ---- 使用說明 ---- */
    'guide.basics': '基本操作',
    'guide.preview.title': 'リアルタイムプレビュー',
    'guide.preview.desc': '設定パネルの値を変えると右のプレビューに即時反映されます。',
    'guide.customCell.title': 'カスタムセル編集',
    'guide.customCell.desc': 'プレビュー上のマスをクリックすると、そのセルのテキスト・色・文字色・文字サイズを個別に設定できます。変更は即時反映されます。',
    'guide.download.desc': '現在のプレビューをそのままPNG画像として保存します。背景は透過です。',
    'guide.range.desc': '中心マスからの最大距離（マス数）を設定します。',
    'guide.distance.title': '距離計測方法',
    'guide.distance.desc': '<strong>マンハッタン</strong>（縦横移動の合計）、 <strong>チェビシェフ</strong>（縦・横・斜めの最大値、8方向移動に対応）、 <strong>切り上げ／四捨五入／切り捨て</strong>（直線距離をそれぞれ処理）。',
    'guide.opacity.title': '不透明度（グローバル）',
    'guide.cellOpacity.desc': '全マスの色の不透明度を一括で調整します。各距離のカラーピッカーで設定したα値にこの値が乗算されます。',
    'guide.scheme.desc': 'レインボー・熱・寒・モノクロ・無色（全て透明）・カスタムから選択。スキームを変えると各距離のカラーピッカーの色が一括更新されます。',
    'guide.distColor.title': '距離ごとの色',
    'guide.distColor.desc': '各距離（0=中心〜N）の色を個別にカラーピッカーで設定できます。アルファチャンネルで距離ごとの透明度も設定可能です。',
    'guide.textOpacity.desc': '全テキストの不透明度を一括調整。カラーピッカーのα値に乗算されます。',
    'guide.fontSize.desc': 'デフォルトの文字サイズ（px）です。カスタムセルで個別上書き可能です。',
    'guide.stroke.desc': 'テキストに縁取りを付けます。背景が透明な場合でも文字を見やすくできます。',
    'guide.fileName': 'ダウンロードファイル名',
    'guide.fileName.title': 'ファイル名形式',
    'guide.fileName.desc': '<code>grid_ruler_{縦横マス数}x{縦横マス数}.png</code>（例: <code>grid_ruler_11x11.png</code>）'
  }
});
