/* gif-combiner（GIF 接合器） 字典。載入前需先載入 ../../assets/i18n.js。 */
I18N.register({
  'zh-TW': {
    'nav.home': '← TRPG Toolkit',
    'lang.aria': '顯示語言',
    'app.title': 'GIF 接合器',
    'app.tagline': '把多張 GIF 的影格對齊時間軸，合成一張。',

    /* ---- 檔案 ---- */
    'file.add': '加入 GIF',
    'file.pick': '點一下選檔案',
    'file.list': '檔案清單',
    'file.reorder': '可調順序與刪除',
    'file.delete': '刪除',
    'file.error': '處理這個檔案時出錯了：{0}',

    /* ---- 畫面尺寸與格線 ---- */
    'canvas.heading': '畫面尺寸（px）',
    'canvas.width': '寬（Width）',
    'canvas.height': '高（Height）',
    'grid.heading': '格線自動排列',
    'grid.cols': '橫向格數',
    'grid.rows': '縱向格數',
    'grid.apply': '排列',
    'grid.apply.title': '依現在的畫面尺寸排列',
    'grid.ratio': '1:1 比例',
    'grid.ratio.title': '維持原比例塞進格子',
    'grid.tight': '去掉留白',
    'grid.tight.title': '以第一張圖為準，不留邊填滿',
    'grid.note': '排列時不會把比例壓扁。',

    /* ---- 合成設定 ---- */
    'out.heading': '合成設定',
    'out.scale': '輸出倍率（%）',
    'out.fps': '輸出影格率',
    'out.note': '倍率調小有助於縮減檔案大小。',
    'out.duration': '總播放時間（ms）',
    'out.bg': '背景色',

    /* ---- 排版區與縮放 ---- */
    'work.heading': '排版區',
    'work.note': '可以拖曳，也可以調整大小。',
    'zoom.out': '縮小',
    'zoom.in': '放大',
    'zoom.fit': '配合畫面',
    'zoom.fit.title': '縮到整個畫面看得完',

    /* ---- 產生與結果 ---- */
    'gen.run': '產生 GIF',
    'gen.empty': '沒有可以合成的 GIF。',
    'gen.preparing': '準備合成……',
    'gen.progress': '合成中……{0}%',
    'result.heading': '產生完成',
    'result.download': '下載成品'
  },

  ko: {
    'nav.home': '← TRPG Toolkit',
    'lang.aria': '표시 언어',
    'app.title': 'GIF 이어붙이기 툴',
    'app.tagline': '여러 GIF의 프레임을 동기화하여 하나로 합칩니다.',

    'file.add': 'GIF 추가',
    'file.pick': '클릭하여 파일 선택',
    'file.list': '파일 목록',
    'file.reorder': '순서 변경 및 삭제',
    'file.delete': '삭제',
    'file.error': '파일을 처리하는 중 오류가 발생했습니다: {0}',

    'canvas.heading': '화면 설정 (px)',
    'canvas.width': '가로 (Width)',
    'canvas.height': '세로 (Height)',
    'grid.heading': '그리드 자동 정렬',
    'grid.cols': '가로 칸 수',
    'grid.rows': '세로 칸 수',
    'grid.apply': '정렬',
    'grid.apply.title': '현재 화면 크기에 맞춰 배열',
    'grid.ratio': '1:1 비율',
    'grid.ratio.title': '비율을 유지하며 칸에 맞춤',
    'grid.tight': '여백 제거',
    'grid.tight.title': '첫 번째 이미지 기준 여백 없이 꽉 채움',
    'grid.note': '비율이 찌그러지지 않도록 정렬됩니다.',

    'out.heading': '합성 설정',
    'out.scale': '출력 배율 (%)',
    'out.fps': '출력 프레임',
    'out.note': '배율을 줄이면 용량 최적화에 도움이 됩니다.',
    'out.duration': '총 재생 시간 (ms)',
    'out.bg': '배경색',

    'work.heading': '배치 영역',
    'work.note': '드래그 및 크기 조절이 가능합니다.',
    'zoom.out': '축소',
    'zoom.in': '확대',
    'zoom.fit': '맞춤',
    'zoom.fit.title': '화면에 맞추기',

    'gen.run': 'GIF 생성하기',
    'gen.empty': '합성할 GIF 파일이 없습니다.',
    'gen.preparing': '합성 준비 중...',
    'gen.progress': '합성 중... {0}%',
    'result.heading': '생성 완료',
    'result.download': '결과물 다운로드'
  }
});
