/* 六角格量尺產生器（上游：ヘクス定規作成ツール）的字典。共用的頁首、頁尾在 i18n.trpg-lab.js。 */
I18N.register({
  'zh-TW': {
    'app.title': '六角格量尺產生器',

    /* ---- 基本設定 ---- */
    'basic.title': '基本設定',
    'basic.orientation': '方向',
    'basic.horizontal': '橫向',
    'basic.vertical': '直向',
    'basic.range': '範圍',
    'basic.rangeUnit': '格',
    'basic.method': '距離計算',
    'basic.method.steps': '格數',
    'basic.method.straight': '直線',
    'basic.hexSize': '六角格大小',
    'basic.fitGrid': '使用網格（CCFOLIA 等）',

    /* ---- 格子顏色 ---- */
    'cellColor.title': '格子顏色',
    'cellColor.scheme': '配色',
    'cellColor.scheme.rainbow': '彩虹',
    'cellColor.scheme.heat': '暖色（紅→黃）',
    'cellColor.scheme.cold': '冷色（藍→深藍）',
    'cellColor.scheme.mono': '灰階',
    'cellColor.scheme.none': '無色',
    'cellColor.scheme.custom': '自訂',
    'field.opacity': '不透明度',
    /* 各距離顏色選擇器前面的標籤，{0} 是距離 */
    'dist.center': '中心',
    'dist.n': '距離 {0}',

    /* ---- 自訂格子 ---- */
    'custom.title': '自訂格子',
    'custom.info': '點選預覽上的六角格，<br />就能個別設定文字、顏色與文字顏色。',
    'custom.count': '自訂格數：',
    'custom.clearAll': '全部解除',

    /* ---- 文字 ---- */
    'text.title': '文字',
    'text.color': '文字顏色',
    'text.fontSize': '文字大小',
    'text.stroke': '描邊',
    'text.strokeColor': '顏色',

    /* ---- 下載、預覽 ---- */
    'download.png': '下載 PNG',
    'preview.hint': '點一下即可編輯六角格',

    /* ---- 編輯單格的浮動視窗；{0}, {1} 是格子座標，{2} 是原本的距離 ---- */
    'popup.title': '編輯六角格',
    'popup.coord': '六角格 ({0}, {1})／預設距離：{2}',
    'popup.textPlaceholder': '距離數字',
    'popup.reset': '重設這個六角格',

    /* ---- 顏色選擇器（Pickr）的按鈕 ---- */
    'pickr.save': '確定',

    /* ---- 使用說明 ---- */
    'guide.basics': '基本操作',
    'guide.preview': '即時預覽',
    'guide.preview.desc': '調整設定面板的數值，右側預覽會立即更新。',
    'guide.customEdit': '個別編輯六角格',
    'guide.customEdit.desc': '點選預覽上的六角格，就能個別設定該格的文字、顏色、文字顏色與文字大小。變更會立即反映。',
    'guide.download.desc': '把目前的預覽直接存成 PNG 圖片，背景是透明的。',
    'guide.orientation.desc': '<strong>橫向</strong>會畫出平頂（flat-top）六角格，<strong>直向</strong>則是尖頂（pointy-top）六角格。',
    'guide.range.desc': '設定從中心六角格算起的最大距離（格數）。',
    'guide.method': '距離計算方式',
    'guide.method.desc': '<strong>格數</strong>是在六角格之間移動的步數（立方座標距離），<strong>直線</strong>是以像素為準的直線距離。',
    'guide.fitGrid': '使用網格',
    'guide.fitGrid.desc': '開啟後會把六角格橫向拉長，讓它剛好對齊正方形網格。在 CCFOLIA 這類只支援網格的線上團工具中使用時請開啟。',
    'guide.globalOpacity': '不透明度（整體）',
    'guide.cellOpacity.desc': '一次調整所有六角格顏色的不透明度。各距離在顏色選擇器中設定的 α 值會再乘上這個值。',
    'guide.scheme.desc': '可從彩虹、暖色、冷色、灰階、無色（全透明）、自訂中選擇。切換配色時，各距離的顏色選擇器會一起更新。',
    'guide.distColor': '各距離的顏色',
    'guide.distColor.desc': '可以用顏色選擇器分別設定各距離（0＝中心～N）的顏色，也能透過 Alpha 色版設定每個距離的透明度。',
    'guide.textOpacity.desc': '一次調整所有文字的不透明度，會乘上顏色選擇器的 α 值。',
    'guide.fontSize.desc': '預設的文字大小（px），可以在個別編輯六角格時另外覆寫。',
    'guide.stroke.desc': '為文字加上描邊，背景透明時也能看清楚文字。',
    'guide.fileName': '下載檔名',
    'guide.fileFormat': '檔名格式',
    'guide.fileFormat.desc': '<code>hex_ruler_{橫}x{直}.png</code>（開啟「使用網格」時），其他情況為 <code>hex_ruler.png</code>'
  },
  ja: {
    'app.title': 'ヘクス定規作成ツール',

    /* ---- 基本設定 ---- */
    'basic.title': '基本設定',
    'basic.orientation': '向き',
    'basic.horizontal': '横向き',
    'basic.vertical': '縦向き',
    'basic.range': '範囲',
    'basic.rangeUnit': 'ヘクス',
    'basic.method': '距離計測',
    'basic.method.steps': 'マス数',
    'basic.method.straight': '直線',
    'basic.hexSize': 'ヘクスサイズ',
    'basic.fitGrid': 'グリッドを使う (ココフォリア等)',

    /* ---- 格子顏色 ---- */
    'cellColor.title': 'セルの色',
    'cellColor.scheme': 'スキーム',
    'cellColor.scheme.rainbow': 'レインボー',
    'cellColor.scheme.heat': '熱 (赤→黄)',
    'cellColor.scheme.cold': '寒 (青→紺)',
    'cellColor.scheme.mono': 'モノクロ',
    'cellColor.scheme.none': '無色',
    'cellColor.scheme.custom': 'カスタム',
    'field.opacity': '不透明度',
    /* 各距離顏色選擇器前面的標籤，{0} 是距離 */
    'dist.center': '中心',
    'dist.n': '距離 {0}',

    /* ---- 自訂格子 ---- */
    'custom.title': 'カスタムセル',
    'custom.info': 'プレビュー上のヘクスをクリックして<br />テキスト・色・文字色を個別設定できます。',
    'custom.count': 'カスタム数: ',
    'custom.clearAll': 'すべて解除',

    /* ---- 文字 ---- */
    'text.title': 'テキスト',
    'text.color': '文字色',
    'text.fontSize': '文字サイズ',
    'text.stroke': '縁取り',
    'text.strokeColor': '色',

    /* ---- 下載、預覽 ---- */
    'download.png': 'PNG ダウンロード',
    'preview.hint': 'クリックでヘクスを編集',

    /* ---- 編輯單格的浮動視窗；{0}, {1} 是格子座標，{2} 是原本的距離 ---- */
    'popup.title': 'ヘクスを編集',
    'popup.coord': 'ヘクス ({0}, {1})  / デフォルト距離: {2}',
    'popup.textPlaceholder': '距離の数字',
    'popup.reset': 'このヘクスをリセット',

    /* ---- 顏色選擇器（Pickr）的按鈕 ---- */
    'pickr.save': '確定',

    /* ---- 使用說明 ---- */
    'guide.basics': '基本操作',
    'guide.preview': 'リアルタイムプレビュー',
    'guide.preview.desc': '設定パネルの値を変えると右のプレビューに即時反映されます。',
    'guide.customEdit': 'カスタムヘクス編集',
    'guide.customEdit.desc': 'プレビュー上のヘクスをクリックすると、そのヘクスのテキスト・色・文字色・文字サイズを個別に設定できます。変更は即時反映されます。',
    'guide.download.desc': '現在のプレビューをそのままPNG画像として保存します。背景は透過です。',
    'guide.orientation.desc': '<strong>横向き</strong>はフラットトップ、<strong>縦向き</strong>はポインティートップのヘクスを描画します。',
    'guide.range.desc': '中心ヘクスからの最大距離（ヘクス数）を設定します。',
    'guide.method': '距離計測方法',
    'guide.method.desc': '<strong>マス数</strong>はヘクスの移動数（立方座標距離）、<strong>直線</strong>はピクセルベースの直線距離です。',
    'guide.fitGrid': 'グリッドを使う',
    'guide.fitGrid.desc': 'ONにするとヘクスを正方形グリッドに収まるよう横に引き伸ばします。ココフォリア等のグリッドのみに対応したオンラインセッションツールで使用する場合に使用します。',
    'guide.globalOpacity': '不透明度（グローバル）',
    'guide.cellOpacity.desc': '全ヘクスの色の不透明度を一括で調整します。各距離のカラーピッカーで設定したα値にこの値が乗算されます。',
    'guide.scheme.desc': 'レインボー・熱・寒・モノクロ・無色（全て透明）・カスタムから選択。スキームを変えると各距離のカラーピッカーの色が一括更新されます。',
    'guide.distColor': '距離ごとの色',
    'guide.distColor.desc': '各距離（0=中心〜N）の色を個別にカラーピッカーで設定できます。アルファチャンネルで距離ごとの透明度も設定可能です。',
    'guide.textOpacity.desc': '全テキストの不透明度を一括調整。カラーピッカーのα値に乗算されます。',
    'guide.fontSize.desc': 'デフォルトの文字サイズ（px）です。カスタムヘクスで個別上書き可能です。',
    'guide.stroke.desc': 'テキストに縁取りを付けます。背景が透明な場合でも文字を見やすくできます。',
    'guide.fileName': 'ダウンロードファイル名',
    'guide.fileFormat': 'ファイル名形式',
    'guide.fileFormat.desc': '<code>hex_ruler_{横}x{縦}.png</code>（グリッドに合わせる ON 時）、それ以外は <code>hex_ruler.png</code>'
  }
});
