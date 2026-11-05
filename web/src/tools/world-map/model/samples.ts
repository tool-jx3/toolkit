/**
 * 範本（本站自己做的三張地圖）：地形用本站的產生器（固定的種子），國、據點、路線、地名另外擺。
 * - 艾爾德蘭大陸：三個國家、山脈越過的街道、注入海的川、王都與港口（古地圖風）。
 * - 星砂群島：島與島之間的航路、港口與燈塔（夜航風；據點與道路是產生器擺的）。
 * - 勢力配置草圖：同一塊大陸只留陸地（白地圖、不畫山與森林），據點換成記號，只看位置關係。
 */
import { blankDoc, newNote, newObject, newPath, newRegion, uid } from './factory';
import { generateTerrain, generateWorld } from './generate';
import { encodeCells } from './terrain';
import type { MapObject, Pt, WorldDoc } from './types';

export type SampleId = 'continent' | 'islands' | 'sketch';
export const SAMPLE_IDS: readonly SampleId[] = ['continent', 'islands', 'sketch'];

const pts = (list: [number, number][]): Pt[] => list.map(([x, y]) => ({ x, y }));

function obj(kind: string, x: number, y: number, name = '', patch: Partial<MapObject> = {}) {
  const o = newObject(kind, x, y, uid);
  o.name = name;
  return Object.assign(o, patch);
}

function continent(): WorldDoc {
  const seed = 702;
  const t = generateTerrain(seed, 128, 80);
  const d = blankDoc();
  d.title = '艾爾德蘭大陸';
  d.seed = seed;
  d.drawMode = 'free';
  d.terrain = encodeCells(t.terrain);
  d.ground = encodeCells(t.ground);
  const west = newRegion(
    '艾爾德蘭王國',
    '#b4664f',
    pts([
      [370, 300],
      [690, 250],
      [720, 520],
      [660, 880],
      [360, 860],
    ]),
  );
  west.labelDx = -74;
  west.labelDy = -208;
  const east = newRegion(
    '赤砂公國',
    '#c39b4a',
    pts([
      [770, 200],
      [1350, 210],
      [1350, 610],
      [820, 600],
      [740, 420],
    ]),
  );
  east.labelDy = 68;
  const south = newRegion(
    '潮聲自由同盟',
    '#5f8f8a',
    pts([
      [820, 600],
      [1350, 610],
      [1320, 880],
      [760, 880],
    ]),
  );
  south.labelDy = 80;
  d.regions = [west, east, south];
  d.objects = [
    obj('capital', 560, 430, '王都艾爾德'),
    obj('castle', 470, 520, '鷹巢城'),
    obj('town', 520, 548, '石橋鎮'),
    obj('port', 500, 612, '瑟蘭港'),
    obj('city', 900, 330, '赤砂都'),
    obj('tower', 1100, 330, '觀星塔'),
    obj('ruins', 900, 520, '沉沙遺跡'),
    obj('town', 980, 700, '風車鎮'),
    obj('port', 1240, 700, '潮聲港'),
    obj('ship', 1360, 790),
  ];
  const road1 = newPath(
    'road',
    pts([
      [560, 452],
      [540, 500],
      [520, 548],
    ]),
  );
  road1.name = '王道';
  const road2 = newPath(
    'road',
    pts([
      [582, 430],
      [660, 420],
      [760, 400],
      [800, 360],
      [878, 335],
    ]),
  );
  road2.name = '越嶺古道';
  const road3 = newPath(
    'road',
    pts([
      [1002, 700],
      [1100, 690],
      [1215, 700],
    ]),
  );
  road3.name = '海岸驛道';
  const river = newPath(
    'river',
    pts([
      [780, 560],
      [850, 620],
      [900, 700],
      [1000, 760],
      [1110, 812],
    ]),
  );
  river.name = '赤砂河';
  d.paths = [road1, road2, road3, river];
  const sea = newNote('西之海', 210, 610);
  sea.size = 28;
  sea.rotation = -6;
  const ridge = newNote('龍脊山脈', 760, 420);
  ridge.size = 22;
  ridge.rotation = 66;
  d.notes = [sea, ridge];
  return d;
}

function islands(): WorldDoc {
  const seed = 2402;
  const base = blankDoc();
  base.theme = 'night';
  base.drawMode = 'free';
  const d = generateWorld(base, seed, null, uid);
  d.title = '星砂群島';
  const north = newRegion(
    '北境聯邦',
    '#8b78a8',
    pts([
      [150, 40],
      [1460, 40],
      [1460, 440],
      [150, 430],
    ]),
  );
  north.labelDy = -60;
  const south = newRegion(
    '南洋諸島',
    '#5f8f8a',
    pts([
      [80, 440],
      [1460, 440],
      [1460, 920],
      [80, 920],
    ]),
  );
  south.labelDx = -430;
  south.labelDy = 150;
  d.regions = [north, south];
  const route1 = newPath(
    'sea',
    pts([
      [198, 545],
      [290, 640],
      [470, 700],
      [585, 722],
    ]),
  );
  route1.name = '西方航線';
  const route2 = newPath(
    'sea',
    pts([
      [905, 545],
      [980, 640],
      [1040, 770],
    ]),
  );
  route2.name = '中央航線';
  d.paths = [...d.paths, route1, route2];
  d.objects = [...d.objects, obj('beacon', 760, 610, '潮燈塔'), obj('ship', 820, 660)];
  const title = newNote('STAR SAND ISLES', 700, 110);
  title.size = 22;
  d.notes = [title];
  return d;
}

function sketch(): WorldDoc {
  const d = continent();
  d.title = '勢力配置草圖';
  d.theme = 'atlas';
  d.terrain = d.terrain.replace(/[2-6]/g, '1');
  d.ground = d.terrain;
  d.settings = { ...d.settings, details: false };
  d.objects = d.objects
    .filter((o) => ['capital', 'city', 'town', 'port', 'castle'].includes(o.kind))
    .map((o) => ({ ...o, kind: o.kind === 'capital' ? 'star' : 'dot', size: 24 }));
  d.paths = d.paths.filter((p) => p.kind === 'road');
  d.notes = [];
  return d;
}

export function sampleDoc(id: SampleId): WorldDoc {
  return id === 'islands' ? islands() : id === 'sketch' ? sketch() : continent();
}
