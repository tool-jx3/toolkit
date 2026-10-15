/**
 * 字型：內建的繁中字型（model.ts 的 FONT_CHOICES）＋使用者自己加的字型（core/fonts 的字型庫：存在 IndexedDB、
 * 本站的工具共用、下次打開自動恢復）。字型下拉選單、本文工具列的「選取文字的字型」都用這份清單。
 */
import { useCallback, useEffect, useState } from 'react';
import {
  listUploadedFonts,
  registerUploadedFonts,
  removeUploadedFont,
  type UploadedFont,
  uploadFont,
} from '@/core/fonts';
import { DEFAULT_FONT, FONT_CHOICES, FONT_MAX_MB } from './model';
import { docNow, edit } from './store';
import { S } from './strings';

export interface FontOption {
  value: string;
  label: string;
  /** 使用者自己加的字型 */
  uploaded?: UploadedFont;
}

/** 字型選項：內建在前、自己加的在後 */
export function fontOptions(uploaded: readonly UploadedFont[]): FontOption[] {
  const seen = new Set<string>();
  const out: FontOption[] = [];
  for (const c of FONT_CHOICES) {
    seen.add(c.font.family);
    out.push({ value: c.font.family, label: c.label });
  }
  for (const u of uploaded) {
    if (seen.has(u.family)) continue;
    seen.add(u.family);
    out.push({ value: u.family, label: S.myFont(u.family), uploaded: u });
  }
  return out;
}

let cache: UploadedFont[] = [];
const listeners = new Set<(list: UploadedFont[]) => void>();

async function refresh(): Promise<UploadedFont[]> {
  await registerUploadedFonts().catch(() => []);
  cache = await listUploadedFonts();
  for (const l of listeners) l(cache);
  return cache;
}

/** 自己加的字型（開頁時從字型庫恢復；加入、刪除後更新） */
export function useUploadedFonts(): {
  list: UploadedFont[];
  refresh: () => Promise<UploadedFont[]>;
} {
  const [list, setList] = useState<UploadedFont[]>(cache);
  useEffect(() => {
    listeners.add(setList);
    void refresh();
    return () => {
      listeners.delete(setList);
    };
  }, []);
  return { list, refresh: useCallback(() => refresh(), []) };
}

export class FontFileError extends Error {}

/** 加入字型檔（大小上限 40 MB）；回傳字型的名稱 */
export async function addFontFile(file: File): Promise<string> {
  if (file.size > FONT_MAX_MB * 1024 * 1024) throw new FontFileError(S.fontTooBig(FONT_MAX_MB));
  let meta: UploadedFont;
  try {
    meta = await uploadFont(file);
  } catch {
    throw new FontFileError(S.fontFailed);
  }
  await refresh();
  return meta.family;
}

/** 刪除自己加的字型；整份的字型用到它時改回預設字型（選取文字用到的照舊，畫的時候用備用字型） */
export async function removeFont(font: UploadedFont): Promise<void> {
  await removeUploadedFont(font.id);
  if (docNow().font === font.family)
    edit((d) => {
      d.font = DEFAULT_FONT;
    });
  await refresh();
}
