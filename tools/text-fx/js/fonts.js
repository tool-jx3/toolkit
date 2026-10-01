/* 文字演出產生器：字型清單、按需載入、我的字型（IndexedDB）、電腦字型
 * Google Fonts 只在選到時才插入 <link>；CSS 本身依 unicode-range 切片，
 * 瀏覽器只會下載畫面上真的用到的字。 */

/* style 決定替代字型的風格：serif → 宋／明體系，sans → 黑體系。
 * latin: 西文字型，遇到中文字自動改用同風格的繁中字型。 */
export const FONT_GROUPS = [
  {
    label: '繁體中文',
    items: [
      { id: 'Noto Serif TC', label: '思源宋體（Noto Serif TC）', weights: [200, 300, 400, 500, 600, 700, 800, 900], style: 'serif' },
      { id: 'Noto Sans TC', label: '思源黑體（Noto Sans TC）', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], style: 'sans' },
      { id: 'LXGW WenKai TC', label: '霞鶩文楷（LXGW WenKai TC）', weights: [300, 400, 700], style: 'serif' },
      { id: 'Chocolate Classical Sans', label: '朱古力黑體（Chocolate Classical Sans）', weights: [400], style: 'sans' },
      { id: 'Cactus Classical Serif', label: '仙人掌明體（Cactus Classical Serif）', weights: [400], style: 'serif' },
      { id: 'Huninn', label: '粉圓（Huninn）', weights: [400], style: 'sans' },
      { id: 'Iansui', label: '芫荽（Iansui）', weights: [400], style: 'sans' }
    ]
  },
  {
    label: '西文標題',
    items: [
      { id: 'Cinzel', label: 'Cinzel（古典羅馬）', weights: [400, 500, 600, 700, 800, 900], style: 'serif', latin: true },
      { id: 'Bebas Neue', label: 'Bebas Neue（窄長無襯線）', weights: [400], style: 'sans', latin: true },
      { id: 'Special Elite', label: 'Special Elite（打字機）', weights: [400], style: 'serif', latin: true },
      { id: 'Creepster', label: 'Creepster（恐怖片）', weights: [400], style: 'sans', latin: true },
      { id: 'UnifrakturMaguntia', label: 'UnifrakturMaguntia（哥德體）', weights: [400], style: 'serif', latin: true }
    ]
  }
];
const GOOGLE = new Map(FONT_GROUPS.flatMap(g => g.items).map(f => [f.id, f]));

/* 中文字型通常沒有韓文字：遇到韓文自動改用同風格的韓文字型 */
const KOREAN = {
  serif: { id: 'Noto Serif KR', weights: [200, 300, 400, 500, 600, 700, 800, 900] },
  sans: { id: 'Noto Sans KR', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900] }
};
const CJK_FOR_LATIN = { serif: 'Noto Serif TC', sans: 'Noto Sans TC' };

export const DEFAULT_FONT = { src: 'google', id: 'Noto Serif TC' };

const RE_HANGUL = /[ᄀ-ᇿ㄰-㆏가-힣]/;
const RE_NON_LATIN = /[^\u0000-ɏ -⁯₠-⃏℀-⅏]/;

/* ---------- 我的字型（只存在這個瀏覽器） ---------- */
const userFaces = new Map(); // id → { id, name, family }

export function userFontList() {
  return [...userFaces.values()];
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('trpg-toolkit-text-fx', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('fonts', { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function dbTx(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('fonts', mode);
    const store = tx.objectStore('fonts');
    const out = fn(store);
    tx.oncomplete = () => { db.close(); resolve(out && 'result' in out ? out.result : undefined); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function registerUserFace(rec) {
  const family = `TFX User ${rec.id}`;
  const face = new FontFace(family, rec.data);
  await face.load();
  document.fonts.add(face);
  userFaces.set(rec.id, { id: rec.id, name: rec.name, family });
}

/* 啟動時把 IndexedDB 裡的字型註冊回來 */
export async function restoreUserFonts() {
  try {
    const all = await dbTx('readonly', s => s.getAll());
    for (const rec of all || []) {
      try { await registerUserFace(rec); } catch { /* 壞掉的檔案略過 */ }
    }
  } catch { /* 無法使用 IndexedDB（隱私模式等） */ }
  return userFontList();
}

export async function addUserFont(file) {
  if (!/\.(ttf|otf|woff2?)$/i.test(file.name)) throw new Error('只接受 TTF、OTF、WOFF、WOFF2 檔');
  const data = await file.arrayBuffer();
  const id = `${Date.now().toString(36)}${Math.floor(performance.now() % 1000).toString(36)}`;
  const rec = { id, name: file.name.replace(/\.[^.]+$/, ''), data };
  await registerUserFace(rec); // 先確認瀏覽器讀得懂再存
  try { await dbTx('readwrite', s => s.put(rec)); } catch { /* 存不了就只在這次開啟期間可用 */ }
  return userFaces.get(id);
}

export async function removeUserFont(id) {
  const info = userFaces.get(id);
  if (info) {
    for (const face of document.fonts) if (face.family.replace(/"/g, '') === info.family) document.fonts.delete(face);
    userFaces.delete(id);
  }
  try { await dbTx('readwrite', s => s.delete(id)); } catch { /* 略過 */ }
}

/* ---------- 字型資訊 ---------- */
export function fontInfo(ref) {
  if (!ref) ref = DEFAULT_FONT;
  if (ref.src === 'google' && GOOGLE.has(ref.id)) return { ...GOOGLE.get(ref.id), src: 'google' };
  if (ref.src === 'user') {
    const u = userFaces.get(ref.id);
    return { id: ref.id, label: u ? u.name : '（找不到的字型）', family: u ? u.family : null, weights: [400, 700], style: 'sans', src: 'user', missing: !u };
  }
  if (ref.src === 'local') {
    return { id: ref.id, label: ref.id, family: ref.id, weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], style: 'sans', src: 'local' };
  }
  return { ...GOOGLE.get(DEFAULT_FONT.id), src: 'google' };
}

export function nearestWeight(weights, w) {
  let best = weights[0];
  for (const x of weights) if (Math.abs(x - w) < Math.abs(best - w) || (Math.abs(x - w) === Math.abs(best - w) && x > best)) best = x;
  return best;
}

/* 這段文字用這個字型時，實際要排進字型堆疊的字族（含自動替代） */
function familiesFor(ref, text) {
  const info = fontInfo(ref);
  const list = [];
  const style = info.style === 'serif' ? 'serif' : 'sans';
  if (info.src === 'google') list.push({ family: info.id, google: info });
  else if (info.family) list.push({ family: info.family });
  /* 西文字型遇到中文：改用同風格的繁中字型（我的字型、電腦字型則交給瀏覽器的預設替代） */
  if (info.latin && RE_NON_LATIN.test(text)) {
    const cjk = GOOGLE.get(CJK_FOR_LATIN[style]);
    list.push({ family: cjk.id, google: cjk });
  }
  if (RE_HANGUL.test(text)) {
    const kr = KOREAN[style];
    list.push({ family: kr.id, google: kr });
  }
  return { list, generic: style === 'serif' ? 'serif' : 'sans-serif' };
}

/* canvas 用的 font 字串 */
export function fontCss(ref, weight, italic, size, text = '') {
  const { list, generic } = familiesFor(ref, text);
  const fams = list.map(f => `"${f.family}"`).concat(generic).join(', ');
  return `${italic ? 'italic ' : ''}${weight} ${Math.max(1, size).toFixed(2)}px ${fams}`;
}

/* ---------- Google Fonts 按需載入 ---------- */
const links = new Map(); // "家族@字重" → Promise

function linkFor(info, weight) {
  const w = nearestWeight(info.weights, weight);
  const key = `${info.id}@${w}`;
  if (links.has(key)) return links.get(key);
  const fam = info.id.replace(/ /g, '+');
  const href = info.weights.length > 1
    ? `https://fonts.googleapis.com/css2?family=${fam}:wght@${w}&display=swap`
    : `https://fonts.googleapis.com/css2?family=${fam}&display=swap`;
  const p = new Promise(resolve => {
    const el = document.createElement('link');
    el.rel = 'stylesheet';
    el.href = href;
    el.dataset.textFx = key;
    el.onload = () => resolve(true);
    el.onerror = () => resolve(false);
    document.head.appendChild(el);
  });
  p.done = false;
  p.then(() => { p.done = true; });
  links.set(key, p);
  return p;
}

/* 現在畫下去是不是已經是正確字型（不觸發下載以外的等待） */
export function fontsReadyNow(items) {
  for (const it of items) {
    const { list } = familiesFor(it.ref, it.text);
    for (const f of list) {
      if (f.google) {
        const p = linkFor(f.google, it.weight);
        if (!p.done) return false;
      }
      const css = `${it.italic ? 'italic ' : ''}${f.google ? nearestWeight(f.google.weights, it.weight) : it.weight} 32px "${f.family}"`;
      try { if (!document.fonts.check(css, it.text || 'A')) return false; } catch { /* 略過 */ }
    }
  }
  return true;
}

/* 等到這些字型（只限用到的字）都下載好。逾時就算了，用替代字型畫。 */
export async function ensureFonts(items, timeoutMs = 10000) {
  const jobs = [];
  for (const it of items) {
    const { list } = familiesFor(it.ref, it.text);
    for (const f of list) {
      const w = f.google ? nearestWeight(f.google.weights, it.weight) : it.weight;
      const css = `${it.italic ? 'italic ' : ''}${w} 32px "${f.family}"`;
      const pre = f.google ? linkFor(f.google, it.weight) : Promise.resolve(true);
      jobs.push(pre.then(() => document.fonts.load(css, it.text || 'A')).catch(() => null));
    }
  }
  let timer;
  const timeout = new Promise(r => { timer = setTimeout(() => r('timeout'), timeoutMs); });
  const res = await Promise.race([Promise.all(jobs), timeout]);
  clearTimeout(timer);
  return res !== 'timeout';
}
