/**
 * 一個人的切入要畫的東西（預覽與匯出共用）：型、樣式解出來的顏色與文字、立繪與臉的位置（Crew）。
 * - 主色：演員有代表色時用它；VS 右側的色：對手有代表色時用它。
 * - 背景色上的文字色：背景色亮時用深色、暗時用白色（`@/core/color` 的對比規則）。
 * - 還沒有演員時用示意人形與範例文字（只在預覽出現；不能匯出）。
 * - VS：選到的人剛好是對手時，預覽改用清單上第一個不是對手的人（匯出則不允許，見 names.ts）。
 */
import { readableTextColor } from '@/core/color';
import { type Actor, type CutKind, type Doc, graphemes, rivalActor } from './model';
import { type Crew, mysteryOf, type Performer, STAND_IN_FACE, standIn, whiteOf } from './paint';
import type { SceneInput } from './scenes';
import { S } from './strings';

type Pic = Performer['image'];

export interface Shot {
  kind: CutKind;
  /** 速度（倍） */
  pace: number;
  input: Omit<SceneInput, 't'>;
  crew: Crew;
  /** 用到的文字（載入字型時只載這些字） */
  texts: { name: string; quote: string; impact: string; badge: string };
}

/** 背景色上的文字色 */
export const inkOn = (base: string): string =>
  readableTextColor(base) === '#000000' ? '#1b1822' : '#ffffff';

function performer(a: Actor, img: Pic, zoom: number): Performer {
  return {
    image: img,
    eyeX: a.eyeX,
    eyeY: a.eyeY,
    headLen: a.headLen,
    size: (a.scale / 100) * (zoom / 100),
    white: whiteOf(img),
  };
}

/**
 * 組出 hero（null＝示意人形）的切入。VS 的對手由 doc 決定（對手是 hero 自己時改用謎之剪影）。
 * bitmaps：資產 id → 解碼好的圖；找不到的人不畫立繪（文字照畫）。
 */
export function shotOf(
  d: Pick<Doc, 'kind' | 'styles' | 'actors' | 'rival' | 'mysteryName' | 'impactText'>,
  hero: Actor | null,
  bitmaps: ReadonlyMap<string, Pic>,
): Shot {
  const kind = d.kind;
  const style = d.styles[kind];
  const versus = kind === 'versus';
  const foe = versus ? rivalActor(d) : null;
  const rival = foe && hero && foe.id !== hero.id ? foe : null;
  const heroImg = hero ? bitmaps.get(hero.image) : standIn();
  const heroP: Performer | null = hero
    ? heroImg
      ? performer(hero, heroImg, style.zoom)
      : null
    : {
        image: standIn(),
        ...STAND_IN_FACE,
        size: style.zoom / 100,
        white: whiteOf(standIn()),
      };
  const rivalImg = rival ? bitmaps.get(rival.image) : undefined;
  const rivalP: Performer | null = !versus
    ? null
    : rival
      ? rivalImg
        ? performer(rival, rivalImg, style.zoom)
        : null
      : heroP
        ? mysteryOf(heroP)
        : null;
  const name = hero ? hero.name : S.sample.name;
  const tag = hero ? hero.tag : S.sample.tag;
  const quote = hero ? hero.quote : S.sample.quote;
  const rivalName = versus ? (rival ? rival.name : d.mysteryName) : '';
  return {
    kind,
    pace: style.pace,
    input: {
      main: hero?.color ?? style.main,
      base: style.base,
      right: (versus && rival?.color) || style.right,
      ink: inkOn(style.base),
      name,
      tag,
      quote,
      rivalName,
      impactText: kind === 'impact' ? graphemes(d.impactText) : [],
      impact: style.impact,
    },
    crew: {
      hero: heroP,
      rival: rivalP,
      fonts: { name: style.nameFont, quote: style.quoteFont, impact: style.impactFont },
    },
    texts: {
      name: `${name}${rivalName}`,
      quote,
      impact: kind === 'impact' ? d.impactText : '',
      badge: `${tag}${versus ? 'VS' : ''}`,
    },
  };
}

/** 預覽的主角：選取的人（VS 時選到對手就改用第一個不是對手的人）；沒有演員時 null（示意人形） */
export function previewHero(
  d: Pick<Doc, 'actors' | 'kind' | 'rival'>,
  selected: string | null,
): Actor | null {
  const pick = d.actors.find((a) => a.id === selected) ?? d.actors[0] ?? null;
  if (!pick) return null;
  if (d.kind === 'versus' && d.rival === pick.id)
    return d.actors.find((a) => a.id !== d.rival) ?? null;
  return pick;
}
