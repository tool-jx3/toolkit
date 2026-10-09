/**
 * 比較用的檔案：本工具的專案檔（ZIP 或 JSON）與原作的資料備份 JSON 都可以；每個檔案是一個人。
 * 讀不了的檔案列在 failed（不中斷其他檔案）。
 */
import { readAsBytes } from '@/core/files';
import { dataUriToBlob, loadImage } from '@/core/image';
import { parseProjectBytes } from '@/core/storage';
import type { ComparePerson } from './compare';
import { fromLegacyBackup, isLegacyBackup } from './legacy';
import { normalizeState } from './model';
import { assets, TOOL_ID } from './store';

async function decode(blob: Blob): Promise<ImageBitmap | null> {
  try {
    return await loadImage(blob);
  } catch {
    return null;
  }
}

/** 一個檔案 → 一個人（看不懂時 null） */
export async function readComparePerson(file: File): Promise<ComparePerson | null> {
  let bytes: Uint8Array;
  try {
    bytes = await readAsBytes(file);
  } catch {
    return null;
  }
  /* 本工具的專案檔 */
  try {
    const project = parseProjectBytes(bytes, TOOL_ID);
    const d = normalizeState(project.data);
    let avatar: ImageBitmap | null = null;
    const ref = d.profile.image;
    if (ref) {
      const hit = [...project.files].find(([name]) => name.replace(/\.[^.]+$/, '') === ref.id);
      avatar = hit
        ? await decode(new Blob([hit[1] as Uint8Array<ArrayBuffer>]))
        : ((await assets.bitmap(ref.id).catch(() => undefined)) ?? null);
    }
    return {
      file: file.name,
      name: d.profile.name,
      handle: d.profile.handle,
      avatar,
      cells: d.cells,
    };
  } catch {
    /* 不是本工具的專案檔：試試原作的備份 */
  }
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes).replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
  if (!isLegacyBackup(raw)) return null;
  const b = fromLegacyBackup(raw);
  let avatar: ImageBitmap | null = null;
  if (b.profile.image) {
    try {
      avatar = await decode(dataUriToBlob(b.profile.image));
    } catch {
      avatar = null;
    }
  }
  return {
    file: file.name,
    name: b.profile.name,
    handle: b.profile.handle,
    avatar,
    cells: b.cells,
  };
}

export async function readComparePeople(
  files: readonly File[],
): Promise<{ people: ComparePerson[]; failed: string[] }> {
  const people: ComparePerson[] = [];
  const failed: string[] = [];
  for (const f of files) {
    const p = await readComparePerson(f);
    if (p) people.push(p);
    else failed.push(f.name);
  }
  return { people, failed };
}
