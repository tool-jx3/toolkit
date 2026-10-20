/**
 * 圖片切換模式的專案檔（共用專案檔格式的 ZIP：project.json＋files/<圖片 id>.<副檔名>，規格 3.11.10）。
 * 讀入時先整理內容（normalizeDeck），圖片要在 ZIP 裡（或這個瀏覽器已經有）而且能解碼，才換掉目前的內容。
 */
import { importAssetFiles } from '@/core/assets';
import { type DeckState, deckAssetIds, normalizeDeck } from './deck';
import { assets } from './deckStore';
import { DECK } from './strings';

export class ProjectDataError extends Error {}

export interface ImportedDeck {
  state: DeckState;
  /** 有圖存不進瀏覽器（這次可以用，重新整理之後就沒了） */
  notSaved: boolean;
}

export async function importDeckProject(
  data: unknown,
  files: Map<string, Uint8Array>,
): Promise<ImportedDeck> {
  if (typeof data !== 'object' || data === null || Array.isArray(data))
    throw new ProjectDataError(DECK.projectBad);
  const next = normalizeDeck(data);
  const imported = await importAssetFiles(assets, files.entries());
  for (const id of deckAssetIds(next)) {
    const bmp = await assets.bitmap(id).catch(() => undefined);
    if (!bmp) throw new ProjectDataError(DECK.projectMissingImage);
  }
  return { state: next, notSaved: imported.notPersisted > 0 };
}
