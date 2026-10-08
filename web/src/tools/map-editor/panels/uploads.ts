/**
 * 自訂圖樣、自訂裝飾的新增與刪除（F113、F126）：跟著地圖儲存（useMapPrefs）。
 */
import { pickFiles } from '@/core/files';
import {
  AssetError,
  readUserDecor,
  readUserPattern,
  USER_ASSET_ACCEPT,
  USER_ASSET_MAX_BYTES,
} from '../assets';
import { forgetDecor } from '../engine/decor';
import { forgetPattern } from '../engine/patterns';
import type { UserDecor, UserPattern } from '../model';
import { flashStatus, setMapPrefs, useMapPrefs } from '../stores';
import { S } from '../strings';

const MB = USER_ASSET_MAX_BYTES / 1024 / 1024;

export async function addPatternFiles(files: readonly File[]): Promise<UserPattern[]> {
  const added: UserPattern[] = [];
  for (const f of files) {
    try {
      added.push(await readUserPattern(f, S.pattern.defaultName));
    } catch (e) {
      flashStatus(
        e instanceof AssetError && e.code === 'too-large'
          ? S.upload.tooLarge(MB)
          : S.pattern.loadFailed,
      );
    }
  }
  if (added.length)
    setMapPrefs({ userPatterns: [...useMapPrefs.getState().userPatterns, ...added] });
  return added;
}

export async function uploadPatterns(): Promise<UserPattern[]> {
  const files = await pickFiles({ accept: USER_ASSET_ACCEPT, multiple: true });
  return files.length ? addPatternFiles(files) : [];
}

export function removeUserPattern(id: string): void {
  const mp = useMapPrefs.getState();
  const patch: Parameters<typeof setMapPrefs>[0] = {
    userPatterns: mp.userPatterns.filter((p) => p.id !== id),
  };
  if (mp.groundPattern.id === id)
    patch.groundPattern = { ...mp.groundPattern, mode: 'solid', id: null };
  if (mp.wallPattern.id === id) patch.wallPattern = { ...mp.wallPattern, mode: 'solid', id: null };
  forgetPattern(id);
  setMapPrefs(patch);
}

export async function addDecorFiles(files: readonly File[]): Promise<UserDecor[]> {
  const added: UserDecor[] = [];
  for (const f of files) {
    try {
      added.push(await readUserDecor(f, S.decor.defaultName));
    } catch (e) {
      flashStatus(
        e instanceof AssetError && e.code === 'too-large'
          ? S.upload.tooLarge(MB)
          : S.decor.loadFailed,
      );
    }
  }
  if (added.length) setMapPrefs({ userDecors: [...useMapPrefs.getState().userDecors, ...added] });
  return added;
}

export async function uploadDecors(): Promise<UserDecor[]> {
  const files = await pickFiles({ accept: USER_ASSET_ACCEPT, multiple: true });
  return files.length ? addDecorFiles(files) : [];
}

export function removeUserDecor(id: string): void {
  const mp = useMapPrefs.getState();
  const patch: Parameters<typeof setMapPrefs>[0] = {
    userDecors: mp.userDecors.filter((d) => d.id !== id),
  };
  if (mp.decorId === id) patch.decorId = null;
  forgetDecor(id);
  setMapPrefs(patch);
}
