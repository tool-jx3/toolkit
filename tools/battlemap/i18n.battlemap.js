/* battlemap（戰鬥地圖產生器）字典。載入前需先載入 ../../assets/i18n.js。
 * 原文是英文：en 的值逐字照抄上游畫面上的文字。 */
I18N.register({
  'zh-TW': {
    'nav.home': '← TRPG Toolkit',
    'lang.aria': '顯示語言',
    'app.title': '戰鬥地圖產生器',
    'app.intro': '按下<b>產生新地圖</b>，立刻得到一張地城、洞窟或墓穴的戰鬥地圖——石材、火把、裂縫與青苔都是程序生成，每張都不一樣。全程在瀏覽器裡執行，不上傳、也不儲存任何東西。格子對齊 Roll20／Foundry VTT／CCFOLIA（每格 70px）。',

    /* ---- 標籤 ---- */
    'badge.signup': '免註冊',
    'badge.noAi': '不用 AI 繪圖——純程序生成',
    'badge.mit': 'MIT 授權',
    'badge.size': '1540×1120px PNG',

    /* ---- 地圖下方的資訊列 ---- */
    'meta.seed': '種子',
    'meta.rooms': '個房間',
    'meta.license': '個人或商業用途都能免費使用，不需標示出處。',

    /* ---- 設定 ---- */
    'theme.label': '地形',
    'theme.dungeon': '地城',
    'theme.cave': '洞窟',
    'theme.crypt': '墓穴',
    'opt.grid': '顯示格線',
    'opt.torch': '火把光暈',
    'btn.generate': '🎲 產生新地圖',
    'btn.download': '⬇ 下載 PNG',

    /* ---- 頁尾 ---- */
    'footer.credit': '用單純的 canvas 演算法畫成，沒有用到任何生成式圖像模型。原始碼放在',
    'footer.license': '上（MIT 授權，歡迎發 PR）。',
    'footer.keys': '按 <kbd>G</kbd> 產生新地圖，按 <kbd>D</kbd> 下載。'
  },

  en: {
    'nav.home': '← TRPG Toolkit',
    'lang.aria': 'Display language',
    'app.title': 'Free Battlemap Generator',
    'app.intro': 'Click <b>Generate</b> for an instant dungeon, cave or crypt battlemap — procedurally drawn stone, torches, cracks and moss, no two the same. Runs entirely in your browser, nothing uploaded, nothing saved. Grid-ready for Roll20 / Foundry VTT / ココフォリア (70px squares).',

    'badge.signup': 'No sign-up',
    'badge.noAi': 'No AI art — pure procedural generation',
    'badge.mit': 'MIT licensed',
    'badge.size': '1540×1120px PNG',

    'meta.seed': 'Seed',
    'meta.rooms': 'rooms',
    'meta.license': 'Free for any use, personal or commercial. No attribution required.',

    'theme.label': 'Theme',
    'theme.dungeon': 'Dungeon',
    'theme.cave': 'Cave',
    'theme.crypt': 'Crypt',
    'opt.grid': 'Grid overlay',
    'opt.torch': 'Torch light',
    'btn.generate': '🎲 Generate new map',
    'btn.download': '⬇ Download PNG',

    'footer.credit': 'Built with a plain canvas algorithm — no generative image model involved. Source on',
    'footer.license': '(MIT licensed, PRs welcome).',
    'footer.keys': 'Press <kbd>G</kbd> to generate a new map, <kbd>D</kbd> to download.'
  }
});
