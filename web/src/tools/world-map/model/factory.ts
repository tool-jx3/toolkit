/**
 * 新的地圖與各種物件的預設值。
 */
import { blankCells } from './terrain';
import {
  DEFAULT_COLS,
  DEFAULT_ROWS,
  type MapObject,
  type MapPath,
  type MapSettings,
  type Note,
  type PathKind,
  type Pt,
  pathWidthDefault,
  RANGES,
  type Region,
  type WorldDoc,
} from './types';

export function uid(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID().replace(/-/g, '').slice(0, 12);
  return `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** 新的國・地域依序換的顏色（本站的配色） */
export const REGION_COLORS = ['#b4664f', '#5f8f8a', '#c39b4a', '#8b78a8', '#6d9157', '#a8687e'];

export const DEFAULT_TITLE = '無名的世界';
export const DEFAULT_SUBTITLE = '世界地圖';

export const defaultSettings = (): MapSettings => ({
  frame: true,
  names: true,
  details: true,
  borders: true,
  grid: false,
  gridType: 'square',
  font: 'serif',
  kmPer100: RANGES.kmPer100.def,
  subtitle: DEFAULT_SUBTITLE,
});

/** 一片海的空白地圖 */
export function blankDoc(cols = DEFAULT_COLS, rows = DEFAULT_ROWS): WorldDoc {
  return {
    title: DEFAULT_TITLE,
    seed: 701,
    theme: 'parchment',
    drawMode: 'grid',
    cols,
    rows,
    terrain: blankCells(cols * rows),
    ground: blankCells(cols * rows),
    regions: [],
    objects: [],
    paths: [],
    notes: [],
    settings: defaultSettings(),
  };
}

export function newObject(kind: string, x: number, y: number, makeId = uid): MapObject {
  return {
    id: makeId(),
    kind,
    x,
    y,
    size: RANGES.objectSize.def,
    rotation: 0,
    flip: false,
    dock: 'auto',
    name: '',
    secret: false,
    labelDx: 0,
    labelDy: RANGES.labelDy,
  };
}

export function newRegion(name: string, color: string, points: Pt[], makeId = uid): Region {
  return {
    id: makeId(),
    name,
    color,
    points: points.map((p) => ({ x: p.x, y: p.y })),
    opacity: RANGES.opacity.def,
    wall: false,
    font: 'auto',
    curve: 0,
    labelSize: RANGES.regionLabel.def,
    labelDx: 0,
    labelDy: 0,
  };
}

export function newPath(kind: PathKind, points: Pt[], makeId = uid): MapPath {
  return {
    id: makeId(),
    kind,
    name: '',
    points: points.map((p) => ({ x: p.x, y: p.y })),
    width: pathWidthDefault(kind),
    smooth: kind !== 'wall',
    secret: false,
  };
}

export function newNote(text: string, x: number, y: number, makeId = uid): Note {
  return {
    id: makeId(),
    text,
    x,
    y,
    size: RANGES.noteSize.def,
    rotation: 0,
    font: 'auto',
    curve: 0,
    secret: false,
  };
}

export const mapWidth = (d: Pick<WorldDoc, 'cols'>): number => d.cols * 12;
export const mapHeight = (d: Pick<WorldDoc, 'rows'>): number => d.rows * 12;
