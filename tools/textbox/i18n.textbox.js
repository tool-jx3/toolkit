/* textbox（文字方框產生器）字典。載入前需先載入 ../../assets/i18n.js。 */
I18N.register({
  'zh-TW': {
    'nav.home': '← TRPG Toolkit',
    'lang.aria': '顯示語言',
    'app.title': '文字方框產生器',
    'app.tagline': '產生換行整齊、可以直接在線上跑團（ORPG）的聊天欄送出的文字方框。',

    /* ---- 分頁 ---- */
    'tab.box': '一般方框（線索資料等）',
    'tab.table': '產生表格',

    /* ---- 共通設定 ---- */
    'preset.label': '寬度補正',
    'preset.auto': '自動補正',
    'preset.standard': '標準等寬（1:2）',
    'preset.manual': '手動設定',
    'line.label': '框線樣式',
    'line.light': '細線（┌ ─ ┐）',
    'line.double': '雙線（╔ ═ ╗）',
    'pad.label': '留白填充字元',
    'pad.full': '全形空白（　），推薦',
    'pad.half': '半形空白（ ）',
    'wrap.label': '用完整外框包起來（顯示左右框線與四個角）',

    /* ---- 手動設定 ---- */
    'manual.fullWidth': '中韓文／全形字寬度補正',
    'manual.border': '框線寬度補正',

    /* ---- 一般方框 ---- */
    'box.maxWidth': '方框最大寬度',
    'box.maxWidth.hint': '框線的數量會隨文字長度自動調整；超過這個值就換行。',
    'box.title': '方框標題（選填）',
    'box.title.placeholder': '例：線索：老舊的日記本',
    'box.content': '方框內容',
    'box.content.placeholder': '請輸入內容，會依寬度自動換行。',

    /* ---- 表格 ---- */
    'table.maxWidth': '表格整體最大寬度',
    'table.maxWidth.hint': '超過這個值時，會從內容較長的欄開始，自動在格子裡換行。',
    'table.data': '輸入表格資料',
    'table.data.placeholder': '1 | 大失敗 | 受到 1d6 點傷害。\n---\n2 | 失敗 | 出現了不祥的預兆。\n3 | 成功 | 獲得一條線索。',
    'table.hint.columns': '各欄請用 `|` 符號分隔。',
    'table.hint.divider': '在一行裡只輸入 `---`，就會加一條橫向分隔線。',
    'table.header': '把第一列當成標題，在它下面加一條分隔線',

    /* ---- 預覽與複製 ---- */
    'preview.heading': '預覽',
    'copy.button': '複製',
    'copy.toast': '已複製到剪貼簿！請貼到聊天欄。'
  },

  ko: {
    'nav.home': '← TRPG Toolkit',
    'lang.aria': '표시 언어',
    'app.title': '텍스트 상자 생성기',
    'app.tagline': 'ORPG 환경에서 채팅으로 보낼 수 있는 일정하게 줄바꿈된 텍스트 상자를 만듭니다.',

    'tab.box': '일반 상자 (핸드아웃 등)',
    'tab.table': '표 생성',

    'preset.label': '간격 보정',
    'preset.auto': '자동 보정',
    'preset.standard': '표준 고정폭 (1:2)',
    'preset.manual': '수동 설정',
    'line.label': '선 스타일',
    'line.light': '얇은 선 (┌ ─ ┐)',
    'line.double': '두 줄 선 (╔ ═ ╗)',
    'pad.label': '여백 채움 문자',
    'pad.full': '전각 공백 (　) - 추천',
    'pad.half': '일반 공백 ( )',
    'wrap.label': '전체 테두리로 감싸기 (좌우 외곽선 및 모서리 표시)',

    'manual.fullWidth': '한글/전각 너비 보정',
    'manual.border': '테두리 너비 보정',

    'box.maxWidth': '상자 최대 너비',
    'box.maxWidth.hint': '텍스트 길이에 맞춰 테두리 개수가 자동으로 조절됩니다. 이 값을 초과하면 줄바꿈됩니다.',
    'box.title': '상자 제목 (선택)',
    'box.title.placeholder': '예: 핸드아웃: 오래된 일기장',
    'box.content': '상자 내용',
    'box.content.placeholder': '내용을 입력하세요. 너비에 맞춰 자동으로 줄바꿈됩니다.',

    'table.maxWidth': '표 전체 최대 너비',
    'table.maxWidth.hint': '이 값을 초과하면 내용이 긴 열부터 자동으로 칸 내에서 줄바꿈됩니다.',
    'table.data': '표 데이터 입력',
    'table.data.placeholder': '1 | 펌블 | 1d6 데미지를 입습니다.\n---\n2 | 실패 | 전조가 나타납니다.\n3 | 성공 | 단서를 하나 얻습니다.',
    'table.hint.columns': '각 열은 `|` 기호로 구분해 주세요.',
    'table.hint.divider': '줄에 `---`를 입력하면 가로 구분선이 추가됩니다.',
    'table.header': '첫 번째 행을 제목으로 사용하여 아래에 구분선 추가',

    'preview.heading': '미리보기',
    'copy.button': '복사하기',
    'copy.toast': '클립보드에 복사되었습니다! 채팅창에 붙여넣기 하세요.'
  }
});
