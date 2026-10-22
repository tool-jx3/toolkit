/**
 * 範本的標籤（2026-10 第三批，原作 v1.13 的範本標籤搜尋；規格 F235）：範本對話框的搜尋欄可以打 `#標籤`。
 * 標籤和家具共用（model/tags.ts）。`gm`＝有手放的 GM 專用房間（密室、暗門後面的房間）；
 * `multifloor`＝兩層以上。每個範本都要有（單元測試檢查）。
 */
import type { TagId } from '../model/tags';

export const TEMPLATE_TAGS: Readonly<Record<string, readonly TagId[]>> = {
  studio: ['modern', 'indoor', 'home'],
  townhouse: ['modern', 'indoor', 'home', 'religious', 'multifloor'],
  mansion: ['retro', 'indoor', 'home', 'underground', 'hidden', 'gm', 'multifloor', 'large'],
  lodge: ['modern', 'home', 'wild', 'outdoor', 'multifloor'],
  hotel: ['modern', 'indoor', 'public', 'shop', 'multifloor'],
  hospital: ['modern', 'indoor', 'medical', 'public', 'multifloor', 'large'],
  school: ['modern', 'indoor', 'school', 'public', 'rooftop', 'multifloor', 'large'],
  police: ['modern', 'indoor', 'public', 'military'],
  library: ['modern', 'indoor', 'public', 'underground', 'hidden', 'gm', 'multifloor'],
  temple: ['historic', 'outdoor', 'religious', 'public'],
  cave: ['wild', 'underground', 'hidden', 'gm', 'danger'],
  cult: ['modern', 'underground', 'religious', 'horror', 'hidden', 'gm', 'multifloor'],
  'abandoned-hospital': [
    'ruins',
    'horror',
    'medical',
    'underground',
    'damaged',
    'gm',
    'multifloor',
    'large',
  ],
  'ruined-house': ['ruins', 'horror', 'home', 'damaged', 'multifloor'],
  crime: ['modern', 'indoor', 'home', 'evidence', 'danger'],
};

export const templateTags = (id: string): readonly TagId[] => TEMPLATE_TAGS[id] ?? [];
