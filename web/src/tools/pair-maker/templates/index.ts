/** 版型清單（一覽的順序） */
import type { TemplateDef } from '../model';
import { banner } from './banner';
import { duoSheet } from './duoSheet';
import { duoTheme } from './duoTheme';
import { post } from './post';
import { roster } from './roster';
import { logBand, logDuo, logPlain, logSide } from './textlog';

export const TEMPLATES: readonly TemplateDef[] = [
  duoSheet,
  duoTheme,
  banner,
  roster,
  post,
  logPlain,
  logBand,
  logSide,
  logDuo,
];

export const templateById = (id: string | null | undefined): TemplateDef | null =>
  TEMPLATES.find((t) => t.id === id) ?? null;
