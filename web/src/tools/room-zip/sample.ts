/**
 * 範例專案（D17）：圖片全部在瀏覽器裡用 canvas 畫，文字自己寫，不沿用原作的範例檔。
 * 載入＝整個專案換掉（可以復原），圖片照一般匯入規則處理後存進這個工具的圖片庫。
 */
import { packRoomImage } from '@/ccfolia';
import {
  addPart,
  addPiece,
  addScene,
  addTachie,
  autoRoomBackground,
  createTachieFace,
  ctxOf,
  finalize,
  setTachieAppear,
} from './actions';
import { canvasBlob, processFile } from './importer';
import { guessTag } from './materials';
import {
  createProject,
  type Material,
  newLocalId,
  type Project,
  SAMPLE_PROJECT_NAME,
  type Tag,
} from './model';
import { domain, loadBlobs, putBlob, setSession, settings, useProject } from './store';

type Draw = (cx: CanvasRenderingContext2D, w: number, h: number) => void;

interface SampleImage {
  key: string;
  label: string;
  width: number;
  height: number;
  tag?: Tag;
  draw: Draw;
}

const roundRect = (
  cx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) => {
  cx.beginPath();
  cx.roundRect(x, y, w, h, r);
};

/** 立繪：簡單的剪影（頭、身體、眼睛） */
const figure =
  (body: string, accent: string, eyes: 'calm' | 'wide'): Draw =>
  (cx, w, h) => {
    const mx = w / 2;
    cx.fillStyle = body;
    roundRect(cx, w * 0.18, h * 0.3, w * 0.64, h * 0.7, w * 0.22);
    cx.fill();
    cx.fillStyle = accent;
    roundRect(cx, w * 0.3, h * 0.34, w * 0.4, h * 0.08, h * 0.03);
    cx.fill();
    cx.fillStyle = '#f2d7c0';
    cx.beginPath();
    cx.arc(mx, h * 0.18, w * 0.2, 0, Math.PI * 2);
    cx.fill();
    cx.fillStyle = body;
    cx.beginPath();
    cx.arc(mx, h * 0.14, w * 0.21, Math.PI, Math.PI * 2);
    cx.fill();
    cx.fillStyle = '#2b2b33';
    const r = eyes === 'wide' ? w * 0.03 : w * 0.018;
    for (const dx of [-0.07, 0.07]) {
      cx.beginPath();
      cx.arc(mx + dx * w, h * 0.19, r, 0, Math.PI * 2);
      cx.fill();
    }
    if (eyes === 'wide') {
      cx.beginPath();
      cx.ellipse(mx, h * 0.245, w * 0.025, w * 0.035, 0, 0, Math.PI * 2);
      cx.fill();
    }
  };

const IMAGES: readonly SampleImage[] = [
  {
    key: 'study',
    label: '書房',
    width: 1280,
    height: 720,
    tag: 'fg',
    draw: (cx, w, h) => {
      const g = cx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#5b4636');
      g.addColorStop(1, '#2e231b');
      cx.fillStyle = g;
      cx.fillRect(0, 0, w, h);
      cx.fillStyle = '#9fc4e8';
      cx.fillRect(w * 0.62, h * 0.12, w * 0.24, h * 0.36);
      cx.strokeStyle = '#3a2c21';
      cx.lineWidth = 12;
      cx.strokeRect(w * 0.62, h * 0.12, w * 0.24, h * 0.36);
      cx.beginPath();
      cx.moveTo(w * 0.74, h * 0.12);
      cx.lineTo(w * 0.74, h * 0.48);
      cx.stroke();
      const colors = ['#8c3b3b', '#3b5f8c', '#3b8c5a', '#8c7a3b', '#6a3b8c'];
      for (let row = 0; row < 3; row++) {
        const y = h * (0.15 + row * 0.2);
        cx.fillStyle = '#3a2c21';
        cx.fillRect(w * 0.06, y + h * 0.15, w * 0.42, h * 0.02);
        for (let i = 0; i < 14; i++) {
          cx.fillStyle = colors[(i + row) % colors.length];
          cx.fillRect(w * (0.07 + i * 0.029), y + (i % 3) * 6, w * 0.022, h * 0.15 - (i % 3) * 6);
        }
      }
      cx.fillStyle = '#4a3627';
      cx.fillRect(0, h * 0.78, w, h * 0.22);
    },
  },
  {
    key: 'street',
    label: '夜晚街道',
    width: 1280,
    height: 720,
    tag: 'fg',
    draw: (cx, w, h) => {
      const g = cx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#0d1633');
      g.addColorStop(1, '#2a2f4f');
      cx.fillStyle = g;
      cx.fillRect(0, 0, w, h);
      cx.fillStyle = '#f4f1d0';
      cx.beginPath();
      cx.arc(w * 0.82, h * 0.16, h * 0.07, 0, Math.PI * 2);
      cx.fill();
      const blocks = [0.12, 0.2, 0.16, 0.24, 0.14, 0.18];
      let x = 0;
      for (let i = 0; i < blocks.length; i++) {
        const bw = w * blocks[i];
        const bh = h * (0.35 + ((i * 37) % 30) / 100);
        cx.fillStyle = i % 2 ? '#1b2140' : '#161a33';
        cx.fillRect(x, h * 0.85 - bh, bw, bh);
        cx.fillStyle = '#f2c46d';
        for (let wy = h * 0.85 - bh + 24; wy < h * 0.8; wy += 46) {
          for (let wx = x + 18; wx < x + bw - 24; wx += 40) {
            if ((Math.floor(wx) + Math.floor(wy)) % 3) cx.fillRect(wx, wy, 14, 20);
          }
        }
        x += bw;
      }
      cx.fillStyle = '#20243a';
      cx.fillRect(0, h * 0.85, w, h * 0.15);
    },
  },
  {
    key: 'hero',
    label: '調查員・平常',
    width: 360,
    height: 900,
    tag: 'tachie',
    draw: figure('#2f6f73', '#c9e4e2', 'calm'),
  },
  {
    key: 'heroWide',
    label: '調查員・驚訝',
    width: 360,
    height: 900,
    tag: 'tachie',
    draw: figure('#2f6f73', '#c9e4e2', 'wide'),
  },
  {
    key: 'owner',
    label: '古書店店主',
    width: 360,
    height: 900,
    tag: 'tachie',
    draw: figure('#6b4a7a', '#e3d2ea', 'calm'),
  },
  {
    key: 'frame',
    label: '對話框',
    width: 1200,
    height: 260,
    tag: 'panel',
    draw: (cx, w, h) => {
      cx.fillStyle = 'rgba(16, 20, 34, 0.82)';
      roundRect(cx, 6, 6, w - 12, h - 12, 28);
      cx.fill();
      cx.strokeStyle = '#d8c48f';
      cx.lineWidth = 6;
      cx.stroke();
    },
  },
  {
    key: 'icon',
    label: '調查員圖示',
    width: 256,
    height: 256,
    tag: 'icon',
    draw: (cx, w, h) => {
      cx.fillStyle = '#c9e4e2';
      cx.beginPath();
      cx.arc(w / 2, h / 2, w / 2 - 4, 0, Math.PI * 2);
      cx.fill();
      cx.save();
      cx.clip();
      cx.translate(w * 0.2, h * 0.08);
      figure('#2f6f73', '#c9e4e2', 'calm')(cx, w * 0.6, h * 1.5);
      cx.restore();
    },
  },
];

const STORY = [
  {
    title: '導入',
    body: '雨停後的傍晚，調查員收到一封沒有署名的信，信裡只寫著一家古書店的地址。',
  },
  {
    title: '古書店',
    body: '店主說那本書三天前就賣掉了，但帳簿上的買家名字，正是調查員自己。',
  },
];

/** 畫一張範例圖，照一般匯入規則處理後存進圖片庫 */
async function makeImage(img: SampleImage): Promise<Material> {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const cx = c.getContext('2d');
  if (!cx) throw new Error('canvas');
  img.draw(cx, img.width, img.height);
  const blob = await canvasBlob(c, 'image/png');
  if (!blob) throw new Error('encode');
  const file = new File([blob], `${img.label}.png`, { type: 'image/png' });
  const r = await processFile(file);
  const packed = await packRoomImage(r.blob, r.mime);
  await putBlob(
    packed.name,
    new Blob([packed.data as Uint8Array<ArrayBuffer>], { type: packed.type }),
  );
  return {
    name: packed.name,
    label: img.label,
    tags: [img.tag ?? guessTag(r.guessWidth, r.guessHeight)],
    animated: false,
    originalName: file.name,
    mime: packed.type,
    before: file.size,
    after: packed.data.byteLength,
    width: r.width,
    height: r.height,
  };
}

/** 組出範例專案（圖片已存好；names：key → 素材名稱） */
export function buildSampleProject(
  materials: readonly Material[],
  names: Record<string, string>,
): Project {
  const p = createProject(SAMPLE_PROJECT_NAME);
  p.materials = [...materials];
  autoRoomBackground(p);
  const c = ctxOf(p, settings());
  addPart(p, { kind: 'panel', name: '對話框', imageUrl: names.frame, x: 0, y: 11 }, c);
  const owner = addTachie(
    p,
    { character: '古書店店主', expression: '平常', imageUrl: names.owner },
    c,
  );
  const hero = addTachie(p, { character: '調查員', expression: '平常', imageUrl: names.hero }, c);
  const wide = createTachieFace(p, hero.id);
  if (wide) {
    wide.expression = '驚訝';
    wide.imageUrl = names.heroWide;
  }
  const s1 = addScene(p, '序章・書房', names.study);
  setTachieAppear(p, s1.id, hero.id, true, c);
  const s2 = addScene(p, '第一幕・夜晚街道', names.street);
  setTachieAppear(p, s2.id, hero.id, true, c);
  setTachieAppear(p, s2.id, owner.id, true, c);
  const piece = addPiece(p, 'ally');
  piece.name = '調查員';
  piece.iconUrl = names.icon;
  piece.hp = '11';
  piece.mp = '12';
  p.story = STORY.map((s) => ({ id: newLocalId('t'), ...s }));
  p.memo = '這是範例房間：可以隨意修改、匯出 ZIP 看看結果。';
  p.todos = [
    { id: newLocalId('d'), text: '換成自己的背景圖', done: false, sub: false },
    { id: newLocalId('d'), text: '確認每個場景的立繪', done: false, sub: false },
  ];
  finalize(p, c);
  return p;
}

/** 載入範例（整個專案換掉；可以復原） */
export async function loadSample(): Promise<void> {
  setSession({ busy: { title: '準備範例中', detail: '', done: 0, total: IMAGES.length } });
  try {
    const materials: Material[] = [];
    const names: Record<string, string> = {};
    for (let i = 0; i < IMAGES.length; i++) {
      const img = IMAGES[i];
      setSession({
        busy: { title: '準備範例中', detail: img.label, done: i, total: IMAGES.length },
      });
      const m = await makeImage(img);
      names[img.key] = m.name;
      if (!materials.some((x) => x.name === m.name)) materials.push(m);
    }
    await loadBlobs(materials.map((m) => m.name));
    const p = buildSampleProject(materials, names);
    useProject.getState().replace(p);
    domain.current = 'project';
    setSession({
      sceneId: p.scenes[0]?.id ?? null,
      sceneSel: [],
      imgSel: [],
      roomSel: [],
      clip: null,
      modal: null,
    });
  } finally {
    setSession({ busy: null });
  }
}
