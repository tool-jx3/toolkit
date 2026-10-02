/**
 * 房間 ZIP 產生器（room-zip）：工具資料 → `__data.json`，以附件 room-zip.examples.json 的 Z01～Z11 逐值比對。
 * 用介面同一套操作函式（actions.ts、scenes.ts）重現附件的操作序列；ID 與圖片檔名換成附件的代稱後，
 * entities 的全部欄位與值必須相同（playTime 除外；物件的鍵順序不比）。
 * 刻意差異：Z07 的棋子差分依第 7 節裁定 D1 改成 { label, iconUrl }（附件是舊版的 { name, imageUrl }）。
 * 另含 ZIP 組裝與自我檢查（F281）、檔案集合（3.6）。
 */
import { describe, expect, it } from 'vitest';
import { buildRoomZip, checkRoomZip, ROOM_TOKEN_RE, type RoomImageFile } from '@/ccfolia';
import { unzipFiles } from '@/core/files';
import {
  addCutin,
  addEffect,
  addPart,
  addPiece,
  addPieceFace,
  addScene,
  assignCutin,
  autoRoomBackground,
  type Ctx,
  createFromMaterials,
  createTachieFace,
  ctxOf,
  finalize,
  layoutScene,
  setOverride,
  setTachieAppear,
  setTachieFace,
  updateEffect,
  updatePart,
} from '@/tools/room-zip/actions';
import { applyKpPiece, buildKpCommands, buildRoomData } from '@/tools/room-zip/exportRoom';
import { guessTag } from '@/tools/room-zip/materials';
import {
  createPiece,
  createProject,
  createToolSettings,
  KP_TEXT,
  type Material,
  type Project,
  type ToolSettings,
} from '@/tools/room-zip/model';
import {
  applyTemplate,
  clipFromScene,
  parseBulkScenes,
  pasteClip,
  syncSceneToRoom,
  templateFromScene,
} from '@/tools/room-zip/scenes';
import RZ from '../../../docs/refactor/specs/room-zip.examples.json';

type Json = Record<string, unknown>;
interface Scenario {
  data: { entities: Record<string, Json>; meta: Json; resources: Json };
  zip: { images: { ref: string; sha256: string; ext: string }[] };
}
const scenario = (id: string) =>
  (RZ as unknown as { scenarios: Record<string, Scenario> }).scenarios[id];

/* ---------- 測試圖（附件 testImages；處理後的格式、尺寸與雜湊取自各組的 zip.images） ---------- */

interface Img {
  label: string;
  sha: string;
  ext: string;
  mime: string;
  width: number;
  height: number;
  animated?: boolean;
}
const MIME: Record<string, string> = {
  webp: 'image/webp',
  png: 'image/png',
  gif: 'image/gif',
  jpeg: 'image/jpeg',
};
const img = (
  label: string,
  sha: string,
  ext: string,
  width: number,
  height: number,
  animated = false,
): Img => ({
  label,
  sha,
  ext,
  mime: MIME[ext],
  width,
  height,
  animated,
});

const T = {
  T1: img(
    't1_wide_1600x900',
    'e76a0072002a04d6620846ae2226e979defa1f68195d0c48d79e8f1f9fe00f30',
    'webp',
    1200,
    675,
  ),
  T1_800: img(
    't1_wide_1600x900',
    'dc8d85e059a818832ed0f743a88106776124fd28a1cad64c8beb13df8326e5c3',
    'webp',
    800,
    450,
  ),
  T2: img(
    't2_band_1200x400',
    '5252ced9c9be6bd4ed1267fb02e3174330a393f0829e69c168d0bf9d2d282b91',
    'png',
    1200,
    400,
  ),
  T3: img(
    't3_square_256',
    'ba2b32915edf68562bbdcd87f58956cbc2ba7fe57176a10a831cd80926e7ada0',
    'png',
    256,
    256,
  ),
  T4: img(
    't4_tall_600x1200',
    '23d231d729c6cca5d6bb686d1f2cf14f428f24443319f138572eb0c50ef7b95e',
    'webp',
    600,
    1200,
  ),
  T5: img(
    't5_portrait_400x600',
    '733fff9d9054d692a3150cc68b5948a758857d06b76963f3198c3402ec0f7ac3',
    'png',
    400,
    600,
  ),
  T6: img(
    't6_other_900x800',
    'f1a33562ebea9d7210baa83a66f15b4ad842c95336a13c887ec3e51ccd69989b',
    'webp',
    900,
    800,
  ),
  T6_PNG: img(
    't6_other_900x800',
    '9c18a1aa37bf68ac5a71d991caa1bbe22ddc9ddc2c78bb79f15126ffde95238f',
    'png',
    900,
    800,
  ),
  T7: img(
    't7_anim_64',
    '0ce46561d1fcf7eb8f8197061df3ddda53b35c5a615e744cbfe5b5308ca43db9',
    'gif',
    64,
    64,
    true,
  ),
  T8: img(
    't8_anim_80',
    '3edf6f6fc5d7f00040213003a3120fce85848dec3e9dc81d5284cb2f4b154ece',
    'png',
    80,
    80,
    true,
  ),
  T9: img(
    't9_photo_320x240',
    '9f3f6ac205bc00a36bc2615f74d68fa5a6c765bc9bc34e63a0e5edf691048756',
    'webp',
    320,
    240,
  ),
  T9_JPEG: img(
    't9_photo_320x240',
    '3b3f8d1bc8d5493594d0769d48e36ffa9a5168753f1cb9a771b02382913820a8',
    'jpeg',
    320,
    240,
  ),
  T10: img(
    't10_tall2_600x1200',
    '161bc753accb3e90e2980f75e61999011f2c1ce5374a838c077f545e6814db05',
    'webp',
    600,
    1200,
  ),
};

const fileName = (i: Img) => `${i.sha}.${i.ext}`;

function material(i: Img): Material {
  return {
    name: fileName(i),
    label: i.label,
    tags: [i.animated ? 'effect' : guessTag(i.width, i.height)],
    animated: !!i.animated,
    originalName: `${i.label}.${i.ext}`,
    mime: i.mime,
    before: 1000,
    after: 1000,
    width: i.width,
    height: i.height,
  };
}

/* ---------- 情境 ---------- */

class World {
  p: Project = createProject();
  tool: ToolSettings = createToolSettings();
  /** 工具內的 id → 附件的代稱 */
  alias = new Map<string, string>();
  ctx(): Ctx {
    return ctxOf(this.p, this.tool);
  }
  /** 匯入（處理後的結果）；結束時房間背景是空的就自動設定（F043） */
  load(...imgs: Img[]) {
    for (const i of imgs)
      if (!this.p.materials.some((m) => m.name === fileName(i))) this.p.materials.push(material(i));
    autoRoomBackground(this.p);
  }
  name(id: string, alias: string) {
    this.alias.set(id, alias);
  }
  done() {
    finalize(this.p, this.ctx());
  }
  data() {
    return buildRoomData(this.p, { find: this.ctx().find, settings: this.tool, now: 0 });
  }
}

/** 把輸出換成附件的代稱：圖片檔名 → img:<名稱>.<副檔名>；entities 的 ID → 代稱；playTime 換成附件的文字 */
function normalize(w: World, data: ReturnType<World['data']>, sc: Scenario) {
  const refs = new Map(sc.zip.images.map((x) => [`${x.sha256}.${x.ext}`, x.ref]));
  const json = JSON.stringify(data, (_k, v) => {
    if (typeof v === 'string') {
      if (refs.has(v)) return refs.get(v);
      if (w.alias.has(v)) return w.alias.get(v);
    }
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const out: Json = {};
      for (const [k, x] of Object.entries(v as Json)) out[w.alias.get(k) ?? k] = x;
      if ('playTime' in out) out.playTime = '<匯出時刻（毫秒）>';
      return out;
    }
    return v;
  });
  return JSON.parse(json);
}

function expectScenario(id: string, w: World) {
  w.done();
  const sc = scenario(id);
  const out = normalize(w, w.data(), sc);
  expect(out.meta).toEqual(sc.data.meta);
  expect(out.entities).toEqual(sc.data.entities);
}

/** 代稱：每次建立後依附件規則命名 */
const sceneAlias = (w: World, id: string, name: string) => w.name(id, `場景:${name}`);

describe('room-zip：附件 Z01～Z11 的 __data.json', () => {
  it('Z01 最少操作：一張前景做一個場景（背景自動設成第一張前景素材）', () => {
    const w = new World();
    w.load(T.T1, T.T3);
    const [sid] = createFromMaterials(w.p, 'scene', [fileName(T.T1)], w.ctx());
    sceneAlias(w, sid, 't1_wide_1600x900');
    expectScenario('Z01', w);
  });

  it('Z02 背景模式、前景尺寸、自動裁切、格線、切換文字', () => {
    const w = new World();
    w.load(T.T1, T.T6, T.T9);
    w.p.room.backgroundUrl = fileName(T.T6);
    w.p.room.foregroundUrl = fileName(T.T9);
    w.p.room.fieldWidth = 37;
    w.p.room.fieldHeight = 17;
    const s1 = addScene(w.p, '場景一', fileName(T.T1));
    const s2 = addScene(w.p, '場景二', null);
    s2.backgroundMode = 'foreground';
    const s3 = addScene(w.p, '場景三', fileName(T.T1));
    s3.backgroundMode = 'image';
    s3.backgroundUrl = fileName(T.T9);
    const s4 = addScene(w.p, '場景四', fileName(T.T1));
    s4.backgroundMode = 'none';
    const s5 = addScene(w.p, '場景五', fileName(T.T1));
    s5.fieldWidth = 30;
    s5.fieldHeight = 20;
    s5.autoCrop = false;
    s5.displayGrid = true;
    s1.text = '第一行\n第二行';
    for (const s of [s1, s2, s3, s4, s5]) sceneAlias(w, s.id, s.name);
    expectScenario('Z02', w);
  });

  it('Z03 共用標記、螢幕面板與場景差異（螢幕面板不受場景的徹底隱藏影響）', () => {
    const w = new World();
    w.load(T.T2, T.T5, T.T6);
    const c = w.ctx();
    const band = addPart(w.p, { kind: 'marker' }, c);
    updatePart(w.p, band.id, { imageUrl: fileName(T.T2) }, w.ctx());
    updatePart(w.p, band.id, { name: '橫幅' }, w.ctx());
    updatePart(w.p, band.id, { x: 3 }, w.ctx());
    updatePart(w.p, band.id, { y: -4 }, w.ctx());
    updatePart(w.p, band.id, { width: 12 }, w.ctx());
    const hidden = addPart(w.p, { kind: 'marker', name: '隱藏件' }, w.ctx());
    updatePart(w.p, hidden.id, { imageUrl: fileName(T.T6) }, w.ctx());
    updatePart(w.p, hidden.id, { visible: false }, w.ctx());
    const text = addPart(w.p, { kind: 'marker', name: '純文字' }, w.ctx());
    updatePart(w.p, text.id, { text: '說明' }, w.ctx());
    const panel = addPart(w.p, { kind: 'panel', name: '看板' }, w.ctx());
    updatePart(w.p, panel.id, { imageUrl: fileName(T.T5) }, w.ctx());
    updatePart(w.p, panel.id, { text: '備註' }, w.ctx());
    const a = addScene(w.p, '甲', null);
    const b = addScene(w.p, '乙', null);
    const d = addScene(w.p, '丙', null);
    setOverride(w.p, b.id, band.id, { x: -5 });
    setOverride(w.p, b.id, band.id, { y: 2 });
    setOverride(w.p, d.id, band.id, { hidden: true });
    setOverride(w.p, a.id, band.id, { imageUrl: fileName(T.T6) });
    setOverride(w.p, a.id, band.id, { width: 8, height: 4, z: 25 });
    /* 螢幕面板的「此場景徹底隱藏」只影響預覽（D4），不寫進場景差異 */
    for (const s of [a, b, d]) sceneAlias(w, s.id, s.name);
    w.name(band.id, '共用標記:橫幅');
    w.name(panel.id, '螢幕面板:看板');
    expectScenario('Z03', w);
  });

  it('Z04 立繪庫、表情差分、場景登場與等距排列', () => {
    const w = new World();
    w.load(T.T1, T.T4, T.T10);
    const [t4, t10] = createFromMaterials(
      w.p,
      'tachie',
      [fileName(T.T4), fileName(T.T10)],
      w.ctx(),
    );
    const e4 = w.p.tachie.find((t) => t.id === t4)!;
    e4.character = '甲';
    const face = createTachieFace(w.p, t4)!;
    face.expression = '甲笑';
    face.imageUrl = fileName(T.T10);
    const e10 = w.p.tachie.find((t) => t.id === t10)!;
    e10.character = '乙';
    e10.height = 12;
    e10.dy = 2;
    w.done();
    const [sid] = createFromMaterials(w.p, 'scene', [fileName(T.T1)], w.ctx());
    setTachieAppear(w.p, sid, t4, true, w.ctx());
    setTachieAppear(w.p, sid, t10, true, w.ctx());
    const s2 = addScene(w.p, '第二幕', null);
    setTachieAppear(w.p, s2.id, t4, true, w.ctx());
    const m2 = s2.markers[0];
    setTachieFace(w.p, s2.id, m2.id, face.id, w.ctx());
    w.tool.tachieGap = 2;
    layoutScene(w.p, sid, w.ctx());
    const s1 = w.p.scenes[0];
    sceneAlias(w, s1.id, 't1_wide_1600x900');
    sceneAlias(w, s2.id, '第二幕');
    w.name(s1.markers[0].id, '立繪:t4_tall_600x1200');
    w.name(s1.markers[1].id, '立繪:t10_tall2_600x1200');
    w.name(m2.id, '立繪:甲');
    expectScenario('Z04', w);
  });

  it('Z05 演出（全畫面蓋滿、拉伸、調整大小、只有文字）與空白演出格', () => {
    const w = new World();
    w.load(T.T1, T.T3, T.T6, T.T7);
    const [sid] = createFromMaterials(w.p, 'scene', [fileName(T.T1)], w.ctx());
    const e1 = addEffect(w.p, sid, null, w.ctx())!;
    updateEffect(w.p, sid, e1.id, { imageUrl: fileName(T.T6) }, w.ctx());
    const e2 = addEffect(w.p, sid, null, w.ctx())!;
    updateEffect(w.p, sid, e2.id, { kind: 'free' }, w.ctx());
    updateEffect(w.p, sid, e2.id, { imageUrl: fileName(T.T3) }, w.ctx());
    updateEffect(w.p, sid, e2.id, { x: 8 }, w.ctx());
    updateEffect(w.p, sid, e2.id, { y: -6 }, w.ctx());
    updateEffect(w.p, sid, e2.id, { width: 6 }, w.ctx());
    updateEffect(w.p, sid, e2.id, { z: 12 }, w.ctx());
    const e3 = addEffect(w.p, sid, null, w.ctx())!;
    updateEffect(w.p, sid, e3.id, { imageUrl: fileName(T.T7) }, w.ctx());
    updateEffect(w.p, sid, e3.id, { fullFit: 'stretch' }, w.ctx());
    const e4 = addEffect(w.p, sid, null, w.ctx())!;
    updateEffect(w.p, sid, e4.id, { kind: 'free' }, w.ctx());
    updateEffect(w.p, sid, e4.id, { text: '看這裡' }, w.ctx());
    addEffect(w.p, sid, null, w.ctx());
    w.tool.noimage = true;
    w.tool.noimageCount = 2;
    w.tool.noimageZ = 45;
    sceneAlias(w, sid, 't1_wide_1600x900');
    w.name(e1.id, '演出:〈演出預設名〉');
    w.name(e2.id, '演出:〈演出預設名〉＃2');
    w.name(e3.id, '演出:〈演出預設名〉＃3');
    w.name(e4.id, '演出:〈演出預設名〉＃4');
    let n = 0;
    const out = buildRoomData(w.p, {
      find: w.ctx().find,
      settings: w.tool,
      now: 0,
      newId: () => {
        n++;
        const id = `blank${n}`;
        w.name(id, `空白格:${n}`);
        return id;
      },
    });
    const sc = scenario('Z05');
    expect(normalize(w, out, sc).entities).toEqual(sc.data.entities);
  });

  it('Z06 切入：名稱、無名稱、場景指定與切換時文字', () => {
    const w = new World();
    w.load(T.T1, T.T7, T.T8);
    const [c7, c8] = createFromMaterials(w.p, 'cutin', [fileName(T.T7), fileName(T.T8)], w.ctx());
    w.p.cutins.find((c) => c.id === c8)!.name = '';
    const blank = addCutin(w.p);
    blank.name = '';
    const [sid] = createFromMaterials(w.p, 'scene', [fileName(T.T1)], w.ctx());
    assignCutin(w.p, sid, c7);
    w.p.scenes[0].text = '開場';
    const s2 = addScene(w.p, '第二幕', null);
    const created = assignCutin(w.p, s2.id, 'new')!;
    sceneAlias(w, sid, 't1_wide_1600x900');
    sceneAlias(w, s2.id, '第二幕');
    w.name(c7, '切入:t7_anim_64');
    w.name(c8, '切入:');
    w.name(created.id, '切入:〈場景新建切入的預設名〉');
    w.done();
    const sc = scenario('Z06');
    const out = normalize(w, w.data(), sc);
    /* 預設名換成附件的代稱 */
    const effects = out.entities.effects as Record<string, Json>;
    effects['切入:'].name = String(effects['切入:'].name).replace(
      /^切入(\d+)$/,
      '〈切入預設名〉$1',
    );
    effects['切入:〈場景新建切入的預設名〉'].name = '〈場景新建切入的預設名〉';
    const scenes = out.entities.scenes as Record<string, Json>;
    scenes['場景:第二幕'].text = String(scenes['場景:第二幕'].text).replace(
      created.name,
      '〈場景新建切入的預設名〉',
    );
    expect(out.entities).toEqual(sc.data.entities);
  });

  it('Z07 棋子、敵方與友方 NPC、KP 用棋子（差分依 D1 裁定改成 { label, iconUrl }）', () => {
    const w = new World();
    w.load(T.T3, T.T4, T.T10);
    const s = addScene(w.p, 'S', null);
    w.p.kp.system = 'coc7';
    w.p.kp.checkType = 'CC<=';
    w.p.kp.tpl.coc7 = { main: '', scene: '', memo: '' };
    w.p.kp.pcs = ['阿明', '小華', '阿志'];
    w.p.kp.skills = [{ id: 'k1', name: '聆聽', value: '60' }];
    const shop = addPiece(w.p, 'normal');
    Object.assign(shop, {
      name: '店員',
      iconUrl: fileName(T.T3),
      hp: '10',
      mp: '5',
      commands: '1d100',
      memo: '店員備忘',
    });
    addPieceFace(w.p, shop.id);
    addPieceFace(w.p, shop.id);
    Object.assign(shop.faces[0], { label: '普通', iconUrl: fileName(T.T4) });
    Object.assign(shop.faces[1], { label: '生氣', iconUrl: fileName(T.T10) });
    const wolf = addPiece(w.p, 'enemy');
    Object.assign(wolf, { name: '野狼 A', hp: '15', armor: '2', dodge: '25' });
    Object.assign(wolf.skills[0], { name: '咬', value: '40', damage: '1d6' });
    const pal = addPiece(w.p, 'ally');
    Object.assign(pal, { name: '同伴', noDodge: true });
    applyKpPiece(w.p, () => createPiece('kp'));
    const kp = w.p.pieces[0];
    sceneAlias(w, s.id, 'S');
    w.name(kp.id, '棋子:〈KP 棋子預設名〉');
    w.name(shop.id, '棋子:店員');
    w.name(wolf.id, '棋子:野狼 A');
    w.name(pal.id, '棋子:同伴');
    w.done();
    const sc = scenario('Z07');
    const out = normalize(w, w.data(), sc);
    const chars = out.entities.characters as Record<string, Json>;
    const k = chars['棋子:〈KP 棋子預設名〉'];
    k.name = '〈KP 棋子預設名〉';
    k.commands = String(k.commands)
      .replace(KP_TEXT.pcTitle, '〈PC 區標題〉')
      .replace(KP_TEXT.enemyTitle, '〈敵方區標題〉')
      .replace(KP_TEXT.allyTitle, '〈友方區標題〉')
      .replace(KP_TEXT.enemyMark, '〈敵方標記〉')
      .replace(KP_TEXT.allyMark, '〈友方標記〉')
      .replace(`【${KP_TEXT.damage}】`, '【〈傷害標示〉】')
      .replace(`【${KP_TEXT.dodge}】`, '【〈迴避標示〉】')
      .replace(KP_TEXT.armor, '〈裝甲標示〉');
    /* D1：差分以 CCFOLIA 的 { label, iconUrl } 寫出並收進圖片 */
    expect(chars['棋子:店員'].faces).toEqual([
      { label: '普通', iconUrl: `${T.T4.sha}.webp` },
      { label: '生氣', iconUrl: `${T.T10.sha}.webp` },
    ]);
    const expected = structuredClone(sc.data.entities);
    (expected.characters as Record<string, Json>)['棋子:店員'].faces = chars['棋子:店員'].faces;
    expect(out.entities).toEqual(expected);
  });

  it('Z08 房間輸出設定（BGM 交叉淡化與畫面相反、舊式骰子）與盤面尺寸', () => {
    const w = new World();
    w.p.name = '測試房間';
    w.p.room.fieldWidth = 32;
    w.p.room.fieldHeight = 18;
    w.load(T.T1);
    const [sid] = createFromMaterials(w.p, 'scene', [fileName(T.T1)], w.ctx());
    w.p.room.bgmCrossfade = false;
    w.p.room.legacyDice = true;
    sceneAlias(w, sid, 't1_wide_1600x900');
    expectScenario('Z08', w);
  });

  it('Z09 匯入轉檔後的素材依一覽順序建立場景（處理後的格式、尺寸取自附件）', () => {
    const w = new World();
    w.load(T.T1_800, T.T7, T.T8, T.T9);
    w.load(T.T6_PNG, T.T9_JPEG, T.T7);
    expect(w.p.materials).toHaveLength(6);
    const ids = createFromMaterials(
      w.p,
      'scene',
      w.p.materials.map((m) => m.name),
      w.ctx(),
    );
    const names = [
      't1_wide_1600x900',
      't7_anim_64',
      't8_anim_80',
      't9_photo_320x240',
      't6_other_900x800',
      't9_photo_320x240＃2',
    ];
    ids.forEach((id, i) => {
      sceneAlias(w, id, names[i]);
    });
    expectScenario('Z09', w);
  });

  it('Z10 貼上文字建立多個場景（CSV、Tab、表頭、素材名稱查找）', () => {
    const w = new World();
    w.load(T.T1, T.T6);
    w.p.materials[1].label = '夜景';
    const rows = parseBulkScenes(
      [
        '場景名稱,切換時文字,素材',
        '◇開頭',
        '咖啡廳,"他說：「你好,歡迎」",t1_wide_1600x900',
        '夜晚\t夜深了\t夜景.png',
        '',
        '找不到圖,文字,不存在的素材',
      ].join('\n'),
      w.p.materials,
    );
    for (const r of rows) {
      const s = addScene(w.p, r.name, r.foregroundUrl);
      s.text = r.text;
      sceneAlias(w, s.id, r.name);
    }
    const sc = scenario('Z10');
    w.done();
    const refs = new Map(sc.zip.images.map((x) => [`${x.sha256}.${x.ext}`, x.ref]));
    expect(refs.get(fileName(T.T6))).toBe('img:夜景.webp');
    expectScenario('Z10', w);
  });

  it('Z11 記住場景設定並貼上、場景範本、同步房間設計', () => {
    const w = new World();
    w.load(T.T1, T.T2, T.T4, T.T6);
    const frame = addPart(w.p, { kind: 'marker', name: '框', imageUrl: fileName(T.T2) }, w.ctx());
    const [tid] = createFromMaterials(w.p, 'tachie', [fileName(T.T4)], w.ctx());
    const [sid] = createFromMaterials(w.p, 'scene', [fileName(T.T1)], w.ctx());
    setTachieAppear(w.p, sid, tid, true, w.ctx());
    const em = addEffect(w.p, sid, null, w.ctx())!;
    updateEffect(w.p, sid, em.id, { imageUrl: fileName(T.T6) }, w.ctx());
    setOverride(w.p, sid, frame.id, { x: 5 });
    const s1 = w.p.scenes[0];
    s1.fieldWidth = 30;
    s1.fieldHeight = 20;
    const b = addScene(w.p, 'B', null);
    const c = addScene(w.p, 'C', null);
    const clip = clipFromScene(s1);
    pasteClip(clip, b, 'all', w.p.room, w.tool.tachieGap);
    pasteClip(clip, c, 'tachie', w.p.room, w.tool.tachieGap);
    const tp = templateFromScene(c, c.name);
    w.p.sceneTemplates.push(tp);
    const c2 = addScene(w.p, tp.name, null);
    applyTemplate(tp, c2, w.p.room, w.tool.tachieGap);
    syncSceneToRoom(c, w.p.room);
    sceneAlias(w, s1.id, 't1_wide_1600x900');
    sceneAlias(w, b.id, 'B');
    sceneAlias(w, c.id, 'C');
    sceneAlias(w, c2.id, 'C＃2');
    w.name(frame.id, '共用標記:框');
    for (const s of [s1, b, c, c2]) {
      for (const m of s.markers)
        w.name(m.id, m.kind === 'tachie' ? '立繪:t4_tall_600x1200' : '演出:〈演出預設名〉');
    }
    expectScenario('Z11', w);
  });
});

describe('room-zip：KP 用棋子的聊天面板（3.2.10）', () => {
  it('CoC：判定指令換掉範本裡的 sCCB<=、PC 區、敵我區塊的空行規則、KP 自己的技能', () => {
    const p = createProject();
    p.kp.checkType = 'CC<=';
    p.kp.tpl.coc6 = { main: '1d100\nsCCB<=50 【暗骰】', scene: '  ', memo: '備忘' };
    const e1 = createPiece('enemy', '甲');
    e1.skills = [
      { id: 'a', name: '', value: '', damage: '' },
      { id: 'b', name: '', value: '30', damage: '' },
    ];
    const e2 = createPiece('enemy', '乙 二');
    e2.noDodge = true;
    e2.memo = '弱點是火';
    p.kp.skills = [
      { id: 'x', name: '偵查', value: '' },
      { id: 'y', name: '圖書館', value: '70' },
    ];
    const s = buildKpCommands(p.kp, [e1, e2]);
    expect(s).toBe(
      `${[
        '1d100\nsCC<=50 【暗骰】',
        `${KP_TEXT.pcTitle}\n//HO1=PC1\n/var HO1 PC1\n//HO2=PC2\n/var HO2 PC2`,
        `${KP_TEXT.enemyTitle}\n${KP_TEXT.enemyMark}：甲\nCC<=30 【${KP_TEXT.attack}】 @甲\nCC<=0 【${KP_TEXT.dodge}】 @甲\n:甲_HP-1\n\n${KP_TEXT.enemyMark}：乙 二\n:乙_二_HP-1\n★弱點是火\n`,
        KP_TEXT.allyTitle,
        '備忘',
      ].join('\n\n')}\nCC<=70 【圖書館】`,
    );
  });

  it('Emoklore：技能值＋DL；KP 自己的技能仍用判定指令格式（舊版行為）', () => {
    const p = createProject();
    p.kp.system = 'emoklore';
    p.kp.tpl.emoklore = { main: '', scene: '', memo: '' };
    p.kp.pcs = [];
    const e = createPiece('ally', '小隊長');
    e.skills = [{ id: 'a', name: '射擊', value: '3', damage: '2d6' }];
    e.dodge = '2';
    e.armor = '1';
    p.kp.skills = [{ id: 'y', name: '知覺', value: '2' }];
    expect(buildKpCommands(p.kp, [e])).toBe(
      `${KP_TEXT.pcTitle}\n\n${KP_TEXT.enemyTitle}\n\n${KP_TEXT.allyTitle}\n${KP_TEXT.allyMark}：小隊長\n3DL 【射擊】 @小隊長\n2d6 【${KP_TEXT.damage}】 @小隊長\n2DL 【${KP_TEXT.dodge}】 @小隊長\n:小隊長_HP-1\n${KP_TEXT.armor}+1\n\nCCB<=2 【知覺】`,
    );
  });

  it('產生 KP 用棋子：沒有就加在最前面，有就只更新聊天面板', () => {
    const p = createProject();
    addPiece(p, 'normal');
    expect(applyKpPiece(p, () => createPiece('kp'))).toBe(true);
    expect(p.pieces[0].kind).toBe('kp');
    p.pieces[0].name = '改名';
    expect(applyKpPiece(p, () => createPiece('kp'))).toBe(false);
    expect(p.pieces.filter((x) => x.kind === 'kp')).toHaveLength(1);
    expect(p.pieces[0].name).toBe('改名');
  });
});

describe('room-zip：組裝 ZIP 與自我檢查（F281、3.6）', () => {
  it('Z01：檔案集合＝__data.json、.token、引用的圖片（resources 一一對應）；沒被引用的素材不收', async () => {
    const w = new World();
    w.load(T.T1, T.T3);
    createFromMaterials(w.p, 'scene', [fileName(T.T1)], w.ctx());
    const images: RoomImageFile[] = w.p.materials.map((m, i) => ({
      name: m.name,
      type: m.mime,
      data: new Uint8Array([i, 1, 2, 3]),
    }));
    const built = buildRoomZip(w.data(), images, { mtime: new Date('2026-01-01T00:00:00Z') });
    expect(built.missing).toEqual([]);
    const entries = unzipFiles(built.bytes).map((e) => e.name);
    expect(entries).toEqual(['__data.json', '.token', fileName(T.T1)]);
    const token = new TextDecoder().decode(unzipFiles(built.bytes)[1].data);
    expect(token).toMatch(ROOM_TOKEN_RE);
    expect(Object.keys(built.data.resources)).toEqual([fileName(T.T1)]);
    /* 假圖片的內容不等於檔名的雜湊 → 自我檢查抓得到（真的匯出時是素材本身的位元組） */
    const check = await checkRoomZip(built.bytes);
    expect(check.ok).toBe(false);
    expect(check.problems.map((x) => x.code)).toEqual(['hash-mismatch']);
    expect(check.sceneCount).toBe(1);
  });
});
