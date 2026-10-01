/**
 * 專案檔（存成 JSON 檔、開啟）。ProjectMenu 使用；工具也可以直接呼叫。
 *
 * 檔案格式：
 * { "format": "trpg-toolkit-project", "tool": "<id>", "version": 1, "savedAt": "<ISO 時間>", "data": { …工具自己的資料… } }
 *
 * 要夾帶圖片時存成 ZIP：`project.json`（同上）＋ `files/<名稱>`（serializeProjectZip／parseProjectBytes）。
 */
import { strFromU8, strToU8, unzipSync, type Zippable, zipSync } from 'fflate';

export const PROJECT_FORMAT = 'trpg-toolkit-project';

export interface ProjectFile<T = unknown> {
  format: typeof PROJECT_FORMAT;
  tool: string;
  version: number;
  savedAt: string;
  data: T;
}

export function createProjectFile<T>(
  tool: string,
  version: number,
  data: T,
  now = new Date(),
): ProjectFile<T> {
  return { format: PROJECT_FORMAT, tool, version, savedAt: now.toISOString(), data };
}

export function serializeProject<T>(tool: string, version: number, data: T, now?: Date): string {
  return JSON.stringify(createProjectFile(tool, version, data, now), null, 2);
}

export class ProjectFileError extends Error {
  override name = 'ProjectFileError';
}

/** 解析專案檔；格式不對或不是這個工具的檔案時丟出 ProjectFileError（訊息可直接顯示給使用者） */
export function parseProject<T = unknown>(text: string, tool: string): ProjectFile<T> {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new ProjectFileError('這不是有效的專案檔（JSON 格式錯誤）。');
  }
  const p = obj as Partial<ProjectFile<T>>;
  if (!p || typeof p !== 'object' || p.format !== PROJECT_FORMAT || typeof p.tool !== 'string') {
    throw new ProjectFileError('這不是 TRPG Toolkit 的專案檔。');
  }
  if (p.tool !== tool) {
    throw new ProjectFileError(`這是其他工具（${p.tool}）的專案檔，無法在這裡開啟。`);
  }
  if (!('data' in p)) throw new ProjectFileError('專案檔缺少資料。');
  return {
    format: PROJECT_FORMAT,
    tool: p.tool,
    version: Number(p.version) || 1,
    savedAt: String(p.savedAt ?? ''),
    data: p.data as T,
  };
}

/* ---------- 夾帶二進位檔的專案檔（ZIP） ---------- */

/** ZIP 專案檔裡設定 JSON 的檔名 */
export const PROJECT_JSON_NAME = 'project.json';
/** ZIP 專案檔裡附加檔案的資料夾 */
export const PROJECT_FILES_DIR = 'files/';

export interface ProjectBinary {
  /** 附加檔案的名稱（放在 files/ 底下；可含子資料夾，例如 `images/abc.png`） */
  name: string;
  data: Uint8Array | string;
}

/** 檔案開頭是不是 ZIP（PK\x03\x04；空的 ZIP 是 PK\x05\x06） */
export function isZipBytes(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    ((bytes[2] === 0x03 && bytes[3] === 0x04) || (bytes[2] === 0x05 && bytes[3] === 0x06))
  );
}

/**
 * 專案檔（ZIP）：`project.json`（內容與 JSON 專案檔相同）＋ `files/<名稱>`（圖片等二進位檔）。
 * 圖片本身已壓縮，所以附加檔案只打包不壓縮；`now` 固定時輸出逐位元組相同。
 */
export function serializeProjectZip<T>(
  tool: string,
  version: number,
  data: T,
  files: readonly ProjectBinary[] = [],
  now = new Date(),
): Uint8Array<ArrayBuffer> {
  const tree: Zippable = {
    [PROJECT_JSON_NAME]: [
      strToU8(serializeProject(tool, version, data, now)),
      { level: 6, mtime: now },
    ],
  };
  for (const f of files) {
    const name = `${PROJECT_FILES_DIR}${f.name.replace(/^\/+/, '')}`;
    if (!f.name || name in tree)
      throw new ProjectFileError(`專案檔裡有重複或空白的檔名：${f.name}`);
    tree[name] = [typeof f.data === 'string' ? strToU8(f.data) : f.data, { level: 0, mtime: now }];
  }
  return zipSync(tree) as Uint8Array<ArrayBuffer>;
}

export interface ParsedProject<T> extends ProjectFile<T> {
  /** ZIP 專案檔附帶的檔案（去掉 files/ 前綴的名稱 → 位元組）；JSON 專案檔是空的 */
  files: Map<string, Uint8Array>;
  /** 讀到的是哪一種 */
  container: 'json' | 'zip';
}

/**
 * 讀專案檔：自動分辨 JSON 或 ZIP（看檔頭，不看副檔名）。錯誤丟 ProjectFileError（訊息可直接顯示）。
 * ```ts
 * const p = parseProjectBytes<BoardData>(await readAsBytes(file), 'height-board');
 * await importAssetFiles(assets, p.files);
 * ```
 */
export function parseProjectBytes<T = unknown>(bytes: Uint8Array, tool: string): ParsedProject<T> {
  if (!isZipBytes(bytes)) {
    const text = strFromU8(bytes).replace(/^﻿/, '');
    return { ...parseProject<T>(text, tool), files: new Map(), container: 'json' };
  }
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new ProjectFileError('這不是有效的專案檔（ZIP 已損壞）。');
  }
  const json = entries[PROJECT_JSON_NAME];
  if (!json) throw new ProjectFileError('這不是 TRPG Toolkit 的專案檔（找不到 project.json）。');
  const project = parseProject<T>(strFromU8(json).replace(/^﻿/, ''), tool);
  const files = new Map<string, Uint8Array>();
  for (const [name, data] of Object.entries(entries)) {
    if (name.endsWith('/') || !name.startsWith(PROJECT_FILES_DIR)) continue;
    files.set(name.slice(PROJECT_FILES_DIR.length), data);
  }
  return { ...project, files, container: 'zip' };
}
