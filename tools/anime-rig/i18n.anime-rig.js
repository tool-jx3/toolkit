/* Anime2.5DRig 的字典。載入前需先載入 ../../assets/i18n.js。
 * lib/psd-worker.js 裡沒有 i18n 引擎，主執行緒會把目前語言的字典隨 PSD 一起傳過去，
 * 所以 rigger.js、runtime.js 在 worker 裡也能用同一組 key。 */
I18N.register({
  'zh-TW': {
    'app.title': 'Anime2.5DRig — 拖入 PSD 就會動的虛擬形象',
    'nav.home': '← TRPG Toolkit',
    'lang.aria': '顯示語言',
    /* ---- 使用說明視窗 ---- */
    'guide.file': 'guide.zh-TW.md',
    'guide.failed': '無法讀取 {0}。',
    'guide.github': '到 GitHub 閱讀原作的說明'
  },
  ja: {
    'app.title': 'Anime2.5DRig — PSDドロップで動くアバター',
    'nav.home': '← TRPG Toolkit',
    'lang.aria': '表示言語',
    /* ---- 使用說明視窗 ---- */
    'guide.file': 'guide.ja.md',
    'guide.failed': '{0} を取得できませんでした。',
    'guide.github': 'GitHubで読む'
  }
});
