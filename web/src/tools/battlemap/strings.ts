/** 戰鬥地圖產生器的介面文字 */
import type { TerrainId } from './render';

export const S = {
  sectionMap: '地圖',
  terrain: '地形',
  terrainHint: '換地形（包含再按一次目前的地形）會產生一張新的地圖。',
  terrains: {
    dungeon: '石砌地城',
    cave: '洞穴',
    crypt: '墓室',
  } satisfies Record<TerrainId, string>,
  grid: '格線',
  gridHint: '每格 70 px 的半透明格線（含外框）。開關不會換地圖。',
  light: '火光',
  lightHint: '每個房間一團暖色光暈。開關不會換地圖。',
  regenerate: '重新產生',
  exportPng: '匯出 PNG',
  shortcutGroup: '地圖',
  previewLabel: '戰鬥地圖預覽',
  infoLabel: '地圖資訊',
  infoSeed: '種子',
  infoRooms: '房間',
  infoTerrain: '地形',
  roomsUnit: (n: number) => `${n} 間`,
  sizeNote: '1540 × 1120 px（22 × 16 格，每格 70 px）',
  exporting: '正在產生 PNG…',
  exported: (name: string) => `已匯出 ${name}`,
  exportFailed: (message: string) => `匯出失敗：${message}`,
  usage: [
    '開頁就會產生一張地圖。按「重新產生」或 G 鍵換一張；換地形也會換一張新的。',
    '格線與火光可以隨時開關，只會加上或拿掉那一層，地圖本身不變。',
    '按「匯出 PNG」或 D 鍵下載原尺寸 1540 × 1120 px 的 PNG（22 × 16 格、每格 70 px），可以直接當 CCFOLIA 等線上桌面的地圖背景。',
    '檔名包含地形與種子，方便日後辨認是哪一張。',
    '這個工具不保存設定：重新整理頁面會回到預設（石砌地城、格線與火光開啟）並產生新的地圖。',
  ],
} as const;
