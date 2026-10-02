/**
 * e2e 用的掛鉤（window.__logConverter）：在真的瀏覽器裡用與介面相同的規則轉換附件的案例
 * （含 canvas 的圖片縮放與編碼），讓測試在 Chromium 裡比對計算後的顏色、圖片格式與尺寸。
 */

import { processAvatar, processIllustration, processLogAvatar } from './images';
import {
  autoChatTab,
  autoNarrator,
  initialNameColors,
  loadLogFiles,
  renameChannel,
  sourceAvatars,
  sourceMainAvatars,
  sourceSpeakers,
  sourceTabs,
  titleFromFileName,
  type V2Source,
} from './load';
import {
  type HookCase,
  type IllustrationItem,
  type LogChoices,
  prepareConversion,
} from './pipeline';
import { blogPage, convertLog } from './render';
import { DEFAULT_SETTINGS, type LcSettings, qualitySpec } from './settings';
import { useSession, useSettings } from './store';

async function convertCase(
  c: HookCase,
): Promise<{ pages: string[]; blog: string[]; fileBase: string }> {
  const loaded = loadLogFiles(c.files);
  if (!loaded.ok) throw new Error('empty');
  let source = loaded.source;
  const tabsAtLoad = sourceTabs(source);
  for (const [code, name] of Object.entries(c.renames ?? {}))
    source = renameChannel(source as V2Source, code, name).source;
  const settings: LcSettings = { ...DEFAULT_SETTINGS, ...c.settings };
  const spec = qualitySpec(settings.quality, settings.customQuality);
  const logAvatars: Record<string, string> = {};
  for (const a of sourceAvatars(source))
    logAvatars[a] = await processLogAvatar(a, spec, settings.resizeImages);
  const profileImages: Record<string, string> = {};
  for (const [sp, a] of Object.entries(sourceMainAvatars(source)))
    profileImages[sp] = logAvatars[a] ?? a;
  for (const [sp, u] of Object.entries(c.uploads ?? {}))
    profileImages[sp] =
      u.kind === 'external' ? u.url : await processAvatar(u.data, spec, settings.resizeImages);
  const illustrations: IllustrationItem[] = [];
  for (const it of c.illustrations ?? [])
    illustrations.push({
      ...it,
      fileData: it.data ? await processIllustration(it.data, spec) : '',
    });
  const title =
    source.format === 'legacy'
      ? titleFromFileName(source.fileName)
      : { title: source.merged.roomName ?? '', subtitle: '' };
  const tabs = sourceTabs(source);
  const { tabStylesAll, ...rest } = c.choices;
  const choices: LogChoices = {
    title: title.title,
    subtitle: title.subtitle,
    summary: '',
    narrator: autoNarrator(sourceSpeakers(source)),
    chatTab: autoChatTab(tabsAtLoad),
    nameColors: { ...initialNameColors(source), ...(c.nameColors ?? {}) },
    hiddenTabs: [],
    tabStyles: tabStylesAll ? Object.fromEntries(tabs.map((t) => [t, tabStylesAll])) : {},
    useLogImages: true,
    ...rest,
  };
  const conv = prepareConversion(
    source,
    settings,
    choices,
    { profileImages, messageImages: logAvatars },
    illustrations,
  );
  const result = convertLog(conv.entries, conv.options, conv.rule, conv.fileBase);
  return {
    pages: result.pages,
    blog: result.pages.map((_, i) => blogPage(result, i)),
    fileBase: result.fileBase,
  };
}

declare global {
  interface Window {
    __logConverter?: {
      convertCase: typeof convertCase;
      settings: () => LcSettings;
      session: () => ReturnType<typeof useSession.getState>;
    };
  }
}

export function installTestHook(): void {
  window.__logConverter = {
    convertCase,
    settings: () => useSettings.getState().data,
    session: () => useSession.getState(),
  };
}
