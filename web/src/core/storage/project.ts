/**
 * 專案檔（存成 JSON 檔、開啟）。ProjectMenu 使用；工具也可以直接呼叫。
 *
 * 檔案格式：
 * { "format": "trpg-toolkit-project", "tool": "<id>", "version": 1, "savedAt": "<ISO 時間>", "data": { …工具自己的資料… } }
 */

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
