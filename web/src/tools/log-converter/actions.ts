/**
 * 介面的動作：選檔與加入／移除檔案、分頁改名、頭像與插圖、圖片重新處理、轉換、預覽區段。
 * 規則本身在 load.ts、classify.ts、pipeline.ts、render/；這裡負責更新 store 與提示訊息。
 */

import {
  dataUrlBytes,
  dataUrlKb,
  fetchAsDataUrl,
  fileToDataUrl,
  processAvatar,
  processIllustration,
  processLogAvatar,
} from './images';
import {
  addLogFiles,
  autoChatTab,
  autoNarrator,
  initialNameColors,
  type LoadNotice,
  type LogSource,
  loadLogFiles,
  removeLogFile,
  renameChannel,
  sourceAvatars,
  sourceMainAvatars,
  sourceRoomName,
  sourceSpeakers,
  sourceTabs,
  titleFromFileName,
  type V2Source,
} from './load';
import { type ImageSet, illustrationPosition, prepareConversion } from './pipeline';
import { convertLog, previewSlice, renderPreview } from './render';
import {
  DEFAULT_TAB_TEXT,
  type LcSettings,
  qualitySpec,
  splitRule,
  type TabStyle,
} from './settings';
import {
  blankProfile,
  type ProfileState,
  patchSettings,
  setProfile,
  setSession,
  useSession,
  useSettings,
} from './store';
import { S } from './strings';

const settings = (): LcSettings => useSettings.getState().data;
const session = () => useSession.getState();

/* ---------- 載入 ---------- */

const noticeText = (n: LoadNotice): string =>
  n.kind === 'legacy-one'
    ? S.notices.legacyOne(n.first, n.rest)
    : n.kind === 'mixed'
      ? S.notices.mixed(n.excluded)
      : S.notices.multiAll(n.count);

/** 只有一個分頁時：分頁顏色與分頁顯示設定清空、分頁顏色的開關關閉（F14） */
function syncTabSettings(tabs: readonly string[]): void {
  const s = settings();
  if (tabs.length <= 1) {
    if (s.tabColorsEnabled || Object.keys(s.tabColors).length)
      patchSettings({ tabColorsEnabled: false, tabColors: {} });
    return;
  }
  const missing = tabs.filter((t) => !s.tabColors[t]);
  if (missing.length) {
    const tabColors = { ...s.tabColors };
    for (const t of missing) tabColors[t] = { text: DEFAULT_TAB_TEXT, bg: null };
    patchSettings({ tabColors });
  }
}

/** 新來源的發言者：副旁白只保留新日誌裡有的人（F22）、頭像只保留新日誌裡有的人 */
function keepForSpeakers(speakers: readonly string[]): void {
  const s = settings();
  const subs = s.subNarrators.filter((x) => speakers.includes(x.speaker));
  if (subs.length !== s.subNarrators.length) patchSettings({ subNarrators: subs });
  const profiles: Record<string, ProfileState> = {};
  for (const sp of speakers) profiles[sp] = session().profiles[sp] ?? blankProfile();
  setSession({ profiles });
}

/** 選檔（F01～F12）：每次選檔都重新開始 */
export async function loadFiles(files: readonly File[]): Promise<void> {
  if (!files.length) return;
  setSession({ phase: 'analyzing', fileNotice: null });
  let texts: string[];
  try {
    texts = await Promise.all(files.map((f) => f.text()));
  } catch {
    setSession({ phase: 'failed', fileNotice: S.load.readFailed(files[0].name) });
    return;
  }
  const result = loadLogFiles(files.map((f, i) => ({ name: f.name, text: texts[i] })));
  if (!result.ok) {
    setSession({ phase: 'failed', source: null, result: null, previewHtml: null });
    return;
  }
  const source = result.source;
  const tabs = sourceTabs(source);
  const speakers = sourceSpeakers(source);
  const prev = session().choices;
  let { title, subtitle } = prev;
  if (source.format === 'legacy') ({ title, subtitle } = titleFromFileName(source.fileName));
  else if (!title.trim()) title = sourceRoomName(source) ?? title;
  keepForSpeakers(speakers);
  syncTabSettings(tabs);
  setSession({
    phase: 'loaded',
    source,
    fileNotice: result.notices.length ? result.notices.map(noticeText).join(' ') : null,
    choices: {
      ...prev,
      title,
      subtitle,
      narrator: autoNarrator(speakers),
      chatTab: autoChatTab(tabs),
      nameColors: initialNameColors(source),
      hiddenTabs: [],
      tabStyles: {},
      useLogImages: true,
    },
    logAvatars: {},
    result: null,
    entries: [],
    previewHtml: null,
    status: null,
  });
  await processLogAvatars();
}

/** 換了來源（加入／移除檔案、改名）：依分頁名稱保留分頁的設定，名稱顏色依名稱保留 */
async function replaceSource(source: V2Source): Promise<void> {
  const prev = session().choices;
  const tabs = sourceTabs(source);
  const speakers = sourceSpeakers(source);
  const initial = initialNameColors(source);
  const nameColors: Record<string, string> = {};
  for (const sp of speakers) nameColors[sp] = prev.nameColors[sp] ?? initial[sp];
  const tabStyles: Record<string, TabStyle> = {};
  for (const t of tabs) if (prev.tabStyles[t]) tabStyles[t] = prev.tabStyles[t];
  keepForSpeakers(speakers);
  syncTabSettings(tabs);
  setSession({
    source,
    choices: {
      ...prev,
      narrator:
        prev.narrator && speakers.includes(prev.narrator) ? prev.narrator : autoNarrator(speakers),
      chatTab: prev.chatTab && tabs.includes(prev.chatTab) ? prev.chatTab : autoChatTab(tabs),
      nameColors,
      hiddenTabs: prev.hiddenTabs.filter((t) => tabs.includes(t)),
      tabStyles,
    },
  });
  await processLogAvatars();
}

/** 加入檔案（F08） */
export async function addFiles(files: readonly File[]): Promise<void> {
  const source = session().source;
  if (!files.length || source?.format !== 'v2') return;
  const texts = await Promise.all(files.map((f) => f.text()));
  const r = addLogFiles(
    source,
    files.map((f, i) => ({ name: f.name, text: texts[i] })),
  );
  if (!r.ok) {
    setSession({
      fileNotice: r.reason === 'mismatch' ? S.notices.addMismatch : S.notices.addDuplicate,
    });
    return;
  }
  const parts = [S.notices.added(r.added)];
  if (r.skipped) parts.push(S.notices.skipped(r.skipped));
  if (r.excluded) parts.push(S.notices.excluded(r.excluded));
  setSession({ fileNotice: parts.length > 1 ? parts.join(' ') : null });
  await replaceSource(r.source);
}

/** 移除檔案（F09）：一個都不剩時回到未載入 */
export async function removeFile(index: number): Promise<void> {
  const source = session().source;
  if (source?.format !== 'v2') return;
  const next = removeLogFile(source, index);
  if (!next) {
    setSession({
      phase: 'empty',
      source: null,
      fileNotice: S.notices.allRemoved,
      result: null,
      entries: [],
      previewHtml: null,
      status: null,
      logAvatars: {},
    });
    return;
  }
  setSession({ fileNotice: null });
  await replaceSource(next);
}

/**
 * 分頁改名（F54）：以名稱為準的設定（輸出的分頁、標示方式、分頁配色、閒聊分頁）跟著搬到新名稱；
 * 改成和另一個分頁相同的名稱時兩者合併，保留那個分頁原本的設定（第 5 節第 9 項）。
 */
export function renameTab(code: string, name: string): void {
  const source = session().source;
  if (source?.format !== 'v2') return;
  const r = renameChannel(source, code, name);
  if (r.from === r.to) return;
  const tabs = sourceTabs(r.source);
  const taken = sourceTabs(source).includes(r.to);
  const c = session().choices;
  const move = <T>(rec: Record<string, T>): Record<string, T> => {
    const out = { ...rec };
    if (r.from in out) {
      if (!taken) out[r.to] = out[r.from];
      if (!tabs.includes(r.from)) delete out[r.from];
    }
    return out;
  };
  const s = settings();
  if (r.from in s.tabColors) patchSettings({ tabColors: move(s.tabColors) });
  const hidden = c.hiddenTabs.includes(r.from) && !taken ? [...c.hiddenTabs, r.to] : c.hiddenTabs;
  setSession({
    source: r.source,
    choices: {
      ...c,
      chatTab: c.chatTab === r.from && !tabs.includes(r.from) ? r.to : c.chatTab,
      hiddenTabs: hidden.filter((t) => tabs.includes(t)),
      tabStyles: move(c.tabStyles),
    },
  });
  syncTabSettings(tabs);
}

/* ---------- 頭像（F23～F31） ---------- */

/** 新格式日誌裡的頭像依目前品質處理（F29、3.8） */
export async function processLogAvatars(
  onProgress?: (i: number, n: number) => void,
): Promise<void> {
  const source = session().source;
  if (source?.format !== 'v2') return;
  const s = settings();
  const spec = qualitySpec(s.quality, s.customQuality);
  const list = sourceAvatars(source);
  const out: Record<string, string> = {};
  let i = 0;
  for (const original of list) {
    out[original] = await processLogAvatar(original, spec, s.resizeImages);
    i += 1;
    onProgress?.(i, list.length);
  }
  if (session().source === source) setSession({ logAvatars: out });
}

async function processProfileSource(source: Exclude<ProfileState['source'], null>) {
  const s = settings();
  if (source.kind === 'external') return source.url;
  const spec = qualitySpec(s.quality, s.customQuality);
  return processAvatar(source.data, spec, s.resizeImages);
}

/** 上傳頭像（F24） */
export async function uploadProfile(
  speaker: string,
  file: File,
  onError: (msg: string) => void,
): Promise<void> {
  setProfile(speaker, { busy: true });
  try {
    const data = await fileToDataUrl(file);
    const source = { kind: 'file' as const, data, name: file.name };
    const image = await processProfileSource(source);
    setProfile(speaker, { source, image, busy: false });
  } catch (e) {
    setProfile(speaker, { source: null, image: null, busy: false });
    onError(
      S.avatar.readFailed(
        speaker || S.basic.emptySpeaker,
        e instanceof Error ? e.message : String(e),
      ),
    );
  }
}

let urlTicket = 0;

/** 頭像網址（F25、F26）：每次輸入都嘗試載入；清空時移除 */
export async function setProfileUrl(
  speaker: string,
  url: string,
  onError: (msg: string) => void,
): Promise<void> {
  const trimmed = url.trim();
  setProfile(speaker, { url });
  if (!trimmed) {
    setProfile(speaker, { source: null, image: null, busy: false });
    return;
  }
  if (settings().keepExternalUrl) {
    setProfile(speaker, {
      source: { kind: 'external', url: trimmed },
      image: trimmed,
      busy: false,
    });
    return;
  }
  const ticket = ++urlTicket;
  setProfile(speaker, { busy: true });
  try {
    const data = await fetchAsDataUrl(trimmed);
    const source = { kind: 'url' as const, url: trimmed, data };
    const image = await processProfileSource(source);
    if (ticket === urlTicket) setProfile(speaker, { source, image, busy: false });
  } catch {
    if (ticket !== urlTicket) return;
    setProfile(speaker, { source: null, image: null, busy: false });
    onError(S.avatar.urlFailed(speaker || S.basic.emptySpeaker));
  }
}

export function clearProfile(speaker: string): void {
  setProfile(speaker, { source: null, image: null, url: '', busy: false });
}

let reprocessTimer: ReturnType<typeof setTimeout> | null = null;

/** 圖片品質、縮放改變時：已上傳／下載的頭像與新格式日誌裡的頭像全部從原圖重新處理（F29） */
export function scheduleReprocess(delay = 0): void {
  if (reprocessTimer) clearTimeout(reprocessTimer);
  reprocessTimer = setTimeout(() => {
    reprocessTimer = null;
    void reprocessAll();
  }, delay);
}

async function reprocessAll(): Promise<void> {
  const profiles = Object.entries(session().profiles).filter(
    ([, p]) => p.source && p.source.kind !== 'external',
  );
  const v2 = session().source?.format === 'v2';
  const total = profiles.length + (v2 ? sourceAvatars(session().source as V2Source).length : 0);
  if (!total) return;
  let done = 0;
  const progress = () =>
    setSession({ imageStatus: S.avatar.processing(Math.min(done + 1, total), total) });
  progress();
  for (const [speaker, p] of profiles) {
    try {
      const image = await processProfileSource(p.source!);
      setProfile(speaker, { image });
    } catch {
      /* 處理失敗時保留原本的圖 */
    }
    done += 1;
    progress();
  }
  await processLogAvatars(() => {
    done += 1;
    progress();
  });
  setSession({ imageStatus: S.avatar.processed(total) });
  setTimeout(() => {
    if (session().imageStatus === S.avatar.processed(total)) setSession({ imageStatus: null });
  }, 2000);
}

/** 轉換用的圖片：發言者的頭像（上傳／網址，否則代表頭像）與逐則頭像 */
export function currentImages(): ImageSet {
  const { source, profiles, logAvatars } = session();
  const profileImages: Record<string, string> = {};
  if (source) {
    const main = sourceMainAvatars(source);
    for (const sp of sourceSpeakers(source)) {
      const own = profiles[sp]?.image;
      const fallback = main[sp] ? (logAvatars[main[sp]] ?? main[sp]) : null;
      const img = own ?? fallback;
      if (img) profileImages[sp] = img;
    }
  }
  const messageImages: Record<string, string> = {};
  if (source?.format === 'v2')
    for (const a of sourceAvatars(source)) messageImages[a] = logAvatars[a] ?? a;
  return { profileImages, messageImages };
}

/** 頭像總容量（F31） */
export function totalAvatarBytes(): number {
  return Object.values(currentImages().profileImages).reduce((sum, u) => sum + dataUrlBytes(u), 0);
}

/* ---------- 插圖（F41～F46） ---------- */

let illSeq = 0;

export function addIllustration(): void {
  const s = session();
  setSession({
    illustrations: [
      ...s.illustrations,
      {
        id: `ill-${Date.now()}-${++illSeq}`,
        position: '',
        source: 'file',
        fileData: '',
        fileName: '',
        url: '',
        size: 'medium',
        align: 'center',
      },
    ],
  });
}

export function removeIllustration(id: string): void {
  setSession({ illustrations: session().illustrations.filter((it) => it.id !== id) });
}

export async function uploadIllustration(
  id: string,
  file: File,
  onError: (msg: string) => void,
): Promise<void> {
  try {
    const data = await fileToDataUrl(file);
    const s = settings();
    const out = await processIllustration(data, qualitySpec(s.quality, s.customQuality));
    setSession({
      illustrations: session().illustrations.map((it) =>
        it.id === id ? { ...it, fileData: out, fileName: file.name } : it,
      ),
    });
  } catch (e) {
    onError(S.ill.readFailed(e instanceof Error ? e.message : String(e)));
  }
}

/* ---------- 轉換（F69～F71）與預覽（F72～F75） ---------- */

/** 大圖警告（F70）：依大小分割、縮放關閉時，本身就大於每檔大小的頭像與插圖 */
export function bigImages(): string[] {
  const s = settings();
  const rule = splitRule(s);
  if (rule.method !== 'size' || s.resizeImages) return [];
  const out: string[] = [];
  for (const [speaker, url] of Object.entries(currentImages().profileImages)) {
    const kb = dataUrlKb(url);
    if (kb > rule.value) out.push(S.result.bigImageAvatar(speaker, kb));
  }
  session().illustrations.forEach((it, i) => {
    const kb = it.source === 'file' ? dataUrlKb(it.fileData) : 0;
    if (kb > rule.value)
      out.push(S.result.bigImageIll(i + 1, illustrationPosition(it.position), kb));
  });
  return out;
}

const nextFrame = () => new Promise<void>((r) => setTimeout(r, 0));

/** 開始轉換：用按下當下的設定（之後改設定不影響預覽與下載，要再按一次） */
export async function convert(
  confirmBig: (list: string[], limitKb: number) => Promise<boolean>,
): Promise<boolean> {
  const { source } = session();
  if (!source) {
    setSession({ status: { text: S.result.selectFirst, tone: 'warning' } });
    return false;
  }
  const big = bigImages();
  if (big.length && !(await confirmBig(big, splitRule(settings()).value))) {
    setSession({ status: { text: S.result.cancelled, tone: 'info' } });
    return false;
  }
  setSession({ status: { text: S.result.reading, tone: 'progress' } });
  await nextFrame();
  try {
    const s = settings();
    const conv = prepareConversion(
      source,
      s,
      session().choices,
      currentImages(),
      session().illustrations,
    );
    setSession({ status: { text: S.result.analyzed(conv.entries.length), tone: 'progress' } });
    await nextFrame();
    const result = convertLog(conv.entries, conv.options, conv.rule, conv.fileBase);
    const n = result.pages.length;
    setSession({
      result,
      resultBlog: s.blogMode,
      entries: conv.entries,
      previewStart: 1,
      status: { text: n > 1 ? S.result.doneSplit(n) : S.result.done, tone: 'success' },
    });
    refreshPreview(1);
    return true;
  } catch (e) {
    setSession({
      status: { text: S.result.failed(e instanceof Error ? e.message : String(e)), tone: 'danger' },
    });
    throw e;
  }
}

/** 重畫預覽（F72～F74）：起始超出範圍時修正並寫回 */
export function refreshPreview(start?: number, limit?: number): void {
  const { result, entries, previewStart, previewLimit, previewKey } = session();
  if (!result) return;
  const lim = limit ?? previewLimit;
  const { slice, start: fixed } = previewSlice(entries, {
    start: start ?? previewStart,
    limit: lim,
  });
  const html = renderPreview(slice, result.options, settings().showLogNumbers);
  setSession({
    previewHtml: html,
    previewStart: fixed,
    previewLimit: lim,
    previewKey: previewKey + 1,
  });
}

export type { LogSource };
