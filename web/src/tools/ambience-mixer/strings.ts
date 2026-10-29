import type { FileProblem } from './store';

/** 音檔沒有載入（沒有混進匯出）的原因 */
const PROBLEM: Record<FileProblem, string> = {
  missing: '找不到這個音檔',
  error: '無法解碼',
  tooLong: '太長，超過 15 分鐘',
  overTotal: '音檔加起來超過 30 分鐘',
};
const problemList = (list: readonly { name: string; reason: FileProblem }[]) =>
  list.map((x) => `「${x.name}」（${PROBLEM[x.reason]}）`).join('、');

/** 環境音混音器的介面文字（繁中；用詞照 DESIGN.md 第 5 節） */
export const S = {
  usage: {
    intro:
      '把雨、風、雷、海浪、營火、時鐘、心跳、人聲等環境音疊在一起，做出跑團場景的背景聲，再匯出成可以無縫循環的 MP3 或 WAV 放進 CCFOLIA 當 BGM。',
    steps: [
      '點聲音卡片加入（再點一次拿掉），或從「預設組合」挑一個場景；加入後馬上開始播放。',
      '在「混音中」調每個聲音的音量；按「調整」改強度、距離等參數，按「換一種變化」換同一種聲音的另一個版本。',
      '「自己的音檔」可以把 MP3、WAV、OGG 加成一軌（只在這個瀏覽器裡處理，不會上傳）。',
      '在「匯出」選格式（MP3 檔案小、WAV 最無縫）、長度、取樣率與聲道，按「匯出」；檔案頭尾接得起來，在 CCFOLIA 開「重複播放」就會一直循環。',
      '「分享連結」把目前的組合放進網址（只有合成的聲音，不含自己的音檔），對方開連結就能聽到同樣的組合。',
    ],
    notesTitle: '小提醒',
    notes: [
      '所有聲音都是程式即時合成的（本站自己做的，不是錄音），可以自由使用；匯出的檔案也是。',
      '瀏覽器規定要先點一下頁面才能出聲：重新整理後按「播放」或空白鍵開始。',
      'CCFOLIA 的音源每個檔案上限約 10 MB：MP3 不會超過；WAV 太大時縮短長度、改成單聲道、降低取樣率或改用 MP3。',
      '設定自動存在這個瀏覽器，可以復原／重做；自己的音檔也存在這個瀏覽器裡。',
    ],
  },
  keys: {
    group: '播放',
    edit: '編輯',
    play: '播放／暫停',
    undo: '復原',
    redo: '重做',
  },
  play: {
    play: '播放',
    pause: '暫停',
    empty: '先點一個聲音或預設組合加入。',
    failed: '無法播放聲音',
    master: '總音量',
    clear: '全部拿掉',
    share: '分享連結',
    count: (n: number) => `${n} 個聲音`,
    preparing: (n: number) => `準備中 ${n} 個`,
    hint: '按播放（或空白鍵）開始。',
  },
  timer: {
    label: '定時停止',
    off: '關',
    minutes: (m: number) => `${m} 分鐘後`,
    left: (text: string) => `還有 ${text} 慢慢停下來`,
    done: '定時停止：聲音已經慢慢停下來了。',
    hint: '跑團休息或散團時，時間到了自動淡出。',
  },
  mix: {
    title: '混音中',
    empty: '還沒有聲音。點選聲音卡片，或挑一個預設組合。',
    volume: (name: string) => `${name}的音量`,
    adjust: '調整',
    swell: '起伏',
    swellHint: '音量以 10 秒為週期慢慢起伏（40%～100%）',
    reroll: '換一種變化',
    remove: (name: string) => `拿掉「${name}」`,
    loading: '準備中…',
    updating: '更新中…',
    error: '這個聲音合成失敗，請拿掉再加入一次。',
    missing: '找不到這個音檔（可能是瀏覽器的資料被清掉了），請拿掉後重新加入。',
    fileError: '這個音檔無法播放，請換成 MP3、WAV 或 OGG。',
    tooLong: (length: string) =>
      `這個音檔太長了（${length}），沒有載入：上限 15 分鐘（太長的音檔會佔用很多記憶體）。請拿掉，剪短後再加入。`,
    overTotal:
      '自己的音檔加起來超過 30 分鐘，這一軌沒有載入（解碼後的音檔很佔記憶體）。拿掉前面的音檔後會自動載入。',
    param: (name: string, param: string) => `${name}：${param}`,
    file: {
      loop: '循環播放',
      loopHint:
        '關掉時「只播一次」：每次按播放從頭播一次；匯出時放在循環的開頭（CCFOLIA 循環播放時每一輪播一次）。',
      seam: '接縫淡化',
      seamHint:
        '把結尾交叉淡化接回開頭，錄音頭尾接不起來時也不會「喀」一聲。適合雨聲、風聲等雜訊與環境錄音；音樂或單一的音在接縫可能會變大聲（約 3 dB）。',
      fadeIn: '淡入',
      fadeOut: '淡出',
      seconds: '秒',
      length: (text: string) => `長度 ${text}`,
    },
  },
  presets: {
    title: '預設組合',
    description: '本站設計的跑團場景；套用後會換掉目前合成的聲音（自己的音檔留著），可以復原。',
    random: '隨機組合',
    randomHint: '一個背景聲＋一兩個點綴，音量與參數隨機',
    apply: (name: string) => `套用「${name}」`,
  },
  saved: {
    title: '我的組合',
    empty: '還沒有存下的組合。',
    nameLabel: '組合名稱',
    namePlaceholder: '例：第三幕的雨夜',
    save: '存下目前的組合',
    saveHint: '只存合成的聲音（不含自己的音檔），存在這個瀏覽器。',
    apply: '套用',
    rename: (name: string) => `「${name}」的名稱`,
    remove: (name: string) => `刪除「${name}」`,
    confirmRemove: (name: string) => `要刪除「${name}」嗎？`,
    confirmRemoveText: '我的組合刪掉之後不能復原。',
    done: (name: string) => `已存下「${name}」`,
    full: (n: number) => `我的組合最多 ${n} 個，請先刪掉不用的。`,
    nothing: '先加入合成的聲音才能存。',
    tracks: (n: number) => `${n} 個聲音`,
  },
  library: {
    title: '聲音',
    on: '混音中',
  },
  files: {
    title: '自己的音檔',
    description:
      'MP3、WAV、OGG 等加成一軌：可以循環或只播一次。只在這個瀏覽器裡處理，不會上傳；分享連結不含音檔。',
    drop: '把音檔拖到這裡',
    choose: '選擇音檔',
    hint: '最多 6 個，每個 60 MB、15 分鐘以內，加起來 30 分鐘以內',
    reading: (name: string) => `正在讀取「${name}」…`,
    tooBig: (name: string) => `「${name}」太大了（上限 60 MB）`,
    empty: (name: string) => `「${name}」是空的檔案（0 位元組）`,
    tooLong: (name: string, length: string) =>
      `「${name}」太長了（${length}）：上限 15 分鐘（太長的音檔會佔用很多記憶體），請剪短後再加入。`,
    atLeast: (length: string) => `至少 ${length}`,
    overTotal: (name: string, length: string, used: string) =>
      `「${name}」（${length}）加不進來：自己的音檔加起來最多 30 分鐘，目前已經有 ${used}。請先拿掉一些。`,
    askTitle: (name: string) => `讀不到「${name}」的長度`,
    askText: (size: string) =>
      `這個檔案 ${size}，可能超過 15 分鐘。要先完整解碼才知道長度，太長的話解碼時會佔用很多記憶體（可能超過 1 GB，瀏覽器會變慢）。要試著載入嗎？`,
    askConfirm: '試著載入',
    askCancel: '不要',
    tooShort: (name: string) => `「${name}」太短了（不到 0.5 秒），循環起來只會是一連串的雜音。`,
    failed: (name: string) => `「${name}」無法讀取`,
    notSaved: '這個瀏覽器存不了音檔（可能是空間不足或無痕模式），重新整理後要再加入一次。',
    unnamed: '音檔',
    rejected: '這不是音檔',
  },
  limit: {
    tracks: (n: number) => `最多同時 ${n} 個聲音，請先拿掉一些。`,
    files: (n: number) => `自己的音檔最多 ${n} 個。`,
  },
  exportPanel: {
    title: '匯出',
    description:
      '匯出可以無縫循環的 MP3 或 WAV（頭尾接得起來），放進 CCFOLIA 當 BGM、開「重複播放」。',
    format: '格式',
    formats: { mp3: 'MP3', wav: 'WAV' } as Record<'mp3' | 'wav', string>,
    mp3Hint:
      'MP3 的檔案小很多（1 分鐘約 1 MB）。Chrome、Edge 等看得懂 MP3 循環資訊（LAME 標頭）的播放器一樣首尾相接；看不懂的播放器在接縫會有約 0.01～0.03 秒很短的停頓。要最無縫時選 WAV。',
    wavHint: 'WAV 不壓縮、最無縫（頭尾的取樣直接接起來，任何播放器都一樣），但檔案大。',
    kbps: '位元率',
    kbpsLabel: (kbps: number, high: boolean) => `${kbps} kbps（${high ? '高音質' : '建議'}）`,
    kbpsValue: (kbps: number) => `${kbps} kbps`,
    length: '長度',
    rate: '取樣率',
    rateLabels: {
      44100: '44.1 kHz（CD 音質）',
      32000: '32 kHz（建議）',
      22050: '22.05 kHz（檔案小）',
    } as Record<number, string>,
    channels: '聲道',
    stereo: '立體聲',
    mono: '單聲道',
    size: (text: string) => `約 ${text}`,
    sameAsPreview: '和預覽聽到的一模一樣。',
    sameAsPreviewMp3: '和預覽是同一段聲音（MP3 有壓縮）。',
    differs: '合成的聲音會照這個長度與取樣率重新合成（同樣的設定，細節不同）。',
    tooBig: (limit: string) =>
      `超過 CCFOLIA 的音源上限（每個檔案約 ${limit}）：改用 MP3、縮短長度、改成單聲道或降低取樣率。`,
    button: (format: string) => `匯出 ${format}`,
    cancel: '取消',
    preparing: '合成中…',
    mixing: '混音中…',
    encoding: '編碼 MP3…',
    empty: '沒有可以匯出的聲音：每一軌的音量都是 0。',
    skipped: (list: readonly { name: string; reason: FileProblem }[]) =>
      `沒有混進去：${problemList(list)}。`,
    onlySkipped: (list: readonly { name: string; reason: FileProblem }[]) =>
      `沒有可以匯出的聲音：${problemList(list)}沒有載入。請拿掉或換掉再匯出。`,
    unsupported:
      '這個瀏覽器不能在背景混音（沒有 OfflineAudioContext），請換成新版的 Chrome、Edge、Firefox 或 Safari。',
    failed: (msg: string) => `匯出失敗：${msg}`,
    result: '匯出結果',
    listen: '試聽（循環播放，聽聽看接縫）',
    download: (format: string) => `下載 ${format}`,
    details: (o: {
      length: string;
      rate: string;
      channels: string;
      kbps: string;
      peak: string;
      ms: string;
    }) =>
      `${o.length}・${o.rate}・${o.channels}・${o.kbps ? `${o.kbps}・` : ''}最大音量 ${o.peak}・${o.ms}`,
    progress: '匯出進度',
  },
  share: {
    title: '分享連結',
    lead: '對方打開這個連結，就會聽到同樣的組合（同樣的聲音、音量、參數與變化）。',
    note: '連結只有合成的聲音；自己的音檔不會放進連結。',
    generating: '產生中…',
    tooLong: '組合太大，放不進連結。',
    link: '連結',
    copy: '複製',
    copied: '已複製',
    count: (n: number, max: number) =>
      `內容 ${n.toLocaleString('en-US')} 字（上限 ${max.toLocaleString('en-US')} 字）`,
    open: '在新分頁開啟',
    confirmTitle: '要換成分享的組合嗎？',
    confirmText: (names: string) =>
      `連結裡的聲音：${names}。目前合成的聲音會被換掉（自己的音檔留著），之後可以復原。`,
    confirm: '換成分享的組合',
    keep: '保留目前的',
    applied: '已套用分享的組合，按播放開始。',
    broken: '分享連結讀不出來（可能不完整或是舊版的連結）。',
    moodist:
      '這是 moodist 的分享連結，這裡讀不了（兩邊的聲音不同）；可以從預設組合或聲音卡片重新組一個。',
    nothing: '目前沒有合成的聲音可以分享。',
  },
} as const;
