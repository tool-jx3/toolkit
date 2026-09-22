/* color-palette（角色配色條產生器） 字典。載入前需先載入 ../../assets/i18n.js。 */
I18N.register({
  'zh-TW': {
    'nav.home': '← TRPG Toolkit',
    'lang.aria': '顯示語言',
    'app.title': '角色配色條產生器',

    /* ---- 儲存 ---- */
    'save.crop': '裁邊儲存',
    'save.crop.title': '只留配色條周圍的留白，裁掉其餘再存。',
    'save.full': '整張儲存',
    'save.full.title': '連整個畫布範圍一起存。',
    'save.empty': '還沒有任何線條可以存。',

    /* ---- 樣式設定 ---- */
    'design.heading': '樣式設定',
    'design.bg': '背景色',
    'design.thickness': '線條粗細（px）',
    'design.base': '基準長度（px）',
    'design.base.title': '其他線條的長度都由這個基準長度換算。',
    'design.scale': '基準倍率',
    'design.scale.title': '對應基準長度的倍率（例如基準身高 160）',

    /* ---- 畫布尺寸 ---- */
    'size.heading': '畫布尺寸與留白',
    'size.auto': '自動調整',
    'size.width': '寬（px）',
    'size.height': '高（px）',
    'size.pad': '留白（px）',
    'size.pad.title': '自動調整尺寸與裁邊時，周圍要留的空白',

    /* ---- 角色線條 ---- */
    'char.heading': '角色線條',
    'char.editMode': '在畫布上調分段',
    'char.add': '＋ 加一條',
    'char.line': '第 {0} 條',
    'char.fromImage': '從圖片取色',
    'char.delete': '刪除',
    'char.ratio': '倍率',

    /* ---- 顏色分段 ---- */
    'seg.heading': '顏色分段',
    'seg.add': '＋ 加一段',
    'seg.empty': '還沒有分段。',
    'seg.ratio': '比例：',
    'seg.drag': '拖曳可調順序',
    'seg.delete': '刪除這一段',

    /* ---- 預覽 ---- */
    'view.zoom': '預覽倍率',

    /* ---- 從圖片取色 ---- */
    'tab.manual': '手動滴管',
    'tab.auto': '自動取色',
    'ext.count': '取色段數／顏色數',
    'ext.reset': '重設分段與選取',
    'ext.tol': '誤差容許度（1～50）',
    'ext.tol.title': '數字越大，越會把相近的顏色併在一起算。',
    'ext.zoom': '預覽放大',
    'ext.placeholder': '請先載入圖片檔。',
    'ext.cancel': '取消',
    'ext.apply': '套用取色',
    'ext.status': '點一下取色（{0}/{1}）',
    'ext.statusDone': '拖動圓點可以微調取色的位置。',
    'ext.noImage': '請先選一張圖片。',
    'ext.needAll': '請把 {0} 個顏色都選滿。'
  },

  ko: {
    'nav.home': '← TRPG Toolkit',
    'lang.aria': '표시 언어',
    'app.title': '캐릭터 컬파 막대 메이커',

    'save.crop': '크롭 저장',
    'save.crop.title': '막대 주변 여백만 남기고 잘라서 저장합니다.',
    'save.full': '전체 저장',
    'save.full.title': '캔버스 전체 영역을 저장합니다.',
    'save.empty': '저장할 선분이 없습니다.',

    'design.heading': '디자인 설정',
    'design.bg': '배경색',
    'design.thickness': '선 두께 (px)',
    'design.base': '기준 길이 (px)',
    'design.base.title': '이 기준 길이에 따라 다른 선의 길이가 계산됩니다.',
    'design.scale': '기준 배율',
    'design.scale.title': '기준 길이에 해당하는 기준 배율(예: 기준 키 160)',

    'size.heading': '캔버스 크기 및 여백',
    'size.auto': '자동 조절',
    'size.width': '너비 (px)',
    'size.height': '높이 (px)',
    'size.pad': '여백 (px)',
    'size.pad.title': '자동 크기 및 크롭 시 주변 여백',

    'char.heading': '캐릭터 선분',
    'char.editMode': '캔버스 구간 조절',
    'char.add': '+ 선분 추가',
    'char.line': '선분 {0}',
    'char.fromImage': '이미지에서 추출',
    'char.delete': '삭제',
    'char.ratio': '배율',

    'seg.heading': '색상 구간',
    'seg.add': '+ 추가',
    'seg.empty': '구간이 없습니다.',
    'seg.ratio': '비율:',
    'seg.drag': '드래그하여 순서 변경',
    'seg.delete': '구간 삭제',

    'view.zoom': '미리보기 배율',

    'tab.manual': '수동 스포이드',
    'tab.auto': '자동 색상 추출',
    'ext.count': '추출 구간/색상 수',
    'ext.reset': '구간/선택 초기화',
    'ext.tol': '오차 허용도 (1~50)',
    'ext.tol.title': '숫자가 클수록 비슷한 색상을 묶어서 계산합니다.',
    'ext.zoom': '미리보기 확대',
    'ext.placeholder': '이미지 파일을 불러와주세요.',
    'ext.cancel': '취소',
    'ext.apply': '추출 적용',
    'ext.status': '클릭하여 색상을 추출하세요 ({0}/{1})',
    'ext.statusDone': '원을 드래그하여 색상 위치를 세부조정할 수 있습니다.',
    'ext.noImage': '이미지를 선택해주세요.',
    'ext.needAll': '색상을 {0}개 모두 선택해주세요.'
  }
});
