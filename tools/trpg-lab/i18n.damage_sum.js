/* BCDice 傷害自動計算工具（上游：BCDiceダメージ自動計算ツール）的字典。共用的頁首、頁尾在 i18n.trpg-lab.js。 */
/* 不過這頁沿用上游的舊版獨立樣式，沒有共用頁首，也不載入 common.js 與 i18n.trpg-lab.js；
 * 頁面頂端導覽列與語言選單的字串因此也寫在這裡。 */
I18N.register({
  'zh-TW': {
    'app.title': 'BCDice 傷害自動計算工具',

    /* ---- 導覽列 ---- */
    'nav.home': '← TRPG Toolkit',
    'lang.aria': '顯示語言',
    /* 上游的「ホームページへ」按鈕；收錄版改連到同目錄的實驗室首頁 index.html */
    'nav.labHome': '回到實驗室首頁',

    /* ---- 輸入 ---- */
    'form.armor': '請輸入護甲值',
    'form.rolls': '請輸入 BCDice 的傷害擲骰結果',
    /* 範例是 CCFOLIA 聊天室裡的 BCDice 輸出；「＞」那幾行是 BCDice 的原樣輸出，不翻 */
    'form.rollsPlaceholder': '例：\n藍道夫·卡特 - 今天 00:00\nx3 1D10+2 手槍 #1\n(1D10+2) ＞ 3[3]+2 ＞ 5\n\n#2\n(1D10+2) ＞ 7[7]+2 ＞ 9\n\n#3\n(1D10+2) ＞ 4[4]+2 ＞ 6',
    'form.calculate': '計算',

    /* ---- 結果 ---- */
    'result.total': '傷害合計：{0}',
    'result.copied': '已複製指令！',
    'error.armor': '請輸入正確的護甲值',
    'error.noRolls': '找不到傷害擲骰結果'
  },
  ja: {
    'app.title': 'BCDiceダメージ自動計算ツール',

    /* ---- 導覽列 ---- */
    'nav.home': '← TRPG Toolkit',
    'lang.aria': '表示言語',
    /* 上游的「ホームページへ」按鈕；收錄版改連到同目錄的實驗室首頁 index.html */
    'nav.labHome': 'ホームページへ',

    /* ---- 輸入 ---- */
    'form.armor': '装甲値を入力してください',
    'form.rolls': 'BCDiceのダメージロール結果を入力してください',
    /* 範例是 CCFOLIA 聊天室裡的 BCDice 輸出；「＞」那幾行是 BCDice 的原樣輸出，不翻 */
    'form.rollsPlaceholder': '例：\nランドルフ・カーター - 今日 00:00\nx3 1D10+2 拳銃 #1\n(1D10+2) ＞ 3[3]+2 ＞ 5\n\n#2\n(1D10+2) ＞ 7[7]+2 ＞ 9\n\n#3\n(1D10+2) ＞ 4[4]+2 ＞ 6',
    'form.calculate': '計算実行',

    /* ---- 結果 ---- */
    'result.total': 'ダメージ合計: {0}',
    'result.copied': 'コマンドをコピーしました！',
    'error.armor': '装甲値を正しく入力してください',
    'error.noRolls': 'ダメージロール結果が見つかりませんでした'
  }
});
