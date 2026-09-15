/* ccfolia-cropper 字典。載入前需先載入 ../../assets/i18n.js。 */
I18N.register({
  'zh-TW': {
    /* ---- shell ---- */
    'app.title': '立繪裁切器',
    'nav.home': '← TRPG Toolkit',
    'lang.aria': '顯示語言',

    /* ---- 載入圖片 ---- */
    'drop.hint': '<strong>選擇 PNG 圖片／拖放／Ctrl+V</strong><br>一次載入多張時可在清單中預覽',
    'nav.label': '瀏覽圖片清單（A／D）',
    'nav.prev': '◀ 上一張',
    'nav.next': '下一張 ▶',

    /* ---- 裁切設定 ---- */
    'ratio.label': '選擇比例',
    'crop.range': '裁切範圍',
    'basis.label': '✨ 自動裁切基準',
    'basis.head': '以頭部為準',
    'basis.character': '角色中央',
    'basis.upper': '上半身中央',
    'basis.image': '圖片中央',
    'basis.manual': '手動指定',
    'basis.applyAll': '所有圖片套用相同基準',

    /* ---- 外框線 ---- */
    'outline.legend': '✨ 外框線',
    'outline.enable': '套用外框線效果',
    'outline.solid': '一般外框線',
    'outline.soft': '柔和外框線',
    'outline.glow': '發光外框線',
    'outline.shadow': '陰影',
    'outline.color': '外框線顏色',

    /* ---- 動作 ---- */
    'action.centerUpper': '🎯 上半身置中對齊（C）',
    'action.download': '下載目前圖片（Ctrl+S）',
    'action.downloadAll': '📦 全部批次下載',
    'zoom.label': '縮放：',
    'zoom.reset': '重設縮放與位置（R）',

    /* ---- 訊息 ---- */
    'crop.dragHint': '↔ 左右拖曳',
    'msg.pngOnly': '請只上傳 PNG 圖片檔。',
    'msg.batchWorking': '批次處理中…',
    'msg.batchDone': '已完成 {0} 張圖片的批次下載。'
  },
  ko: {
    /* ---- shell ---- */
    'app.title': 'CCFOLIA Standing Cropper v1.7',
    'nav.home': '← TRPG Toolkit',
    'lang.aria': '표시 언어',

    /* ---- 載入圖片 ---- */
    'drop.hint': '<strong>PNG 이미지 선택 / 드롭 / Ctrl+V</strong><br>다중 로드 시 목록에서 미리보기 가능',
    'nav.label': '이미지 목록 탐색 (A / D)',
    'nav.prev': '◀ 이전',
    'nav.next': '다음 ▶',

    /* ---- 裁切設定 ---- */
    'ratio.label': '비율 선택',
    'crop.range': '자르기 범위',
    'basis.label': '✨ 자동 크롭 기준',
    'basis.head': '머리 기준',
    'basis.character': '캐릭터 중앙',
    'basis.upper': '상체 중앙',
    'basis.image': '이미지 중앙',
    'basis.manual': '직접 지정',
    'basis.applyAll': '모든 이미지에 같은 기준 적용',

    /* ---- 外框線 ---- */
    'outline.legend': '✨ 외곽선',
    'outline.enable': '외곽선 효과 적용',
    'outline.solid': '일반 외곽선',
    'outline.soft': '부드러운 외곽선',
    'outline.glow': '빛나는 외곽선',
    'outline.shadow': '그림자',
    'outline.color': '외곽선 색상',

    /* ---- 動作 ---- */
    'action.centerUpper': '🎯 상반신 중앙 정렬 (C)',
    'action.download': '현재 이미지 다운로드 (Ctrl+S)',
    'action.downloadAll': '📦 전체 일괄 다운로드',
    'zoom.label': '줌:',
    'zoom.reset': '줌/위치 리셋 (R)',

    /* ---- 訊息 ---- */
    'crop.dragHint': '↔ 좌우 드래그',
    'msg.pngOnly': 'PNG 이미지 파일만 올려주세요.',
    'msg.batchWorking': '일괄 처리 중...',
    'msg.batchDone': '총 {0}개의 이미지 일괄 다운로드가 완료되었습니다.'
  }
});
