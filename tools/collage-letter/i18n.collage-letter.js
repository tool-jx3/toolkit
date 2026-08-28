/* collage-letter 字典。載入前需先載入 ../../assets/i18n.js。 */
I18N.register({
  'zh-TW': {
    /* ---- shell ---- */
    'app.title': '拼貼信產生器',
    'lang.aria': '顯示語言',

    /* ---- 信件內容 ---- */
    'message.label': '信件內容',
    'message.placeholder': '例如：今晚午夜，我將前來竊取你的心。',
    'btn.generate': '產生信件',

    /* ---- 尺寸與版面設定 ---- */
    'layout.heading': '📏 尺寸與版面設定',
    'layout.charSize.label': '文字大小：',
    'layout.imageWidth.label': '圖片寬度：',
    'layout.autoWidth.label': '依最長行自動調整寬度（停用自動換行）',
    'layout.align.label': '對齊方式：',
    'align.left': '靠左',
    'align.center': '置中',
    'align.right': '靠右',

    /* ---- 色彩配色設定 ---- */
    'color.heading': '🎨 色彩配色設定',
    'color.addLabel': '新增自訂色彩：',
    'color.bgLabel': '背景',
    'color.textLabel': '文字',
    'color.blackWhite': '黑／白',
    'color.whiteBlack': '白／黑',
    'color.redWhite': '紅／白',
    'color.yellowBlack': '黃／黑',
    'color.magentaWhite': '洋紅／白',
    'color.cyanBlack': '青／黑',
    'color.grayBlack': '灰／黑',
    'color.darkYellow': '深灰／黃',
    'color.custom': '自訂',
    'action.add': '新增',
    'action.delete': '刪除',

    /* ---- 字型設定 ---- */
    'font.heading': '🔤 字型設定與新增',
    'font.nameInput.placeholder': '字型名稱（例如：MyFont）',
    'font.urlInput.placeholder': '網頁字型 URL（css、woff）',

    /* ---- 預覽與匯出 ---- */
    'preview.heading': '預覽',
    'preview.hint': '結果過長或超出範圍時會自動換行。',
    'action.downloadPng': 'PNG 下載',
    'action.downloadPng.title': '儲存為透明背景 PNG',
    'action.downloadJpg': 'JPG 下載',
    'action.downloadJpg.title': '儲存為紙張質感背景 JPG',
    'action.copyImage': '複製圖片',
    'action.copyImage.title': '複製圖片到剪貼簿',
    'action.copyHtml': '複製 HTML',
    'action.copyHtml.title': '複製可用於 Tistory 等支援 HTML 的平台程式碼',
    'action.copyRoll20': '複製 Roll20',
    'action.copyRoll20.title': '複製 Roll20 聊天室專用特殊格式文字',

    /* ---- Roll20 設定 ---- */
    'roll20.basicFont.label': '複製 Roll20 時轉換為基本字型（明體／黑體／標楷體隨機）',
    'roll20.fontSize.label': 'Roll20 文字大小：',
    'roll20.min.label': '最小',
    'roll20.max.label': '最大',

    /* ---- 提示訊息 ---- */
    'toast.default': '已複製到剪貼簿！',
    'sample.defaultMessage': '你的\n心，我將前來竊取。\n－ 怪盜 －',
    'msg.fallbackText': '請輸入預告信內容！',
    'msg.generated': '已產生新的預告信！',
    'msg.copyImageFailed': '圖片複製失敗',
    'msg.imageCopied': '圖片已複製到剪貼簿！',
    'msg.clipboardUnsupported': '沒有剪貼簿權限，或瀏覽器不支援，請改用下載按鈕。',
    'msg.textCopyFailed': '文字複製失敗。',
    'msg.generateFirst': '請先產生預告信。',
    'msg.htmlCopied': 'HTML 程式碼已複製到剪貼簿！',
    'msg.roll20Copied': 'Roll20 程式碼已複製到剪貼簿！',
    'msg.fontFieldsRequired': '請同時輸入字型名稱與 URL。',
    'msg.fontAdded': '「{0}」字型已新增！請重新產生看看。',
    'msg.colorAdded': '已新增自訂色彩。',
    'msg.loadingFonts': '字型載入中……'
  },
  ko: {
    /* ---- shell ---- */
    'app.title': '익명 콜라주 편지 생성기',
    'lang.aria': '표시 언어',

    /* ---- 信件內容 ---- */
    'message.label': '메시지 내용',
    'message.placeholder': '예: 오늘 밤 자정, 당신의 마음을 훔치러 가겠습니다.',
    'btn.generate': '편지 생성',

    /* ---- 크기 및 레이아웃 설정 ---- */
    'layout.heading': '📏 크기 및 레이아웃 설정',
    'layout.charSize.label': '글자 크기:',
    'layout.imageWidth.label': '이미지 폭:',
    'layout.autoWidth.label': '제일 긴 줄에 가로폭 맞추기 (자동 줄바꿈 해제)',
    'layout.align.label': '정렬:',
    'align.left': '왼쪽',
    'align.center': '가운데',
    'align.right': '오른쪽',

    /* ---- 색상 팔레트 설정 ---- */
    'color.heading': '🎨 색상 팔레트 설정',
    'color.addLabel': '커스텀 색상 추가:',
    'color.bgLabel': '배경',
    'color.textLabel': '글자',
    'color.blackWhite': '흑/백',
    'color.whiteBlack': '백/흑',
    'color.redWhite': '적/백',
    'color.yellowBlack': '황/흑',
    'color.magentaWhite': '마젠타/백',
    'color.cyanBlack': '시안/흑',
    'color.grayBlack': '회/흑',
    'color.darkYellow': '다크/황',
    'color.custom': '커스텀',
    'action.add': '추가',
    'action.delete': '삭제',

    /* ---- 폰트 설정 ---- */
    'font.heading': '🔤 폰트 설정 및 추가',
    'font.nameInput.placeholder': '폰트명 (예: MyFont)',
    'font.urlInput.placeholder': '웹폰트 URL (css, woff)',

    /* ---- 미리보기 및 내보내기 ---- */
    'preview.heading': '미리보기',
    'preview.hint': '결과물이 잘리거나 길면 자동으로 줄바꿈이 됩니다.',
    'action.downloadPng': 'PNG 다운',
    'action.downloadPng.title': '투명 배경 PNG로 저장',
    'action.downloadJpg': 'JPG 다운',
    'action.downloadJpg.title': '종이 질감 배경 JPG로 저장',
    'action.copyImage': '이미지 복사',
    'action.copyImage.title': '클립보드에 이미지 복사',
    'action.copyHtml': 'HTML 복사',
    'action.copyHtml.title': '티스토리 등 HTML 적용 가능한 곳에 코드 복사',
    'action.copyRoll20': 'Roll20 복사',
    'action.copyRoll20.title': 'Roll20 채팅창용 특수 서식 텍스트 복사',

    /* ---- Roll20 설정 ---- */
    'roll20.basicFont.label': 'Roll20 복사 시 기본 폰트(바탕/돋움/궁서 랜덤)로 변환',
    'roll20.fontSize.label': 'Roll20 글자 크기:',
    'roll20.min.label': '최소',
    'roll20.max.label': '최대',

    /* ---- 알림 메시지 ---- */
    'toast.default': '클립보드에 복사되었습니다!',
    'sample.defaultMessage': '당신의\n마음을 훔치러 가겠습니다.\n- 괴도 -',
    'msg.fallbackText': '예고장 메시지를 입력해주세요!',
    'msg.generated': '새로운 예고장이 생성되었습니다!',
    'msg.copyImageFailed': '이미지 복사 실패',
    'msg.imageCopied': '이미지가 클립보드에 복사되었습니다!',
    'msg.clipboardUnsupported': '클립보드 권한이 없거나 지원하지 않는 브라우저입니다. 다운로드 버튼을 이용해주세요.',
    'msg.textCopyFailed': '텍스트 복사에 실패했습니다.',
    'msg.generateFirst': '먼저 예고장을 생성해주세요.',
    'msg.htmlCopied': 'HTML 코드가 클립보드에 복사되었습니다!',
    'msg.roll20Copied': 'Roll20 코드가 클립보드에 복사되었습니다!',
    'msg.fontFieldsRequired': '폰트 이름과 URL을 모두 입력해주세요.',
    'msg.fontAdded': "'{0}' 폰트가 추가되었습니다! 생성기를 다시 돌려보세요.",
    'msg.colorAdded': '커스텀 색상이 추가되었습니다.',
    'msg.loadingFonts': '폰트 로딩 중...'
  }
});
