/* portrait-size（立繪尺寸統一器） 字典。載入前需先載入 ../../assets/i18n.js。 */
I18N.register({
  'zh-TW': {
    /* ---- 外殼 ---- */
    'nav.home': '← TRPG Toolkit',
    'lang.aria': '顯示語言',
    'app.title': '立繪尺寸統一器',
    'app.heading': '立繪尺寸統一器',
    'disclaimer': '本工具由有志者製作，是非官方工具，與 CCFOLIA 官方沒有關係。',
    'changelog.link': '更新紀錄',

    /* ---- 說明區 ---- */
    'desc.toggle': '使用方式與工具說明<span class="wide-only">（點一下展開／收合）</span>',
    'desc.what': '這個工具能做什麼',
    'desc.intro': '解決在 CCFOLIA 切換角色立繪時，<strong>棋子圖突然變大或變小的問題</strong>。<br>檔案全部在你的瀏覽器裡處理，不會傳送到任何伺服器。',
    'desc.why': '◆為什麼尺寸會變',
    'desc.why.body': 'CCFOLIA 是用圖片的<strong>寬度</strong>決定棋子圖大小的',
    'desc.example': '舉例：<br>• 一般立繪：寬 500px → 棋子圖大小正常<br>• 戰鬥立繪（拿著武器）：寬 700px → 會被縮小到與一般立繪相同，棋子圖因此變小<br>• 幼年差分：寬 300px → 會被放大到與一般立繪相同，棋子圖因此變大',
    'desc.why.tail': '就算是同一個角色，只要姿勢或差分的寬度不同，每次切換立繪棋子圖的大小就會跟著變',
    'desc.how': '◆使用方式',
    'desc.how.1': '<strong>一次載入多張圖片</strong> — 把同一角色的差分（一般、戰鬥、幼年等）全部選起來',
    'desc.how.2': '<strong>按下「處理圖片」</strong> — 刪掉透明留白，再統一成最寬那張的寬度',
    'desc.how.3': '<strong>用「全部下載」儲存</strong> — 把處理好的圖片一次存下來',
    'desc.result': '<strong>結果：</strong>所有圖片的寬度一致，切換立繪時<strong>棋子圖的大小不會變，身高差與姿勢也照原樣保留</strong>',
    'desc.notes': '◆備註',
    'desc.notes.1': '前提是立繪本來就<strong>以同一比例繪製</strong>。若不是這樣（例如小孩畫在大畫布、大人畫在小畫布），只統一寬度反而會讓實際的體型差跑掉',
    'desc.notes.2': '同時也會裁掉圖片的透明部分',
    'desc.notes.3': '也可以只放一張圖，單純拿來<strong>裁掉透明部分並縮減檔案大小</strong>',
    'desc.privacy': '◆關於隱私',
    'desc.privacy.1': '載入的圖片<strong>全部在瀏覽器內處理</strong>，不會上傳到任何地方',

    /* ---- 載入區 ---- */
    'upload.pointer': '📁 點擊或拖放來選擇圖片',
    'upload.touch': '📁 點一下選擇圖片',
    'upload.hint': '支援 PNG 與 WebP（可多選）',

    /* ---- 選項 ---- */
    'options.advancedAria': '進階設定',
    'options.advancedTitle': '進階設定',
    'options.advanced': '進階設定',
    'options.trim': '裁掉透明部分',
    'options.unify': '統一寬度',
    'options.advancedHint': '關掉之後會保留原本的留白與尺寸。<br>一般維持兩個都開啟即可',
    'options.webp': '轉成 WebP 格式再下載<span class="wide-only">（檔案會比 PNG 小）</span>',
    'options.webpHint': '取消勾選就維持原本的格式輸出',
    'options.quality': '品質設定：',
    'options.lossless': 'Lossless（無損）',
    'options.custom': '指定品質',

    /* ---- 按鈕與頁尾 ---- */
    'action.process': '處理圖片',
    'action.download': '全部下載',
    'action.clear': '清除',
    'footer.author': '製作：<a href="https://x.com/WW_3338" target="_blank" rel="noopener noreferrer">Wool&amp;Wag</a>',
    'footer.note': '圖片在瀏覽器內處理，不會傳送到伺服器',

    /* ---- 狀態訊息（app.js） ---- */
    'msg.noChangelog': '目前還沒有更新紀錄',
    'msg.wrongType': '請選擇 PNG 或 WebP 檔案',
    'msg.loaded': '已載入 {0} 個檔案',
    'msg.processing': '正在處理圖片…',
    'msg.processingAt': '正在處理圖片…（{0}/{1}）',
    'msg.processed': '處理完成！',
    'msg.error': '發生錯誤：{0}',
    'msg.downloading': '下載中…（請留意瀏覽器的彈出視窗封鎖）',
    'msg.downloadingAt': '下載中…（{0}/{1}）',
    'msg.downloaded': '所有檔案都下載完成了！',
    'msg.downloadError': '下載時發生錯誤：{0}',
    'preview.done': '（已處理）'
  },
  ja: {
    /* ---- 外殼 ---- */
    'nav.home': '← TRPG Toolkit',
    'lang.aria': '表示言語',
    'app.title': 'ココフォリア用 立ち絵サイズ調整ツール',
    'app.heading': 'ココフォリア用 立ち絵サイズ調整ツール',
    'disclaimer': '本ツールは有志が作成した非公式ツールです。ココフォリア運営様とは関係ありません',
    'changelog.link': '更新履歴',

    /* ---- 說明區 ---- */
    'desc.toggle': '使い方・このツールについて<span class="wide-only">（クリックで開閉）</span>',
    'desc.what': 'このツールでできること',
    'desc.intro': 'ココフォリアでキャラクターの立ち絵を切り替えたとき、<strong>コマの画像が急に大きくなったり小さくなったりする問題</strong>を解決します。<br>なお、ファイルはあなたのブラウザ内で処理され、サーバーには送信されません。',
    'desc.why': '◆なぜサイズが変わってしまうのか',
    'desc.why.body': 'ココフォリアでは、画像の<strong>横幅</strong>でコマの画像サイズが決まります',
    'desc.example': '例えば：<br>• 通常立ち絵：横幅500px → コマの画像サイズ普通<br>• 戦闘立ち絵（武器を持っている）：横幅700px → 通常立ち絵に合わせて縮小されるため、コマ画像が小さくなる<br>• 子供差分：横幅300px → 通常立ち絵に合わせて拡大されるため、コマ画像が大きくなる',
    'desc.why.tail': '同じキャラクターでも、ポーズや差分によって横幅が違うと立ち絵を切り替えるたびにコマの画像の大きさが変わってしまいます',
    'desc.how': '◆使い方',
    'desc.how.1': '<strong>画像をまとめて読み込む</strong> - 同じキャラの差分画像（通常・戦闘・子供など）を全部選択',
    'desc.how.2': '<strong>「画像を処理」ボタンをクリック</strong> - 透明な余白を削除し、一番横幅が大きい画像に合わせて統一',
    'desc.how.3': '<strong>「すべてダウンロード」で保存</strong> - 処理済みの画像をまとめて保存',
    'desc.result': '<strong>結果：</strong>すべての画像の横幅が統一されるので、立ち絵を切り替えても<strong>コマの画像の大きさが変わらず、身長差やポーズをそのまま維持</strong>できます',
    'desc.notes': '◆備考',
    'desc.notes.1': '元から<strong>同じ縮尺で描かれている立ち絵</strong>を前提としています。それ以外（例えば：子どもを大きいキャンバスで描き、大人を小さいキャンバスで描いている場合）では、画像の横幅だけそろえても実際の体格差は狂ってしまいます',
    'desc.notes.2': '画像の透明部分のトリミングもあわせて行います',
    'desc.notes.3': '画像を一枚だけ入れて、単に<strong>透明部分のトリミング＆画像の軽量化</strong>に使うこともできます',
    'desc.privacy': '◆プライバシーについて',
    'desc.privacy.1': '読み込んだ画像は<strong>すべてブラウザ内で処理</strong>され、どこにもアップロードされません',

    /* ---- 載入區 ---- */
    'upload.pointer': '📁 クリックまたはドラッグ&ドロップで画像を選択',
    'upload.touch': '📁 タップして画像を選択',
    'upload.hint': 'PNG, WebP形式に対応（複数選択可）',

    /* ---- 選項 ---- */
    'options.advancedAria': '詳細設定',
    'options.advancedTitle': '詳細設定',
    'options.advanced': '詳細設定',
    'options.trim': '透明部分をトリミングする',
    'options.unify': '横幅を統一する',
    'options.advancedHint': 'OFFにすると元の余白・サイズを維持します。<br>通常は両方ONのままで問題ありません',
    'options.webp': 'WebP形式に変換してダウンロード<span class="wide-only">（PNGよりファイルサイズを軽量化できます）</span>',
    'options.webpHint': 'チェックを外すと、元の形式のまま書き出します',
    'options.quality': '品質設定：',
    'options.lossless': 'Lossless（無劣化）',
    'options.custom': '品質を指定',

    /* ---- 按鈕與頁尾 ---- */
    'action.process': '画像を処理',
    'action.download': 'すべてダウンロード',
    'action.clear': 'クリア',
    'footer.author': '作成者: <a href="https://x.com/WW_3338" target="_blank" rel="noopener noreferrer">Wool&amp;Wag</a>',
    'footer.note': '画像はブラウザ内で処理され、サーバーには送信されません',

    /* ---- 狀態訊息（app.js） ---- */
    'msg.noChangelog': '更新履歴はまだありません',
    'msg.wrongType': 'PNG または WebP ファイルを選択してください',
    'msg.loaded': '{0} 個のファイルを読み込みました',
    'msg.processing': '画像を処理中...',
    'msg.processingAt': '画像を処理中... ({0}/{1})',
    'msg.processed': '処理が完了しました！',
    'msg.error': 'エラーが発生しました: {0}',
    'msg.downloading': 'ダウンロード中... (ポップアップブロックにご注意ください)',
    'msg.downloadingAt': 'ダウンロード中... ({0}/{1})',
    'msg.downloaded': 'すべてのファイルをダウンロードしました！',
    'msg.downloadError': 'ダウンロード中にエラーが発生しました: {0}',
    'preview.done': '（処理済み）'
  }
});
