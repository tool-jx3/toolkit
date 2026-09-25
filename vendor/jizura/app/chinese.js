/* 繁體中文版的名稱（TRPG Toolkit 新增）。與上游 app/english.js 同樣在所有表現包登錄完之後、
   編輯器啟動之前執行；內部 ID 與專案 JSON 不受語言影響。上游新增部件而這裡還沒翻到的，
   會保留日文名稱（tests/smoke.mjs 會檢查每個部件都有譯名）。 */
(() => {
  'use strict';
  const titles = {
    layout: {
      center: '置中', mixed: '大小混排', vcols: '直排', marquee: '流動橫帶', tile: '滿版鋪排', scatter: '散落',
      ring: '圓環', wave: '波浪軌跡', huge: '超出畫面', labels: '貼標籤', condensed: '瘦長壓縮', gloss: '註解',
      type: '打字', diag: '斜向色帶', circle: '圓窗', stack: '殘影堆疊', pill: '膠囊', lowerThird: '下方字卡',
      corners: '對角配置', staircase: '階梯', zigzag: '之字形', arcTop: '彩虹弧', spiral: '螺旋',
      gridCells: '方格', dropCap: '首字放大', justified: '內文排版', frameBox: '畫框', bubble: '對話框',
      subtitleBar: '字幕條', ticker: '新聞跑馬燈', splitScreen: '雙分割', mirror: '鏡像', sideways: '文字側倒',
      edgeFrame: '外圍環繞', perspective: '縱深透視', hanko: '落款', genkou: '稿紙', panels: '漫畫分格',
      filmstrip: '底片', quote: '引言', ruler: '尺寸標線', searchBar: '搜尋框', chat: '聊天',
      notification: '通知', ticket: '票券', rain: '文字雨', hanging: '吊掛', orbit: '繞行', tunnel: '隧道',
      wordCloud: '文字雲', bounceLine: '彈跳', elastic: '橡皮筋', crossBands: '交叉帶', stickerBomb: '貼紙',
      neon: '霓虹燈', keycaps: '鍵帽', bubbles: '泡泡', slotMachine: '拉霸機', flipBoard: '翻牌看板',
      credits: '片尾名單', zoomRepeat: '連續放大', splitHalves: '上下分割', columnsBig: '大小直排',
      circleWords: '同心圓', dotMatrix: '點陣顯示', depthStack: '縱深疊層', typeSpecimen: '字體樣本',
      kanjiFocus: '單字強調', halfVertical: '直橫混排', curtain: '布幕', equalizer: '等化器', tape: '膠帶',
      magazine: '雜誌跨頁', headlineDeck: '標題與導言', contents: '目錄', footnote: '腳註', proofread: '校樣',
      numbered: '編號', poster: '海報', swissGrid: '瑞士網格', dictionary: '辭典', ema: '繪馬', ransom: '剪貼字',
      newspaper: '報紙', vinyl: '黑膠唱片', cassette: '卡帶', bookSpine: '書背', polaroid: '拍立得',
      stampSheet: '郵票版張', postcard: '明信片', letterPaper: '信紙', calendar: '月曆', chochin: '燈籠',
      routeMap: '路線圖', stationSign: '站名牌', noren: '門簾', tanzaku: '短籤', omikuji: '籤詩',
      kakejiku: '掛軸', shoji: '紙門', clapper: '場記板', warningLabel: '警告標籤', priceTag: '標價牌',
      nameTag: '名牌', stickyNotes: '便利貼', karuta: '歌牌', cube: '立方體', cylinder: '圓柱',
      flipCards: '翻卡', accordion: '風琴摺', flag: '飄揚旗幟', ribbon: '緞帶', pendulum: '鐘擺', pile: '文字堆',
      blocks: '積木', balloons: '文字氣球', magnets: '磁鐵', tiles: '文字磚', bulbs: '燈泡招牌',
      ledScroll: 'LED 跑馬燈', billboard: '廣告看板', crowdBubbles: '對話框群', crossword: '填字遊戲',
      wordSearch: '找字遊戲', puzzle: '拼圖', shadowPlay: '皮影戲', kaleido: '萬花筒', dominoes: '骨牌',
      burst: '爆炸框', fisheye: '魚眼鏡頭', wall: '牆面透視', origami: '摺紙', zipper: '拉鍊', sliceStack: '切片疊層',
      glitchGrid: '故障格子', mosaicTiles: '馬賽克磚', maskReveal: '文字窗', contour: '等高線',
      halftoneBig: '網點巨字', stencil: '噴漆模板'
    },
    enter: {
      cut: '直接出現', assemble: '散開→聚合', slice: '切片', type: '打字', pop: '彈出', drop: '落下',
      stretch: '伸縮', wipe: '擦入', blur: '模糊', spin: '旋轉', flicker: '閃爍', scramble: '亂碼', zoom: '縮放',
      riseMask: '由下顯現', dropMask: '由上顯現', slideL: '由左滑入', slideR: '由右滑入', slideWhole: '整體滑入',
      flipX: '縱軸翻轉', flipY: '橫軸翻轉', domino: '骨牌', fold: '摺開', unroll: '捲開', strokeDraw: '描線後上色',
      outlineFill: '輪廓→填色', splitJoin: '上下合體', vSlice: '縱向切片', shutter: '快門', iris: '光圈',
      diagWipe: '斜向擦入', blinds: '百葉窗', checker: '棋盤格', randomOrder: '隨機順序', bounceBig: '大跳躍',
      squashDrop: '壓扁落地', rubber: '橡皮伸縮', glitchIn: '故障出現', echoIn: '殘影收束', whip: '甩入',
      skewIn: '歪斜', trackIn: '字距收攏', trackOut: '字距拉開', blurStagger: '模糊錯落', fadeStagger: '逐字淡入',
      waveIn: '波浪湧現', spiralIn: '螺旋聚合', zoomOut: '巨大→原寸', resolve: '解碼', magnet: '磁吸',
      inkBleed: '暈染', neonOn: '霓虹點亮', cursorSweep: '游標掃過', stamp: '蓋章', springIn: '彈簧',
      pendulum: '鐘擺', rollIn: '滾入', slingshot: '彈弓', rockSettle: '搖晃落定', bounceBall: '彈跳球',
      snapRail: '吸附對齊', fanOpen: '扇子展開', cylinder: '圓柱旋轉', shuffle: '洗牌', stopMotion: '定格動畫',
      ripple: '漣漪', zipper: '拉鍊', zoomAlt: '交替縮放', tiltUp: '立起', stickerPeel: '貼上貼紙',
      crumple: '揉皺展平', noteUnfold: '打開信紙', tornJoin: '撕紙拼合', splitFlap: '翻牌', overexpose: '過曝',
      glint: '閃光', loupe: '放大鏡', filmFeed: '膠卷過片', backlight: '逆光', lightLeak: '漏光',
      heatHaze: '熱浪扭曲', crtOn: 'CRT 開機', interlace: '隔行掃描', loadingBar: '讀取條', dither: '遞色',
      odometer: '滾筒轉動', matrixRain: '數據降落', hatchFill: '排線→實色', brushReveal: '毛筆揮掃', inkDrop: '墨滴',
      quarters: '四方聚合', invertBox: '反白鏤空', printRegister: '套色錯位', echoCount: '倒數進場',
      liquidFill: '水位上升', windBlown: '乘風而來', strokeOrder: '逐筆書寫', clockWipe: '順時針',
      shadowFirst: '影子先落', bubbles: '泡泡', tokoroten: '擠壓推出'
    },
    hold: {
      still: '靜止', jitter: '抖動', drift: '漂移', breathe: '呼吸', wave: '波浪', glitchtick: '故障感',
      float: '輕飄飄', sway: '搖曳', pulse: '脈動', shimmer: '閃耀', colorRun: '色彩流動', rotateSlow: '緩慢旋轉',
      trackBreathe: '字距呼吸', skewWobble: '斜向搖晃', beatHop: '隨拍跳動', hWave: '橫向波浪', heartbeat: '心跳',
      orbitSmall: '小幅繞圈', jelly: '果凍', scanBand: '掃描帶', noiseDrift: '雜訊漂移', tilt: '蹺蹺板',
      zoomSlow: '緩慢推近', stretchPulse: '隨拍橫伸', glitchJump: '偶爾錯位', echoTrail: '殘影拖曳',
      glowFlicker: '燈火搖曳', windGust: '陣風', dangle: '懸吊晃動', eqBounce: '隨音量伸縮', flashBox: '隨拍反白',
      glintSweep: '光澤掃過', flipSwap: '偶爾翻面', shadowSway: '影子搖晃', magnetJiggle: '磁力吸引',
      typeRattle: '打字機顫動', focusRack: '移焦', pluckString: '撥弦振動'
    },
    exit: {
      cut: '直接消失', explode: '爆炸四散', fall: '崩落', drift: '霧散', slice: '切片退場', wipe: '擦除退場',
      shrink: '收縮', blur: '模糊退場', stretch: '伸縮退場', scatter: '飛散', glitch: '故障退場', sinkMask: '下沉',
      riseOut: '向上穿出', slideOutL: '向左流走', slideOutR: '向右流走', flipOutX: '關門', flipOutY: '啪地倒下',
      foldOut: '摺起', squash: '壓扁', trackOutWide: '字距散開', collapse: '吸入', zoomThrough: '衝向鏡頭',
      zoomFar: '退向遠方', spinOut: '旋轉消失', twist: '扭轉', waveOut: '波浪崩解', blurOutStagger: '逐字模糊',
      undraw: '退回線稿', outlineOut: '填色消退', irisClose: '光圈收合', diagWipeOut: '斜向擦除',
      blindsClose: '百葉窗', checkerOut: '棋盤格', splitApart: '上下裂開', vSliceDrop: '縱切落下', melt: '融化',
      dissolve: '片片剝落', backspace: '退格刪除', scrambleOut: '符號化', glitchDissolve: '方塊化',
      echoOut: '殘響', whipOut: '甩出', gravity: '重力墜落', popOut: '迸裂', burn: '燒毀', sweepCover: '色條遮蓋',
      shatterLite: '四分飛散', peelOff: '撕下貼紙', crumpleOut: '揉掉丟棄', tearOut: '撕掉丟棄', scorchOut: '焦黑消失',
      overexposeOut: '過曝泛白', scanOut: '掃描線消除', stripesOut: '條紋消除', halftoneOut: '化為網點',
      eraserOut: '板擦擦除', vacuumOut: '吸入一點', sandOut: '化沙飛散', shredOut: '碎紙機', dominoOut: '骨牌倒下',
      hingeOut: '單邊脫落', rocketOff: '發射升空', bounceOff: '彈跳離去', balloonOff: '氣球飛走',
      deflateOut: '洩氣亂飛', hazeOut: '熱浪消散', glassBreak: '玻璃碎裂', zipOut: '拉鍊', clapShut: '中央閉合',
      lampOff: '熄燈', slotOut: '拉霸轉動', clockOut: '時鐘擦除', matrixOut: '數位雨', tornadoOut: '龍捲風',
      rollUpOut: '捲起收走', snakeOut: '列隊離去', flutterOut: '飄落', rollOff: '滾動離去', fanClose: '收起扇子',
      rgbSplitOut: '色彩分離', shockOut: '衝擊波', floodOut: '淹沒', slashOut: '一刀兩斷', mosaicOut: '馬賽克',
      scribbleOut: '亂塗抹消', candleOut: '吹熄'
    },
    decor: {
      brackets: '框角標記', rings: '座標圓環', dots: '圓點環', arrows: '箭頭', slash: '斜線', sparks: '火花',
      leaders: '引線標註', waveform: '波形', barcode: '條碼', grid: '網格', stripes: '條紋', blobs: '墨漬',
      bars: '粗糙色帶', shapes: '圖形', counter: '大數字', crosshair: '十字準線', cropMarks: '裁切標記',
      reticle: '鎖定準星', radar: '雷達', progressRing: '進度環', timecodeBar: '時間碼', rulerEdge: '邊緣尺規',
      dimension: '尺寸線', indexNum: '流水號', dateStamp: '相片日期戳', qrBlock: 'QR 碼方塊',
      glitchRects: '故障碎片', concentricSquares: '同心方框', triangleSpin: '旋轉三角', lineBurst: '放射短線',
      plusGrid: '十字格點', guides: '參考線', waveLine: '波浪線', spiralLine: '螺旋線', halftonePatch: '網點',
      checkerStrip: '棋盤格帶', beatRing: '拍點圓環', orbitDots: '環繞圓點', constellation: '星座',
      confetti: '紙花', petals: '花瓣', rainStreaks: '雨絲', snow: '飄雪', lightLeak: '漏光', bokeh: '散景光斑',
      speedCorner: '集中線', risingParticles: '上升粒子', twinkle: '閃爍', brushStroke: '毛筆刷痕',
      tapePieces: '紙膠帶', scribbleCircle: '手繪圈選', scribbleUnder: '手繪底線', crossOut: '推敲塗改',
      highlightMark: '螢光筆', heartsStars: '愛心與星星', watermarkKanji: '浮水印大字', verticalStrip: '直排字帶',
      romajiLine: '羅馬拼音', bracketsJP: '方頭括號', seal: '落款', kamon: '家紋', seigaiha: '青海波',
      asanoha: '麻葉紋', hanabi: '煙火', chochin: '燈籠', shimenawa: '注連繩', sensu: '摺扇', tsukiKumo: '雲間月',
      momiji: '楓葉', namiGashira: '浪頭', kasumi: '霞靄', hexGrid: '蜂巢格', spectrumRing: '環形頻譜',
      dataColumns: '資料列', spinner: '載入轉圈', headingTape: '方位刻度帶', glyphLock: '文字鎖定',
      atomOrbit: '原子軌道', sonarArcs: '音波', circuit: '電路', swatches: '色票', ruledLines: '橫線筆記本',
      registration: '套準標記', punchHoles: '打孔', staple: '釘書針', paperClip: '迴紋針', indexTabs: '索引標籤',
      vines: '藤蔓', cloudPuffs: '雲朵', starField: '星空', moonPhases: '月相', sunRays: '陽光',
      rainRipples: '雨滴漣漪', bubbles: '肥皂泡泡', smoke: '輕煙', dandelion: '蒲公英', fireflies: '螢火蟲',
      memphis: '孟菲斯風', zigzagRibbon: '鋸齒緞帶', polkaPatch: '圓點花紋', stripeCircle: '條紋圓',
      decoCorners: '裝飾角花', halfCircles: '半圓堆疊', loopArrows: '循環箭頭', starburst: '爆炸貼',
      tally: '正字記數', cursorClick: '滑鼠游標', windowChrome: '視窗', progressBar: '進度條',
      toggleSwitch: '切換開關', notifBell: '通知鈴', likeCounter: '按讚', mediaControls: '播放按鈕',
      volumeBars: '音量', musicNotes: '音符'
    },
    treat: {
      none: '無', outline: '空心字', outlineFill: '描邊', doubleOutline: '雙層描邊', extrude: '立體字',
      longShadow: '長投影', hardShadow: '錯位陰影', softShadow: '柔和陰影', glow: '發光', marker: '麥克筆',
      underline: '底線', strike: '刪除線', boxed: '色塊襯底', gradientV: '垂直漸層', splitColor: '上下雙色',
      halftone: '網點', stripes: '條紋', hatch: '斜線紋', dotted: '虛線輪廓', alternate: '交替色', italic: '斜體',
      wide: '扁體', tall: '長體', echoOutline: '輪廓殘影', emphasisDots: '著重號', neonOutline: '霓虹燈管',
      chrome: '鍍鉻', rainbow: '彩虹色', glitchSplit: '色版錯位', shadowStack: '多重陰影', stencilGap: '模板字',
      waterline: '水位', karaoke: '卡拉 OK', sizeWave: '大小節奏', rotateAlt: '搖擺字', baselineShift: '高低錯落',
      fauxBold: '極粗', circled: '圓圈字', bracketsQuote: '引號', reflection: '倒影', inline: '內描線',
      sticker: '貼紙邊', gradientSweep: '光澤掃過', kerningWide: '寬字距', monoGrid: '稿紙格',
      outlineOffset: '錯位空心字', toneShadow: '網點陰影', fadeChars: '餘韻', cutShift: '切割錯位',
      focusPull: '移焦', spotChar: '單字標記', ransom: '剪貼字'
    },
    bg: {
      none: '純色', auroraRibbons: '極光', meshBlobs: '網格漸層', duotoneSweep: '雙色漸移',
      horizonGlow: '行星邊緣', seigaiha: '青海波', asanoha: '麻葉紋', houndstooth: '千鳥格', herringbone: '人字紋',
      argyle: '菱格紋', tartan: '蘇格蘭格紋', chevron: '山形紋', isoCubes: '立方體', hexGrid: '蜂巢格',
      triTess: '三角馬賽克', moire: '摩爾紋', squareTunnel: '方形隧道', spiralArms: '漩渦', topoLines: '等高線',
      ridgePlot: '稜線圖', starfield: '星空', nightMoon: '月夜', skyline: '街景', sunsetSun: '夕陽',
      oceanWaves: '海浪', rainWindow: '雨窗', snowLayers: '飄雪', fireworks: '煙火', cloudLayers: '雲層',
      mountains: '山巒', filmStrip: '底片', vhsBand: 'VHS 雜訊', tornPaper: '撕紙', godRays: '光芒',
      vignettePulse: '彩色暈邊', kaleidoscope: '萬花筒', marble: '大理石', paperCut: '剪紙', sunburst: '放射狀',
      concentric: '同心圓', halftoneFade: '網點漸層', bigStripes: '粗斜紋', splitV: '左右雙色', splitH: '上下雙色',
      splitDiag: '斜向雙色', gradientSweep: '漸層', spotlight: '聚光燈', tvBars: '電視彩條', checker: '棋盤格',
      bigChar: '巨大文字', speedLines: '集中線', scanBars: '掃描線帶', dotGrid: '點陣格', retroGrid: '復古網格',
      bokehBg: '散景光斑', particlesBg: '飛舞粒子', ripples: '漣漪', polka: '圓點花紋', eqBars: '等化器',
      borderFrame: '粗外框', letterbox: '電影黑邊', noiseField: '雜訊波動'
    },
    cam: {
      push: '緩慢推近', orbitDrift: '環繞', barrelRoll: '桶滾翻轉', pendulumSway: '鐘擺', focusIn: '對焦',
      rackFocus: '失焦', earthquake: '地震', floatNoise: '漂浮', vertigo: '眩暈變焦', tiltDown: '向下搖鏡',
      spiralIn: '螺旋變焦', snapPan: '瞬間搖鏡', jelly: '果凍晃動', pullOut: '拉遠', panL: '向左搖鏡', panR: '向右搖鏡',
      tiltUp: '向上搖鏡', dutch: '斜角鏡頭', handheld: '手持鏡頭', beatPunch: '隨拍變焦', whipIn: '甩鏡進場',
      crashZoom: '急速變焦', bounce: '彈跳', roll: '滾轉', driftDiag: '斜向漂移', shakeHard: '劇烈晃動',
      dollyIn: '推軌', stepZoom: '分段變焦'
    },
    fx: {
      chroma: '色差跳動', shake: '晃動', slice: '切片故障', block: '區塊故障', invert: '負片', flash: '閃光',
      zoom: '縮放模糊', mosaic: '馬賽克', radialChroma: '放射色差', bloomFlash: '泛光', bulge: '魚眼',
      pixelSort: '像素排序', interlace: '隔行掃描', macroBlock: '區塊雜訊', halftone: '網點', duotone: '雙色調',
      ditherBit: '1-bit 混色', rotateSnap: '傾斜回彈', echoFrames: '殘影', kaleido: '萬花筒',
      bandInvert: '條帶負片', lightRays: '光芒', anamorphic: '變形鏡炫光', heartbeat: '心跳', tvStatic: '雪花雜訊',
      dustScratches: '底片刮痕', filmAdvance: '底片捲動', perspectiveTilt: '透視搖擺', ripple: '漣漪',
      focusLines: '集中線', speedLines: '速度線', starGlint: '閃亮', colorBars: '彩條', zoomStutter: '縮放連打',
      negativeRing: '負片圓環', edgeDetect: '邊緣偵測', shatter: '玻璃碎裂', defocus: '失焦', snapshot: '快門',
      squash: '擠壓伸展', scanBar: '掃描', loopScroll: '橫向循環', panelWipe: '色板擦除', irisTrans: '光圈',
      doors: '門扉', blindsTrans: '百葉窗', rgbSplit: 'RGB 分離', smear: '橫向拖影', vhsRoll: 'VHS 捲動',
      trackingNoise: '循軌雜訊', mirrorFlash: '鏡像', strobe: '頻閃', posterize: '色調分離', hueShift: '色相偏移',
      tileShift: '方格錯位', filmBurn: '底片燒灼', whipBlur: '甩鏡模糊', blackFrame: '黑影格', whiteFrame: '白影格',
      gridRepeat: '分割畫面', waveWarp: '波浪扭曲', pixelDrift: '像素偏移', zoomPunch: '衝擊縮放',
      lightSweep: '光束掃過', crtOff: '映像管關機', splitSlide: '上下錯開'
    },
    trans: {
      wipe: '亮邊擦除', diagonalWipe: '斜帶擦除', clockWipe: '時鐘擦除', irisOpen: '光圈展開', pushSlide: '推移',
      cover: '覆蓋', uncover: '揭開', zoomThrough: '穿越縮放', doorsOpen: '對開門', blinds: '百葉窗轉場',
      checker: '棋盤格轉場', blockDissolve: '方塊溶解', whipPan: '甩鏡', spinOut: '旋轉飛出', inkBlob: '墨水暈染',
      shatterTiles: '碎片崩落', sliceShift: '條帶錯移', cubeTurn: '立方體旋轉', flashCross: '閃光轉場',
      pixelate: '馬賽克轉場'
    }
  };
  for (const group of J.GROUP_KEYS) {
    for (const key of J.order(group)) {
      const item = J.registry(group)[key], name = (titles[group] || {})[key];
      if (item && name) item.name = name;
    }
  }
  const styles = {
    noir: ['黑白色差', '黑底、白字、青色／琥珀色錯位'],
    crimson: ['深紅訊號', '深紅底、黑白雙段排版、資料毀損'],
    caution: ['警示', '黃底、紅藍強調色、儀表介面'],
    magenta: ['普普洋紅', '螢光粉紅×白、粗圓體、引線'],
    paper: ['紙與墨', '紙張質感、靛藍與洋紅、明體殘影'],
    hud: ['暗黑 HUD', '炭灰底、細線框、橙色點綴、日蝕'],
    mint: ['薄荷終端機', '黑×青綠×萊姆綠、標籤貼、狹縫掃描'],
    specimen: ['字體樣本', '墨色底、明體、辭典註解與引線'],
    transit: ['轉乘', '橄欖綠×黃、箭頭與標誌、網點'],
    blueprint: ['藍圖', '鮮藍×白×黑、圖形拼貼、斜帶'],
    rouge: ['胭脂漸層', '淺灰底、紅色漸層、膠囊'],
    mono: ['單色 RGB', '灰色空間、白色明體、強烈 RGB 分離、座標圓環'],
    sakura: ['櫻花', '淡櫻色、深梅紫、夜櫻、圓體與明體'],
    ocean: ['深海', '深藍深海、青色發光、泡泡與細黑體'],
    sunset: ['晚霞漸層', '由橙到堇紫的漸層、粗明體、逆光'],
    forest: ['森林手札', '苔綠與米白、樹皮棕、鉛筆手寫字'],
    vapor: ['蒸氣波', '淡紫與粉彩粉紅／水藍、明體、VHS 暈染'],
    newsprint: ['報紙', '灰色新聞紙、墨黑與紅、標題明體、CMY 套色錯位與網點'],
    synth80: ['合成器 80s', '黑底霓虹洋紅／青、立體字、掃描線'],
    kraft: ['牛皮紙', '牛皮紙與米白、朱紅與靛藍印章、紙膠帶'],
    candy: ['糖果', '薄荷／草莓／檸檬／葡萄粉彩、圓潤彈跳的字'],
    acid: ['酸性風', '黑×酸性綠×洋紅、粗糙字體與破損畫面'],
    sumi: ['墨與朱', '和紙米白、墨色毛筆字、朱紅落款'],
    gold: ['金夜', '漆黑與金箔、象牙色明體、閃爍光芒']
  };
  for (const [key, [name, desc]] of Object.entries(styles)) {
    if (J.STYLES[key]) { J.STYLES[key].name = name; J.STYLES[key].desc = desc; }
  }
  const moods = {
    glitch: '故障感', calm: '沉靜', pop: '普普風', graphic: '圖像感', editorial: '雜誌感', emotional: '抒情',
    chaos: '全部混搭'
  };
  for (const [key, name] of Object.entries(moods)) if (J.MOODS[key]) J.MOODS[key].name = name;
  J.SAMPLE_LYRICS = '黎明的顏色/我還記得\n漸漸散去的聲音在遠方響起\n欸，現在還來得及嗎\n怎能就這樣*透明*地落幕!';
})();
