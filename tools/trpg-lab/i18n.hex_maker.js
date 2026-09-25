/* 六角格產生器（上游：ヘクス作成ツール）的字典。共用的頁首、頁尾在 i18n.trpg-lab.js。 */
I18N.register({
  'zh-TW': {
    'app.title': '六角格產生器',

    /* ---- 基本設定 ---- */
    'basic.title': '基本設定',
    'basic.orientation': '方向',
    'basic.horizontal': '橫向',
    'basic.vertical': '直向',
    'basic.cols': '欄數（橫）',
    'basic.rows': '列數（縱）',
    'basic.size': '大小',
    'basic.shift': '錯開第 1 欄',
    'basic.outer': '繪製外圈六角格',
    'basic.fitGrid': '用於 CCFOLIA（網格化）',

    /* ---- 線條樣式 ---- */
    'line.title': '線條樣式',
    'field.colorOpacity': '顏色／不透明度',
    'line.width': '線寬',
    'line.style': '線型',
    'line.solid': '實線',
    'line.dashed': '虛線',
    'line.dotted': '點線',
    'line.glow': '發光效果',

    /* ---- 六角格縮小 ---- */
    'shrink.title': '六角格縮小',
    'shrink.rate': '縮小比例',

    /* ---- 座標 ---- */
    'coord.title': '座標',
    'coord.show': '顯示座標',
    'coord.format': '座標格式',
    'coord.format.serial': '流水號',
    'coord.origin': '起點',
    'coord.origin.tl': '左上',
    'coord.origin.bl': '左下',
    'coord.origin.tr': '右上',
    'coord.origin.br': '右下',
    'coord.rowMode': '列座標處理',
    'coord.rowMode.compress': '壓縮',
    'coord.rowMode.half': '以半列計',
    'coord.start': '起始編號',
    'coord.start.0': '從 0',
    'coord.start.1': '從 1',
    'coord.position': '位置',
    'coord.position.top': '上',
    'coord.position.middle': '中',
    'coord.position.bottom': '下',
    'coord.offset': '邊緣偏移',
    'coord.fontSize': '文字大小',

    /* ---- 下載 ---- */
    'download.png': '下載 PNG',

    /* ---- 顏色選擇器（Pickr）的按鈕 ---- */
    'pickr.save': '確定',

    /* ---- 使用說明 ---- */
    'guide.basics': '基本操作',
    'guide.preview': '即時預覽',
    'guide.preview.desc': '變更設定面板的數值，右側的預覽會立即更新。',
    'guide.download.desc': '將目前的預覽直接存成 PNG 圖片，背景為透明。',
    'guide.theme.desc': '用頁首最右邊的按鈕切換深色／淺色（設定會保存下來）。',
    'guide.orientation.desc': '「橫向」是平頂（flat-top）六角格；「直向」是上下各有一個尖角的尖頂（pointy-top）六角格。',
    'guide.colsRows': '欄數、列數',
    'guide.colsRows.desc': '設定要畫幾個六角格。列數每加 1，會輪流在偶數欄或奇數欄多出一格。',
    'guide.size.desc': '單一六角格高度的基準尺寸（px）。開啟「用於 CCFOLIA」時，格子寬度會等於這個值。在 CCFOLIA 使用時，建議設成 24 的倍數。',
    'guide.shift.desc': '切換要錯開奇數欄還是偶數欄。',
    'guide.outer.desc': '在外側多畫一圈六角格。開啟後地圖邊緣看起來會比較整齊。',
    'guide.online': '在線上團工具中使用',
    'guide.fitGrid.desc': '開啟後會把六角格橫向拉長，讓它剛好對齊正方形網格。在 CCFOLIA 這類只支援網格的線上團工具中使用時請開啟。',
    'guide.fileName': '關於檔名',
    'guide.fileName.desc': '開啟「用於 CCFOLIA」時，下載的檔名會是 <code>hex_CxR.png</code>（例：hex_30x30.png）的格式。在 CCFOLIA 等工具中使用時，請把面板或前景的大小設成這組數字。',
    'guide.color.desc': '用調色盤設定顏色與透明度。縮小比例為 100% 時，為了避免相鄰的邊重疊，每個六角格只畫 3 條邊（因此不透明度會原樣呈現）。',
    'guide.width.desc': '線條的寬度（px）。開啟發光效果時，發光範圍也會隨線寬等比例擴大。',
    'guide.style.desc': '可以選擇實線、虛線或點線。調低縮小比例後會畫出全部 6 條邊，虛線與點線的樣子也會跟著改變。',
    'guide.glow.desc': '讓線條發光，在深色背景上特別醒目。下載的圖片也會套用。',
    'guide.shrink.desc': '維持六角格之間的距離（每一格所占的範圍）不變，只縮小實際畫出的六角格。低於 100% 時邊不再重疊，會畫出全部 6 條邊。想在 CCFOLIA 上讓六角格之間留出空隙時很方便。',
    'guide.coord': '座標顯示',
    'guide.format.desc': '可以選擇座標的顯示樣式，共 5 種：<strong>1-1</strong>（以連字號分隔）、<strong>1, 1</strong>（以逗號分隔）、<strong>0101</strong>（補零成 4 位數）、<strong>A1</strong>（欄用英文字母、列用數字）、<strong>流水號</strong>（不用座標，依序編號）。',
    'guide.compress': '壓縮列座標',
    'guide.compress.desc': '把錯開的列視為同一列，以連續整數編號（例：0-0, 0-1, 1-0...）。起點可以從左上、左下、右上、右下中選擇。',
    'guide.half.desc': '直接反映六角格的錯位結構，列號每次加 2（例：0-0, 0-2, 1-1...）。想讓座標忠實呈現錯位結構時使用。',
    'guide.posOffset': '位置與偏移',
    'guide.posOffset.desc': '選擇座標文字要放在六角格內的上、中或下。選擇上或下時，可以用「邊緣偏移」調整與邊的距離（px）。<strong>正值會往中心靠近</strong>，負值則會移到六角格外側。這個距離會隨縮小比例連動。'
  },
  ja: {
    'app.title': 'ヘクス作成ツール',

    /* ---- 基本設定 ---- */
    'basic.title': '基本設定',
    'basic.orientation': '向き',
    'basic.horizontal': '横向き',
    'basic.vertical': '縦向き',
    'basic.cols': '列数（横）',
    'basic.rows': '行数（縦）',
    'basic.size': 'サイズ',
    'basic.shift': '1列目をずらす',
    'basic.outer': '外周ヘクスを描画',
    'basic.fitGrid': 'ココフォリアで使う (グリッド化)',

    /* ---- 線條樣式 ---- */
    'line.title': '線スタイル',
    'field.colorOpacity': '色 / 不透明度',
    'line.width': '太さ',
    'line.style': '線種',
    'line.solid': '実線',
    'line.dashed': '破線',
    'line.dotted': '点線',
    'line.glow': 'グロー効果',

    /* ---- 六角格縮小 ---- */
    'shrink.title': 'ヘクス縮小',
    'shrink.rate': '縮小率',

    /* ---- 座標 ---- */
    'coord.title': '座標',
    'coord.show': '座標を表示',
    'coord.format': '座標形式',
    'coord.format.serial': '連番',
    'coord.origin': '起点',
    'coord.origin.tl': '左上',
    'coord.origin.bl': '左下',
    'coord.origin.tr': '右上',
    'coord.origin.br': '右下',
    'coord.rowMode': '行座標の扱い',
    'coord.rowMode.compress': '圧縮する',
    'coord.rowMode.half': '半行ずつ',
    'coord.start': '開始番号',
    'coord.start.0': '0から',
    'coord.start.1': '1から',
    'coord.position': '位置',
    'coord.position.top': '上',
    'coord.position.middle': '中',
    'coord.position.bottom': '下',
    'coord.offset': '辺からのオフセット',
    'coord.fontSize': '文字サイズ',

    /* ---- 下載 ---- */
    'download.png': 'PNG ダウンロード',

    /* ---- 顏色選擇器（Pickr）的按鈕 ---- */
    'pickr.save': '確定',

    /* ---- 使用說明 ---- */
    'guide.basics': '基本操作',
    'guide.preview': 'リアルタイムプレビュー',
    'guide.preview.desc': '設定パネルの値を変えると右のプレビューに即時反映されます。',
    'guide.download.desc': '現在のプレビューをそのままPNG画像として保存します。背景は透過です。',
    'guide.theme.desc': 'ヘッダー右端のボタンでダーク／ライトを切り替えられます（設定は保存されます）。',
    'guide.orientation.desc': '「横向き」はフラットトップ型。「縦向き」は上下に尖端が出るポインティートップ型です。',
    'guide.colsRows': '列数・行数',
    'guide.colsRows.desc': '描画するヘクスの数を指定します。行数は偶数列と奇数列が交互に増えます',
    'guide.size.desc': 'ヘクス1つの高さの基準サイズ（px）です。「グリッドを使う」ON時はセル幅がこの値と一致します。ココフォリアで使用する際は、24の倍数に設定することを推奨します。',
    'guide.shift.desc': '奇数列をオフセットするか偶数列をオフセットするかを切り替えます。',
    'guide.outer.desc': '外側にもう1周分のヘクスを描画します。ONのほうがマップ端の見た目が整います。',
    'guide.online': 'オンセツールで使う',
    'guide.fitGrid.desc': 'ONにするとヘクスを正方形グリッドに収まるよう横に引き伸ばします。ココフォリア等のグリッドのみに対応したオンラインセッションツールで使用する場合に使用します。',
    'guide.fileName': 'ファイル名について',
    'guide.fileName.desc': '「ココフォリアで使う」がONのとき、ダウンロードファイル名は <code>hex_CxR.png</code>（例: hex_30x30.png）の形式になります。ココフォリアなどで使用する際は、パネルや前景のサイズをこの数字に合わせてください。',
    'guide.color.desc': 'カラーパレットから色と透明度を設定します。縮小率100%のとき、隣接辺の重複を避けるため各ヘクスは3辺のみ描画しています（不透明度がそのまま反映されます）。',
    'guide.width.desc': '線の太さ（px）です。グロー効果をONにしている場合、太さに比例して発光範囲も広がります。',
    'guide.style.desc': '実線・破線・点線を選択できます。縮小率を下げると全6辺が描画されるため、破線や点線の見た目が変わります。',
    'guide.glow.desc': '線に発光エフェクトをかけます。暗い背景で映えます。ダウンロード時も反映されます。',
    'guide.shrink.desc': 'ヘクス間距離（セルの占有領域）はそのままに、ヘクスの描画サイズだけを縮小します。100%未満にすると辺が重複しなくなり全6辺を描画します。ここフォリアでヘクス間に隙間を作るときに便利です。',
    'guide.coord': '座標表示',
    'guide.format.desc': '座標の表示スタイルを選択できます。<strong>1-1</strong>（ハイフン区切り）、<strong>1, 1</strong>（カンマ区切り）、<strong>0101</strong>（4桁ゼロ埋め）、<strong>A1</strong>（列をアルファベット、行を数字）、<strong>連番</strong>（座標を使わず、順番に数字を付ける）の4種類。',
    'guide.compress': '行座標を圧縮する',
    'guide.compress.desc': 'ズレた行を同じ行とみなし、連続した整数で番号を振ります（例: 0-0, 0-1, 1-0...）。起点は左上・左下・右上・右下から選択可能です。',
    'guide.half.desc': 'ヘクスのオフセット構造をそのまま反映し、行番号が2ずつ増えます（例: 0-0, 0-2, 1-1...）。ずらしの構造を座標に忠実に反映したいときに使います。',
    'guide.posOffset': '位置とオフセット',
    'guide.posOffset.desc': '座標テキストを上・中・下のどこに配置するか選びます。上・下を選んだときは「辺からのオフセット」で辺との距離（px）を調整できます。<strong>正の値で中心に近づき</strong>、負の値でヘクスの外側に出ます。縮小率に連動します。'
  }
});
