/* CoC NPC 製作／管理工具（上游：クトゥルフ NPC作成/管理ツール）的字典。共用的頁首、頁尾在 i18n.trpg-lab.js。 */
I18N.register({
  'zh-TW': {
    'app.title': 'CoC NPC 製作／管理工具',

    /* ---- NPC 清單 ---- */
    'list.add': '＋ 新增',
    'list.collapse': '收合',
    'action.delete': '刪除',
    /* 新增 NPC 時寫進存檔的預設名稱；已存的名稱不會改動 */
    'npc.defaultName': '新 NPC',
    /* 名稱空白時，清單與 CCFOLIA 輸出用的替代名稱 */
    'npc.unnamed': '無名氏',

    /* ---- 編輯 ---- */
    'edit.basic': '基本資料',
    'edit.name': '名稱',
    'edit.namePlaceholder': 'NPC 名稱',
    'edit.abilities': '屬性',
    'edit.rollAbility': '{0} 擲骰',
    'edit.rollAll': '全部擲骰',
    'edit.derived': '衍生屬性',
    'edit.skills': '技能',
    'edit.check': '檢定',
    'edit.skillName': '技能名稱',
    'edit.addSkill': '新增技能',
    'edit.commands': '指令／傷害',
    'edit.cmdName': '名稱',
    'edit.addCmd': '新增指令',
    'edit.memo': '備註',
    'edit.memoPlaceholder': '自由填寫',

    /* ---- 數值標籤：編輯欄位與 CCFOLIA 輸出（參數、聊天面板的 //名稱=值）共用，兩邊要一致 ---- */
    'stat.build': '體格',
    'stat.mov6': '移動力',

    /* ---- 輸出 ---- */
    'output.ccfolia': 'CCFOLIA',
    'output.chatPalette': '聊天面板',
    'output.copy': '複製',
    'output.rollCopy': '擲骰並複製',
    'output.copied': '已複製 ✓',
    'output.sanRoll': '理智檢定',

    /* ---- 使用說明 ---- */
    'guide.flow': '基本流程',
    'guide.addNpc.title': '新增 NPC',
    'guide.addNpc.body': '用左側面板的「＋ 新增」按鈕新增 NPC，點清單裡的項目即可切換。不需要的 NPC 可以按 ✕ 刪除（至少會留下 1 個）。',
    'guide.version.title': '選擇版本',
    'guide.version.body': '用 EDIT 面板右上角的 <strong>CoC7 / CoC6</strong> 切換版本。切換後，衍生屬性（HP、DB 等）會自動重新計算。',
    'guide.abilities.title': '輸入屬性／擲骰',
    'guide.abilities.body': '在骰子欄輸入算式（例：3D6），按各欄的 <span class="material-symbols-outlined fill" style="font-size: 0.9rem; vertical-align: middle">casino</span> 按鈕個別擲骰，或按「全部擲骰」一次擲完。CoC 7 版的結果會自動 ×5。',
    'guide.derived.title': '確認／編輯衍生屬性',
    'guide.derived.body': 'HP、MP、DB 等會由屬性自動計算，也可以手動覆寫。用 SAN 開關可以切換要不要輸出理智。',
    'guide.skills.title': '新增技能',
    'guide.skills.body': '用「新增技能」按鈕新增一列技能，輸入技能名稱與成功率（%）。CoC 6 版還要選擇檢定類型（CC / CCB）。',
    'guide.commands.title': '新增指令／傷害',
    'guide.commands.body': '登錄武器攻擊等的骰子算式。在算式中寫 <code>DB</code> 或 <code>db</code>，會轉換成對傷害加值的參照（例：<code>1D6+2+DB</code>）。',
    'guide.output': '輸出面板',
    'guide.json.title': 'CCFOLIA（JSON）分頁',
    'guide.json.body': '輸出可以直接貼到 CCFOLIA 等處的角色 JSON。按「複製」按鈕即可複製到剪貼簿。',
    'guide.palette.title': '聊天面板分頁',
    'guide.palette.body': '輸出 BCDice 用的聊天面板，內含屬性、技能、指令與狀態註解。',
    'guide.rollCopy.body': '一次擲完所有屬性後立刻複製，大量製作 NPC 時很方便。',
    'guide.data': '資料儲存',
    'guide.autosave.title': '自動儲存',
    'guide.autosave.body': '輸入的內容會自動儲存在瀏覽器裡（localStorage），關閉頁面後，下次開啟時會還原。',
    'guide.caution.title': '注意',
    'guide.caution.body': '清除瀏覽器資料時，NPC 資料也會一起消失。重要的角色請複製 JSON 另外保存。',
    'guide.rights.title': '權利聲明',
    'guide.rights.body': '本作品為『克蘇魯神話 TRPG』系列的二次創作，該系列的權利屬於「株式會社 Arclight」及「株式會社 KADOKAWA」。',
    'guide.rights.titles': '「克蘇魯神話 TRPG」「新克蘇魯神話 TRPG」'
  },
  ja: {
    'app.title': 'クトゥルフ NPC作成/管理ツール',

    /* ---- NPC 清單 ---- */
    'list.add': '＋ 新規',
    'list.collapse': '折り畳む',
    'action.delete': '削除',
    'npc.defaultName': '新規NPC',
    'npc.unnamed': '名無し',

    /* ---- 編輯 ---- */
    'edit.basic': '基本情報',
    'edit.name': '名前',
    'edit.namePlaceholder': 'NPC名',
    'edit.abilities': '能力値',
    'edit.rollAbility': '{0}ロール',
    'edit.rollAll': '全ロール',
    'edit.derived': '派生値',
    'edit.skills': '技能',
    'edit.check': '判定',
    'edit.skillName': '技能名',
    'edit.addSkill': '技能を追加',
    'edit.commands': 'コマンド / ダメージ',
    'edit.cmdName': '名前',
    'edit.addCmd': 'コマンドを追加',
    'edit.memo': 'メモ',
    'edit.memoPlaceholder': '自由記入欄',

    /* ---- 數值標籤 ---- */
    'stat.build': 'ビルド',
    'stat.mov6': '移動率',

    /* ---- 輸出 ---- */
    'output.ccfolia': 'ココフォリア',
    'output.chatPalette': 'チャパレ',
    'output.copy': 'コピー',
    'output.rollCopy': 'ロール＆コピー',
    'output.copied': 'コピー完了 ✓',
    'output.sanRoll': '正気度ロール',

    /* ---- 使用說明 ---- */
    'guide.flow': '基本的な流れ',
    'guide.addNpc.title': 'NPCを追加する',
    'guide.addNpc.body': '左パネルの「＋ 新規」ボタンで NPC を追加。リストの項目をクリックして切り替えます。不要な NPC は ✕ で削除できます（1体は残ります）。',
    'guide.version.title': 'バージョンを選ぶ',
    'guide.version.body': 'EDIT パネル右上の <strong>CoC7 / CoC6</strong> で版を切り替えます。切り替えると派生値（HP・DB など）が自動で再計算されます。',
    'guide.abilities.title': '能力値を入力 / ロールする',
    'guide.abilities.body': 'ダイス欄に式（例：3D6）を入力して各 <span class="material-symbols-outlined fill" style="font-size: 0.9rem; vertical-align: middle">casino</span> ボタンで個別ロール、または「全ロール」で一括ロールできます。CoC7 では結果が自動的に×5されます。',
    'guide.derived.title': '派生値を確認・編集する',
    'guide.derived.body': 'HP・MP・DB などは能力値から自動計算されます。手動で上書きすることも可能です。SAN トグルで正気度の出力のオン／オフを切り替えられます。',
    'guide.skills.title': '技能を追加する',
    'guide.skills.body': '「技能を追加」ボタンで技能行を追加。技能名と成功値（%）を入力します。CoC6 の場合は判定タイプ（CC / CCB）も選択してください。',
    'guide.commands.title': 'コマンド / ダメージを追加する',
    'guide.commands.body': '武器攻撃などのダイス式を登録します。式中に <code>DB</code>・<code>db</code> と書くとダメージボーナスの参照に変換されます（例：<code>1D6+2+DB</code>）。',
    'guide.output': '出力パネル',
    'guide.json.title': 'JSON タブ',
    'guide.json.body': 'ココフォリアなどにそのまま貼り付けられるキャラクター JSON を出力します。「コピー」ボタンでクリップボードにコピーできます。',
    'guide.palette.title': 'チャパレ タブ',
    'guide.palette.body': 'BCDice 用チャットパレットを出力します。能力値・技能・コマンド・ステータスコメントが含まれます。',
    'guide.rollCopy.body': '全能力値を一括ロールしてから即座にコピーします。NPCを量産する際に便利です。',
    'guide.data': 'データの保存',
    'guide.autosave.title': '自動保存',
    'guide.autosave.body': '入力内容はブラウザのローカルストレージに自動保存されます。ページを閉じても次回アクセス時に復元されます。',
    'guide.caution.title': '注意',
    'guide.caution.body': 'ブラウザのデータを削除するとNPCデータも消えます。重要なキャラクターは JSON をコピーして手元に保管してください。',
    'guide.rights.title': '権利表示',
    'guide.rights.body': '本作は、「株式会社アークライト」及び「株式会社KADOKAWA」が権利を有する『クトゥルフ神話TRPG』シリーズの二次創作物です。',
    'guide.rights.titles': '「クトゥルフ神話TRPG」「新クトゥルフ神話TRPG」'
  }
});
