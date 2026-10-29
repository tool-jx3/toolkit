#!/usr/bin/env node
/**
 * 把弄墨 Inknomu《角色姓名產生器》的姓名資料包（CC BY 4.0）轉成 core/names 的資料檔。
 *
 *   cd web && node scripts/inknomu-names.mjs <資料包資料夾> [--download] [--sources <資料來源.json>]
 *
 * - 資料夾裡要有 29 個 `<id>.json`（取自 `https://inknomu.com/data/packs/<id>.json`）；加 `--download` 時先下載到那個資料夾。
 * - 檔案的 SHA-256 和下面 SOURCES 記的（2026-10-29 取得）不同時停下來：原站更新了資料，要先看過改了什麼，
 *   確認之後把新的 SHA-256 填進 SOURCES、src/core/names/inknomu/LICENSE.txt 與 meta.json 再重跑。
 * - 輸出：src/core/names/inknomu/inknomu-<地區>.ts（每個地區一個檔，用到才載入）與 catalog.ts（包的清單，開頁就要用）。
 *   文字（姓名、讀音、涵義、備註、規則說明）照原文，只做格式轉換、拿掉用不到的欄位（見 DROPPED 與 LICENSE.txt）；
 *   例外：日本三個包的說明原文是日文，譯成繁中（NOTE_TRANSLATIONS）。
 * - `--sources`：各地區頁面底部的「資料來源」清單（`{地區: [{group, items: [{text, links?: [{text, url}]}]}]}`，
 *   2026-10-29 從 8 個地區頁整理）→ src/core/names/inknomu/sources.ts（「關於這份語料」打開時才載入）。
 *   文字照原文；連結只收 https。沒給時不動 sources.ts。
 * - 同樣的輸入每次產生同樣的檔案（逐位元組相同）。
 *
 * 規格：docs/refactor/specs/npc-names.md 2.5。這支腳本只讀資料，不執行資料裡的任何內容。
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src/core/names/inknomu',
);
const BASE_URL = 'https://inknomu.com/data/packs/';
const LICENSE_URL = 'https://creativecommons.org/licenses/by/4.0/';

/** 地區（本站的順序）→ 包（原站的順序）與 SHA-256（2026-10-29 取得） */
const SOURCES = {
  jp: {
    'jp-sengoku': '452152e806b2d5909d5b719a5ef505a11b4583997eda4ca118bbc8c142031cfe',
    'jp-edo': '1cf4ee17290626c6521bea63e6fa127da409dc4b09df00c40e3a746d0dc21f66',
    'jp-taisho': '1a48f01a521cc5a4a480ab6057c44ebce453ab95167c50db2d104dc45229b265',
    'jp-showa': 'd579ae3e49a2199b8c7ac1614ae2fb05e91f40c3a2c59713ade365bcc9214043',
    'jp-modern': 'd37d3cc04df4145fa479c1f071b7664d9262a87e0aa4a387cc979408e1f94c71',
    'jp-rare': '6d8536beef8823721cc2a28c4ec44d8027746b8e5a278391bae178aab0e1f4fa',
  },
  tw: {
    'tw-qing': '342864f5eb7470e3d1ae28ca2f772d306f22e9cb91daaa9566f046d6258d98b4',
    'tw-japanese': 'c5ad58fe48cd669fabcc73580ec2b13f9d6f6e73a8fb009cd6de657ff58bcf3d',
    'tw-modern': 'b7a07a1fc9a2e4eb3da99b288c9633612fc65f0ed32c230825ef0da756cd5f6b',
    'tw-y2k': '394ab7e2ce117b7ad3823b649253830b80e07372fcc11acb3a6d3d98d7df11b1',
    'tw-wuxia': 'a918a18dbcfee712bd706500ac537ee7caf13fa3a77a4692b980efe7cb437513',
  },
  kr: {
    'kr-modern': '9649681546f5ce6c53414eb229eb733bad937792b1cc11cd7f4ee8b77b9a89ff',
  },
  uk: {
    'uk-medieval': '40041e6a65bb8d53ef52f1caed8deb029e9d50ce91424a582c9bfdb24e8299b3',
    'uk-regency': '452b2807d565430fde5d16d5538d61d24ff07a19d9940db3ce37219a5d65fa8f',
    'uk-victorian': '025f33f4e2cc05d1b347440a6f588e4c63d0e629e320dc6c595cb36e6f88a455',
    'uk-modern': 'a4773cc8e26818a66d71aae825c595d661102b4a171d23974b559d564bebb4d0',
  },
  us: {
    'us-classic': 'b481874693d96ffa34a2cc8b3c5336b13a796464a8e853f64521fd47cf47120c',
    'us-modern': 'b52a9e023ed45a344ffda08577a92a796e2d62addc0ff822a14a112db0f4fd06',
    'us-latino': '96d3c7464177189a16eaa5a881652dafaa18f795b6cce2926a26bb3e90a7cd51',
    'us-african-american': '2616f141ea22079098ad90979a7707b3d5cc3d3e204e9547d3d6b152f45e5d0a',
  },
  ru: {
    'ru-imperial': 'c054eeb4f3be2e174b12cd60474dcb572a07ff1e86f725a411bd409d57728dbe',
    'ru-modern': 'be634f1d005bef2f5e32077d53289148cfda748c7ba7e7e85d851c403d15d633',
  },
  nordic: {
    'nordic-viking': '61de6d3f69e8e4be7b11400f67f416ff97b1bd7686006db8cd97250403c13011',
    'nordic-modern': 'ed8212b13778f12516d2249120fbd61ccdcaba44ca87996ad29fc1fce1dad156',
  },
  fantasy: {
    'fantasy-human': '4489bf211ecdf9651da107a0a3a8ae41f4fb72a89954321deae46d8aeec007ba',
    'fantasy-elf': 'ab705e8b4c138fedf31d6a759e7d2d9c31bb8ee9f7eea8a0e054fa3f5a514d98',
    'fantasy-dwarf': '9520869e94b4bac424509a04e578a2b67329c1758812ac26a5a816603f5a8228',
    'fantasy-orc': 'a652d125b5fd5613aa5cd12649a1bd81aa3a5c049ac58eddc230adc82bde3b7d',
    'fantasy-halfling': '03095efbcec9f26176f33330844a35ffd4aa358e30d0010099a22e03a025cf6e',
  },
};

/**
 * 日文的說明（包的 note）譯成繁中（介面只有繁中，CLAUDE.md 規則 4；CC BY 允許改作）。原文和這裡記的不同時停下來
 * （原站改了說明，要重新翻譯）。其他文字照原文。寫在 LICENSE.txt「本站做的變更」。2026-10 驗證後的裁定。
 */
const NOTE_TRANSLATIONS = {
  'jp-taisho': {
    ja: '大正改元（1912）にちなむ「正」字が男女名に大流行、女性名は伝統的な仮名二字名からの「〇子」萌芽期。',
    zh: '因大正改元（1912）而起的「正」字在男女名大為流行；女性名正處在從傳統的假名二字名轉向「〇子」的萌芽期。',
  },
  'jp-showa': {
    ja: '昭和改元にちなむ「昭」字ブーム、女性名は「〇子」全盛期（和子が13年連続1位）を経て、戦後は誠・大輔など時代を象徴する名が長期支配。',
    zh: '因昭和改元而起的「昭」字熱潮；女性名經過「〇子」的全盛期（和子連續 13 年第一），戰後由誠、大輔等象徵時代的名字長期占據前段。',
  },
  'jp-modern': {
    ja: '元号との連動が薄れ、自然・和風モチーフ（翔・陽・蓮・葵）が主流化。「〇子」は退潮し、個性重視の当て字・読みが多様化。',
    zh: '名字和年號的連動變淡，自然與和風意象（翔、陽、蓮、葵）成為主流；「〇子」退潮，重視個性的借字與讀法越來越多樣。',
  },
};

/* 留下的欄位（依這個順序寫出）；其他已知的欄位拿掉（DROPPED，寫在 LICENSE.txt「本站做的變更」），不認得的欄位停下來 */
const PACK_KEEP = ['id', 'label', 'note', 'corpus_note', 'rules', 'name_order', 'name_sep'];
const PACK_DROP = ['region', 'era', 'coverage', 'license', 'license_note', 'tts', 'group'];
const PACK_LISTS = ['epithets', 'surnames', 'given'];
const SURNAME_KEEP = [
  's',
  'reading',
  'meaning',
  'note',
  'class',
  'countries',
  'f_form',
  'f_reading',
];
const SURNAME_DROP = ['weight', 'tags', 'zh'];
const GIVEN_KEEP = ['g', 'reading', 'meaning', 'note', 'class', 'countries', 'pat', 'diminutive'];
const GIVEN_DROP = ['weight', 'confidence', 'tags'];
const EPITHET_KEEP = ['e', 'meaning', 'note'];
const EPITHET_DROP = ['original'];
const GENDERS = ['m', 'f', 'u'];

function fail(message) {
  console.error(`inknomu-names：${message}`);
  process.exit(1);
}

function pickFields(obj, keep, drop, where) {
  const out = {};
  for (const k of Object.keys(obj)) {
    if (!keep.includes(k) && !drop.includes(k)) fail(`${where} 有不認得的欄位「${k}」`);
  }
  for (const k of keep) {
    const v = obj[k];
    /* 沒有值（null、空字串）的欄位不寫 */
    if (v === undefined || v === null || v === '') continue;
    out[k] = v;
  }
  return out;
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

async function download(dir) {
  mkdirSync(dir, { recursive: true });
  for (const packs of Object.values(SOURCES)) {
    for (const id of Object.keys(packs)) {
      const res = await fetch(`${BASE_URL}${id}.json`);
      if (!res.ok) fail(`下載 ${id}.json 失敗（HTTP ${res.status}）`);
      writeFileSync(path.join(dir, `${id}.json`), Buffer.from(await res.arrayBuffer()));
      console.log(`下載 ${id}.json`);
    }
  }
}

/** 一個包 → 本站的格式 */
function convertPack(id, raw) {
  if (raw.id !== id) fail(`${id}.json 的 id 是「${raw.id}」`);
  if (raw.license !== LICENSE_URL) fail(`${id}.json 的授權是「${raw.license}」，不是 CC BY 4.0`);
  for (const k of Object.keys(raw)) {
    if (![...PACK_KEEP, ...PACK_DROP, ...PACK_LISTS].includes(k))
      fail(`${id}.json 有不認得的欄位「${k}」`);
  }
  const pack = pickFields(raw, PACK_KEEP, [...PACK_DROP, ...PACK_LISTS], id);
  if (typeof pack.name_sep !== 'string') delete pack.name_sep;
  const tr = NOTE_TRANSLATIONS[id];
  if (tr) {
    if (raw.note !== tr.ja) fail(`${id} 的說明（note）和記錄的日文原文不同，要重新翻譯`);
    pack.note = tr.zh;
  }
  if (raw.epithets?.length) {
    pack.epithets = raw.epithets.map((e, i) =>
      pickFields(e, EPITHET_KEEP, EPITHET_DROP, `${id} epithets[${i}]`),
    );
  }
  pack.surnames = (raw.surnames ?? []).map((s, i) =>
    pickFields(s, SURNAME_KEEP, SURNAME_DROP, `${id} surnames[${i}]`),
  );
  pack.given = {};
  for (const k of Object.keys(raw.given ?? {})) {
    if (!GENDERS.includes(k)) fail(`${id} given 有不認得的分類「${k}」`);
  }
  for (const g of GENDERS) {
    pack.given[g] = (raw.given?.[g] ?? []).map((x, i) =>
      pickFields(x, GIVEN_KEEP, GIVEN_DROP, `${id} given.${g}[${i}]`),
    );
  }
  for (const s of pack.surnames) if (!s.s || !s.meaning) fail(`${id} 有沒有寫法或涵義的姓`);
  for (const g of GENDERS) {
    for (const x of pack.given[g]) if (!x.g || !x.meaning) fail(`${id} 有沒有寫法或涵義的名`);
  }
  return pack;
}

/** 包的摘要（開頁就要用：選單、哪些選項要出現） */
function infoOf(region, pack, sha) {
  const entries = [...pack.surnames, ...pack.given.m, ...pack.given.f, ...pack.given.u];
  const readings = entries.filter((x) => x.reading).length;
  return {
    id: pack.id,
    region,
    label: pack.label,
    neutral: pack.given.u.length > 0,
    rank: pack.surnames.some((s) => s.class),
    countries: entries.some((x) => x.countries),
    reading: readings ? (region === 'jp' ? 'kana' : 'latin') : null,
    patronymic: !pack.surnames.length && pack.rules?.patronymic?.enabled === true,
    sha256: sha,
  };
}

const HEADER = (what) => `/**
 * 弄墨 Inknomu《角色姓名產生器》的姓名資料（CC BY 4.0）${what}。由 web/scripts/inknomu-names.mjs 產生，不要手改；
 * 出處、授權與本站做的變更見同資料夾的 meta.json、LICENSE.txt 與 docs/refactor/specs/npc-names.md 2.5。
 */
`;

const SOURCE_GROUPS = ['政府和研究機構', '網站', '書籍', '作品', '其他'];

/** 資料來源清單 → sources.ts（地區照本站的順序，組與項目照原文的順序） */
function writeSources(file) {
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const out = {};
  let items = 0;
  for (const region of Object.keys(SOURCES)) {
    const groups = raw[region];
    if (!Array.isArray(groups)) fail(`資料來源沒有 ${region}`);
    out[region] = groups.map((g) => {
      if (!SOURCE_GROUPS.includes(g.group))
        fail(`${region} 的資料來源有不認得的分組「${g.group}」`);
      return {
        group: g.group,
        items: g.items.map((it) => {
          if (typeof it.text !== 'string' || !it.text) fail(`${region} 有沒有文字的資料來源`);
          items++;
          const links = (it.links ?? [])
            .filter((l) => typeof l.url === 'string' && l.url.startsWith('https://'))
            .map((l) => ({ text: String(l.text), url: l.url }));
          return links.length ? { text: it.text, links } : { text: it.text };
        }),
      };
    });
  }
  for (const region of Object.keys(raw))
    if (!(region in SOURCES)) fail(`資料來源有不認得的地區「${region}」`);
  const lines = Object.entries(out).map(
    ([region, groups]) =>
      `  ${region}: [\n${groups.map((g) => `    ${JSON.stringify(g)},`).join('\n')}\n  ],`,
  );
  const body = `/**
 * 整理自弄墨 Inknomu《角色姓名產生器》各地區頁面的資料來源（2026-10-29 取得；https://inknomu.com/namegen/<地區>）。
 * 由 web/scripts/inknomu-names.mjs 產生，不要手改；文字照原文，連結只收 https。npc-names 的「關於這份語料」打開時才載入。
 */
import type { CorpusRegion, InknomuSourceGroup } from '../corpus';

// biome-ignore format: 資料檔由腳本產生，一組一行
export const SOURCES: Readonly<Record<CorpusRegion, readonly InknomuSourceGroup[]>> = {
${lines.join('\n')}
};
`;
  writeFileSync(path.join(OUT_DIR, 'sources.ts'), body);
  console.log(`sources.ts：${items} 筆資料來源，${Buffer.byteLength(body)} 位元組`);
}

async function main() {
  const args = process.argv.slice(2);
  const sourcesAt = args.indexOf('--sources');
  const sourcesFile = sourcesAt >= 0 ? args[sourcesAt + 1] : null;
  if (sourcesAt >= 0 && !sourcesFile) fail('--sources 後面要接資料來源的 JSON 檔');
  const dir = args.find((a, i) => !a.startsWith('--') && i !== sourcesAt + 1);
  if (!dir)
    fail(
      '用法：node scripts/inknomu-names.mjs <資料包資料夾> [--download] [--sources <資料來源.json>]',
    );
  if (args.includes('--download')) await download(dir);
  if (sourcesFile) writeSources(sourcesFile);

  const catalog = [];
  let surnames = 0;
  let given = 0;
  for (const [region, packs] of Object.entries(SOURCES)) {
    const out = [];
    for (const [id, expected] of Object.entries(packs)) {
      const file = path.join(dir, `${id}.json`);
      if (!existsSync(file)) fail(`找不到 ${file}（加 --download 先下載）`);
      const buf = readFileSync(file);
      const sha = sha256(buf);
      if (sha !== expected)
        fail(
          `${id}.json 的 SHA-256 是 ${sha}，和記錄的 ${expected} 不同：原站更新了資料，先看過改了什麼再更新 SOURCES`,
        );
      const pack = convertPack(id, JSON.parse(buf.toString('utf8')));
      surnames += pack.surnames.length;
      given += GENDERS.reduce((n, g) => n + pack.given[g].length, 0);
      out.push(pack);
      catalog.push(infoOf(region, pack, sha));
    }
    const lines = [];
    for (const pack of out) {
      const { epithets, surnames: ss, given: gg, ...head } = pack;
      lines.push('  {');
      for (const [k, v] of Object.entries(head))
        lines.push(`    ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
      if (epithets) {
        lines.push('    "epithets": [');
        for (const e of epithets) lines.push(`      ${JSON.stringify(e)},`);
        lines.push('    ],');
      }
      lines.push('    "surnames": [');
      for (const s of ss) lines.push(`      ${JSON.stringify(s)},`);
      lines.push('    ],');
      lines.push('    "given": {');
      for (const g of GENDERS) {
        lines.push(`      ${JSON.stringify(g)}: [`);
        for (const x of gg[g]) lines.push(`        ${JSON.stringify(x)},`);
        lines.push('      ],');
      }
      lines.push('    },');
      lines.push('  },');
    }
    const body = `${HEADER(`：${region} 的 ${out.length} 個包`)}import type { InknomuPack } from '../corpus';

// biome-ignore format: 資料檔由腳本產生，一筆一行
export const PACKS: readonly InknomuPack[] = [
${lines.join('\n')}
];
`;
    writeFileSync(path.join(OUT_DIR, `inknomu-${region}.ts`), body);
    console.log(`inknomu-${region}.ts：${out.length} 個包，${Buffer.byteLength(body)} 位元組`);
  }
  const catalogBody = `${HEADER('：29 個包的清單（開頁就要用的部分）')}import type { InknomuPackInfo } from '../corpus';

// biome-ignore format: 資料檔由腳本產生，一個包一行
export const INKNOMU_PACKS: readonly InknomuPackInfo[] = [
${catalog.map((c) => `  ${JSON.stringify(c)},`).join('\n')}
];
`;
  writeFileSync(path.join(OUT_DIR, 'catalog.ts'), catalogBody);
  console.log(`catalog.ts：${catalog.length} 個包；姓 ${surnames} 筆、名 ${given} 筆`);
}

await main();
