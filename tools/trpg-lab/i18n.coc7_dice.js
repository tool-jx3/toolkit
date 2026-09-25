/* CoC 7 版擲骰工具（上游：クトゥルフ7版 ダイスツール）的字典。共用的頁首、頁尾在 i18n.trpg-lab.js。 */
I18N.register({
  'zh-TW': {
    'app.title': 'CoC 7 版擲骰工具',
    'main.aria': '擲骰工具',

    /* ---- 技能擲骰（畫面上方） ---- */
    'skill.region': '技能擲骰',
    'skill.bdGroup': '獎勵骰／懲罰骰',
    'skill.bdMinus': '減少 BD/PD',
    'skill.bdValue': 'BD/PD 值',
    'skill.bdPlus': '增加 BD/PD',
    'skill.valueGroup': '輸入技能值',
    'skill.valueMinus': '減少技能值',
    'skill.value': '技能值',
    'skill.valuePlus': '增加技能值',
    'skill.roll': '進行技能擲骰',

    /* ---- 擲骰結果（畫面中央） ---- */
    'result.region': '擲骰結果',
    'level.critical': '大成功',
    'level.extreme': '極限成功',
    'level.hard': '困難成功',
    'level.regular': '一般成功',
    'level.failure': '失敗',
    'level.fumble': '大失敗',

    /* ---- 擲骰紀錄 ---- */
    'log.open': '開啟紀錄',
    'log.region': '擲骰紀錄',
    'log.clearAll': '刪除所有紀錄',
    'log.clear': '刪除紀錄',
    'log.close': '關閉紀錄',
    'log.confirmClear': '確定要刪除所有紀錄嗎？',
    /* 技能擲骰寫進紀錄時的開頭，例如「技能值[50] BD/PD[0] ＞ 45 ＞ 45 ＞ 一般成功」 */
    'log.skill': '技能值',

    /* ---- 自訂擲骰（畫面下方） ---- */
    'custom.region': '自訂擲骰',
    'custom.placeholder': '例：1D6+1D4+2',
    'custom.input': '輸入擲骰指令',
    'custom.clear': '清除輸入',
    'custom.roll': '進行自訂擲骰',
    'custom.addDice': '加骰按鈕',
    'custom.invalid': '無效的擲骰指令。\n例：2D6+1D4+3',

    /* ---- 使用說明 ---- */
    'guide.intro': '<strong class="guide-app-name">CoC 7 版擲骰工具</strong>是可以在新克蘇魯神話 TRPG（CoC 7 版）跑團時使用的網頁擲骰工具，具備技能擲骰、自訂擲骰、擲骰紀錄三項功能。',
    'guide.skill.title': '技能擲骰（畫面上方）',
    'guide.skill.bdpd': '在左側的 <strong>BD/PD</strong> 欄設定獎勵骰（正值）與懲罰骰（負值）的數量。可以用 ± 按鈕在 −2～+2 的範圍內調整。',
    'guide.skill.value': '在中間的 <strong>技能值</strong> 欄輸入要檢定的技能值。除了 ± 按鈕，也可以直接輸入數值。',
    'guide.skill.roll': '按下右側的 <strong>擲骰按鈕</strong> 會擲 1D100；有輸入技能值時，會自動判定大成功／極限成功／困難成功／一般成功／失敗／大失敗。沒有輸入技能值也可以擲骰。',
    'guide.custom.title': '自訂擲骰（畫面下方）',
    'guide.custom.command': '在輸入欄輸入擲骰指令（例：<code>2D6+1D4+3</code>），按下擲骰按鈕就會顯示結果。也支援全形文字與全形數字。',
    'guide.custom.addDice': '按下輸入欄下方的 <strong>加骰按鈕</strong>（+1D6 等），該骰子就會自動加進指令。相同面數的骰子會合併計算，可以快速組出指令。',
    'guide.log.title': '紀錄（畫面中央右下角的按鈕）',
    'guide.log.open': '按下右下角的 <strong>歷史紀錄按鈕</strong>，可以一次查看到目前為止的擲骰結果。新的紀錄會加在最上面。',
    'guide.log.clear': '顯示紀錄時按下左下角的 <strong>刪除按鈕</strong>，確認後即可清除所有紀錄。',
    'guide.legal.title': '免責聲明與權利標示',
    'guide.legal.fanwork': '本作品為『克蘇魯神話 TRPG』系列的二次創作，該系列的權利屬於「株式會社 Arclight」及「株式會社 KADOKAWA」。',
    /* 權利標示最後一行「PUBLISHED BY KADOKAWA CORPORATION」後面的作品名 */
    'guide.legal.titles': '「克蘇魯神話 TRPG」「新克蘇魯神話 TRPG」'
  },
  ja: {
    'app.title': 'クトゥルフ7版 ダイスツール',
    'main.aria': 'ダイスツール',

    /* ---- 技能擲骰（畫面上方） ---- */
    'skill.region': '技能ロール',
    'skill.bdGroup': 'ボーナス・ペナルティダイス',
    'skill.bdMinus': 'BD/PD を減らす',
    'skill.bdValue': 'BD/PD 値',
    'skill.bdPlus': 'BD/PD を増やす',
    'skill.valueGroup': '技能値入力',
    'skill.valueMinus': '技能値を減らす',
    'skill.value': '技能値',
    'skill.valuePlus': '技能値を増やす',
    'skill.roll': '技能ロールを実行',

    /* ---- 擲骰結果（畫面中央） ---- */
    'result.region': 'ロール結果',
    'level.critical': 'クリティカル',
    'level.extreme': 'イクストリーム成功',
    'level.hard': 'ハード成功',
    'level.regular': 'レギュラー成功',
    'level.failure': '失敗',
    'level.fumble': 'ファンブル',

    /* ---- 擲骰紀錄 ---- */
    'log.open': 'ログを開く',
    'log.region': 'ロールログ',
    'log.clearAll': 'ログをすべて削除',
    'log.clear': 'ログを削除',
    'log.close': 'ログを閉じる',
    'log.confirmClear': 'すべてのログを削除しますか？',
    /* 技能擲骰寫進紀錄時的開頭，例如「技能値[50] BD/PD[0] ＞ 45 ＞ 45 ＞ レギュラー成功」 */
    'log.skill': '技能値',

    /* ---- 自訂擲骰（畫面下方） ---- */
    'custom.region': 'カスタムロール',
    'custom.placeholder': '例: 1D6+1D4+2',
    'custom.input': 'ダイスコマンド入力',
    'custom.clear': '入力をクリア',
    'custom.roll': 'カスタムロールを実行',
    'custom.addDice': 'ダイス追加ボタン',
    'custom.invalid': '無効なダイスコマンドです。\n例: 2D6+1D4+3',

    /* ---- 使用說明 ---- */
    'guide.intro': '<strong class="guide-app-name">CoC7 ダイスツール</strong> は、新クトゥルフ神話TRPG（CoC7）のセッションで使えるWEBダイスツールです。 技能ロール・カスタムロール・ダイスログの3つの機能を備えています。',
    'guide.skill.title': '技能ロール（画面上部）',
    'guide.skill.bdpd': '左側の <strong>BD/PD</strong> 欄で、ボーナスダイス（正の値）とペナルティダイス（負の値）の数を設定します。±ボタンで −2 〜 +2 の範囲で調整できます。',
    'guide.skill.value': '中央の <strong>技能値</strong> 欄に判定したい技能値を入力します。±ボタンのほか、直接数値を入力することもできます。',
    'guide.skill.roll': '右側の <strong>ロールボタン</strong> を押すと1D100を振り、技能値を入力している場合はクリティカル／イクストリーム成功／ハード成功／レギュラー成功／失敗／ファンブルを自動判定します。技能値が未入力でもロール自体は可能です。',
    'guide.custom.title': 'カスタムロール（画面下部）',
    'guide.custom.command': '入力欄にダイスコマンド（例: <code>2D6+1D4+3</code>）を入力し、ロールボタンを押すと結果が表示されます。全角文字・全角数字にも対応しています。',
    'guide.custom.addDice': '入力欄の下に並ぶ <strong>ダイス追加ボタン</strong>（+1D6 など）を押すと、そのダイスがコマンドに自動で追記されます。同じ面数のダイスは合算されるため、素早くコマンドを組み立てられます。',
    'guide.log.title': 'ログ（画面中央 右下ボタン）',
    'guide.log.open': '右下の <strong>履歴ボタン</strong> を押すと、これまでのロール結果をまとめて確認できます。ログは新しいものが上に追加されます。',
    'guide.log.clear': 'ログ表示中に左下の <strong>削除ボタン</strong> を押すと、確認ダイアログの後にすべてのログを消去できます。',
    'guide.legal.title': '免責・権利表記',
    'guide.legal.fanwork': '本作は、「株式会社アークライト」及び「株式会社KADOKAWA」が権利を有する『クトゥルフ神話TRPG』シリーズの二次創作物です。',
    /* 權利標示最後一行「PUBLISHED BY KADOKAWA CORPORATION」後面的作品名 */
    'guide.legal.titles': '「クトゥルフ神話TRPG」「新クトゥルフ神話TRPG」'
  }
});
