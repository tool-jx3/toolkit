/* text-path 字典。載入前需先載入 ../../assets/i18n.js。 */
I18N.register({
  'zh-TW': {
    /* ---- shell ---- */
    'app.title': '文字軌跡產生器',
    'nav.home': '← TRPG Toolkit',
    'lang.aria': '顯示語言',

    /* ---- 輸入文字 ---- */
    'input.label': '文字內容',
    'charCount.label': '字數（不含空白）：',
    'unit.char': '字',
    'input.placeholder': '請在此輸入文字。',
    'sample.defaultText': '覺得世界上應該已經有這個工具了，但因為找不到，所以自己做了一個。',

    /* ---- 形態選擇 ---- */
    'shape.label': '選擇形狀',
    'shape.circle': '圓形',
    'shape.spiral': '螺旋形',
    'shape.heart': '愛心',
    'shape.custom': '自由繪製',

    /* ---- 格線大小 ---- */
    'grid.label': '格線大小（解析度）：',
    'grid.hint': '數字越大，排列越寬廣且越精細。',

    /* ---- 自動調整間距 ---- */
    'density.label': '自動調整間距：',
    'density.hint': '自動調整大小時，用來控制文字聚集或分散的程度。',
    'density.veryTight': '非常緊密',
    'density.tight': '緊密',
    'density.normal': '適中',
    'density.loose': '寬鬆',
    'density.veryLoose': '非常寬鬆',

    /* ---- 空白字元 ---- */
    'space.label': '空白字元',
    'space.fullwidth': '全形空白',
    'space.normal': '一般空白',
    'space.middleDot': '間隔號',

    /* ---- Twitter 選項 ---- */
    'twitter.title': '使用透明的點字特殊字元，防止在 Twitter（X）上開頭空白被省略導致圖形跑版。',
    'twitter.label': '使用 Twitter 專用空白',
    'twitter.labelNote': '（防止跑版）',

    /* ---- 產生按鈕 ---- */
    'btn.generate': '產生文字',

    /* ---- 軌跡繪製 ---- */
    'output.pathHeading': '軌跡繪製',
    'action.autoScale': '自動調整大小',
    'action.autoScale.title': '依文字數量自動調整軌跡大小',
    'action.reverse': '反轉方向',
    'action.clear': '清除',
    'draw.hint': '請用滑鼠或觸控在此繪製線條！',

    /* ---- 結果 ---- */
    'result.heading': '結果',
    'result.count.label': '結果總字數：',
    'action.copy': '複製',
    'output.placeholder': '結果將顯示於此……',

    /* ---- 訊息提示 ---- */
    'msg.placeholder': '訊息',
    'msg.noPathToReverse': '沒有可反轉的軌跡。',
    'msg.needMoreChars': '文字需至少 2 個字才能自動調整大小。',
    'msg.drawPathFirst': '請先繪製軌跡或選擇形狀。',
    'msg.autoScaled': '軌跡大小已依文字數量調整完成。',
    'msg.enterText': '請輸入要排列的文字。',
    'msg.drawOrSelectShape': '請在畫布上繪製線條或選擇形狀。',
    'msg.nothingToCopy': '沒有可複製的內容。',
    'msg.copied': '已複製到剪貼簿！可以貼到遊戲聊天室試試看。',
    'msg.copyFailed': '複製失敗，請直接選取後自行複製。',
    'msg.copyUnsupported': '此瀏覽器不支援複製功能。'
  },
  ko: {
    /* ---- shell ---- */
    'app.title': '텍스트 궤적 생성기',
    'nav.home': '← TRPG Toolkit',
    'lang.aria': '표시 언어',

    /* ---- 輸入文字 ---- */
    'input.label': '텍스트',
    'charCount.label': '글자 수(공백 제외):',
    'unit.char': '자',
    'input.placeholder': '여기에 텍스트를 입력하세요.',
    'sample.defaultText': '세상 어딘가에 있을 것 같지만 제 눈에는 안 보여서 만들었습니다.',

    /* ---- 형태 선택 ---- */
    'shape.label': '형태 선택',
    'shape.circle': '원형',
    'shape.spiral': '나선형',
    'shape.heart': '하트',
    'shape.custom': '직접 그리기',

    /* ---- 그리드 크기 ---- */
    'grid.label': '그리드 크기 (해상도):',
    'grid.hint': '숫자가 클수록 더 넓고 세밀하게 배치됩니다.',

    /* ---- 자동 맞춤 간격 ---- */
    'density.label': '자동 맞춤 간격:',
    'density.hint': '크기 자동 맞춤 시 글자가 뭉치거나 퍼지는 정도를 조절합니다.',
    'density.veryTight': '매우 촘촘하게',
    'density.tight': '촘촘하게',
    'density.normal': '보통',
    'density.loose': '여유있게',
    'density.veryLoose': '매우 여유있게',

    /* ---- 공백 문자 ---- */
    'space.label': '공백 문자',
    'space.fullwidth': '전각 공백',
    'space.normal': '일반 공백',
    'space.middleDot': '가운데 점',

    /* ---- 트위터 옵션 ---- */
    'twitter.title': '트위터(X)에서 맨 앞 공백이 사라져 모양이 깨지는 것을 방지하는 투명한 점자 특수문자를 사용합니다.',
    'twitter.label': '트위터용 공백 사용',
    'twitter.labelNote': '(줄 밀림 방지)',

    /* ---- 생성 버튼 ---- */
    'btn.generate': '텍스트 생성하기',

    /* ---- 궤적 그리기 ---- */
    'output.pathHeading': '궤적 그리기',
    'action.autoScale': '크기 자동 맞춤',
    'action.autoScale.title': '글자 수에 맞춰 궤적 크기를 자동 조절합니다',
    'action.reverse': '방향 반전',
    'action.clear': '지우기',
    'draw.hint': '이곳에 마우스나 터치로 선을 그려보세요!',

    /* ---- 결과물 ---- */
    'result.heading': '결과물',
    'result.count.label': '결과물 총 글자수:',
    'action.copy': '복사하기',
    'output.placeholder': '결과가 여기에 표시됩니다...',

    /* ---- 알림 메시지 ---- */
    'msg.placeholder': '메시지',
    'msg.noPathToReverse': '반전할 궤적이 없습니다.',
    'msg.needMoreChars': '글자가 2자 이상이어야 크기를 맞출 수 있습니다.',
    'msg.drawPathFirst': '먼저 궤적을 그리거나 형태를 선택해주세요.',
    'msg.autoScaled': '궤적 크기가 글자 수에 맞춰 조절되었습니다.',
    'msg.enterText': '배치할 텍스트를 입력해주세요.',
    'msg.drawOrSelectShape': '캔버스에 선을 그리거나 모양을 선택해주세요.',
    'msg.nothingToCopy': '복사할 내용이 없습니다.',
    'msg.copied': '클립보드에 복사되었습니다! 게임 채팅창에 붙여넣기 해보세요.',
    'msg.copyFailed': '복사에 실패했습니다. 직접 선택하여 복사해주세요.',
    'msg.copyUnsupported': '브라우저에서 복사를 지원하지 않습니다.'
  }
});
